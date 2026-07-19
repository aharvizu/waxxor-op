import { and, eq, isNull, lte, sql } from "drizzle-orm";
import { db, type DbExecutor } from "@/db";
import {
  organizationSettings,
  activities,
  companies,
  contacts,
  projectLists,
  projects,
  recurrenceDefinitions,
  recurrenceExecutions,
  tickets,
  users,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { recurrenceDefaultsSchema } from "@/lib/settings";
import {
  RECURRENCE_BATCH_LIMIT,
  RECURRENCE_MAX_BACKFILL,
  RECURRENCE_MAX_CONSECUTIVE_FAILURES,
  GenerationError,
  TemplateRenderError,
  addDays,
  isExhausted,
  nextOccurrenceLocal,
  occurrenceRunAt,
  renderTemplate,
  templateDataSchema,
  todayInTz,
  type LocalDate,
  type ScheduleFields,
  type TemplateContext,
  type TemplateData,
} from "@/lib/recurrence";
import { createReportForRecurrence } from "@/lib/report-generation";
import { resolvePeriod } from "@/lib/reports";
import { buildSlaSnapshot, getOrgCalendar, resolveSlaDefinition } from "@/lib/sla";
import type { SessionUser } from "@/lib/session";
import { createWorkItem } from "@/lib/work-items";

/**
 * Domain engine for Recurrences — independent of the UI. Called by the cron
 * route (scheduler), server actions (manual/retry/skip/backfill) and the
 * local dev script. See docs/architecture/recurrence-idempotency.md.
 */

type Definition = typeof recurrenceDefinitions.$inferSelect;

export type EngineOutcome =
  | { kind: "succeeded"; entityType: string; entityId: number; folio?: string }
  | { kind: "skipped"; reason: string }
  | { kind: "duplicate_prevented" }
  | { kind: "failed"; code: string; message: string };

function toSchedule(def: Definition): ScheduleFields {
  return {
    frequency: def.frequency,
    interval: def.interval,
    daysOfWeek: (def.daysOfWeek as number[] | null) ?? null,
    dayOfMonth: def.dayOfMonth,
    monthOfYear: def.monthOfYear,
    weekOfMonth: def.weekOfMonth,
    timeOfDay: def.timeOfDay,
    timezone: def.timezone,
    startAt: def.startAt,
    endAt: def.endAt,
  };
}

/** Builds a real, accountable actor (the definition's creator) for generated work. */
async function actorFor(tx: DbExecutor, def: Definition): Promise<SessionUser> {
  const actorId = def.createdById;
  if (actorId) {
    const [row] = await tx
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(and(eq(users.id, actorId), eq(users.organizationId, def.organizationId)));
    if (row) return { id: String(row.id), role: row.role, organizationId: def.organizationId };
  }
  const [fallback] = await tx
    .select({ id: users.id, role: users.role })
    .from(users)
    .where(and(eq(users.organizationId, def.organizationId), eq(users.role, "superadmin")))
    .limit(1);
  if (!fallback) throw new GenerationError("definition_corrupt", "No hay usuario válido para atribuir la generación.");
  return { id: String(fallback.id), role: fallback.role, organizationId: def.organizationId };
}

/* -------------------------------------------------------------- context */

type Context = {
  client: { id: number; name: string; status: string } | null;
  contact: { id: number; name: string } | null;
  project: { id: number; name: string; status: string } | null;
  projectList: { id: number; status: string } | null;
  assignee: { id: number; name: string; role: string } | null;
};

async function loadContext(
  tx: DbExecutor,
  def: Definition,
  contactId: number | null,
): Promise<Context> {
  const [client, contact, project, list, assignee] = await Promise.all([
    def.companyId
      ? tx
          .select({ id: companies.id, name: companies.name, status: companies.status })
          .from(companies)
          .where(and(eq(companies.id, def.companyId), eq(companies.organizationId, def.organizationId)))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    contactId
      ? tx
          .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, isActive: contacts.isActive })
          .from(contacts)
          .where(and(eq(contacts.id, contactId), eq(contacts.organizationId, def.organizationId)))
          .then((r) => (r[0] ? { id: r[0].id, name: `${r[0].firstName} ${r[0].lastName}`, isActive: r[0].isActive } : null))
      : Promise.resolve(null),
    def.projectId
      ? tx
          .select({ id: projects.id, name: projects.name, status: projects.status })
          .from(projects)
          .where(and(eq(projects.id, def.projectId), eq(projects.organizationId, def.organizationId)))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    def.projectListId
      ? tx
          .select({ id: projectLists.id, status: projectLists.status })
          .from(projectLists)
          .where(eq(projectLists.id, def.projectListId))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    def.assigneeId
      ? tx
          .select({ id: users.id, name: users.name, role: users.role, isActive: sql<boolean>`true` })
          .from(users)
          .where(and(eq(users.id, def.assigneeId), eq(users.organizationId, def.organizationId)))
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);
  return {
    client,
    contact: contact ? { id: contact.id, name: contact.name } : null,
    project,
    projectList: list,
    assignee: assignee ? { id: assignee.id, name: assignee.name, role: assignee.role } : null,
  };
}

const NON_OPERATIONAL_PROJECT_STATUSES = ["completed", "cancelled", "archived"];

/** Validates the context is safe to generate against — throws GenerationError otherwise. */
function assertContextValid(def: Definition, ctx: Context, templateData: TemplateData) {
  if (def.companyId) {
    if (!ctx.client) throw new GenerationError("client_missing", "El cliente ya no existe.");
    if (ctx.client.status === "archived" || ctx.client.status === "inactive") {
      throw new GenerationError("client_archived", `El cliente está ${ctx.client.status}.`);
    }
  }
  if (def.assigneeId && !ctx.assignee) {
    throw new GenerationError("assignee_inactive", "El responsable ya no es un usuario interno válido.");
  }
  if (templateData.targetType === "project_activity") {
    if (!ctx.project) throw new GenerationError("client_missing", "El proyecto ya no existe.");
    if (NON_OPERATIONAL_PROJECT_STATUSES.includes(ctx.project.status)) {
      throw new GenerationError(
        "project_not_operational",
        `El proyecto está en estado "${ctx.project.status}".`,
      );
    }
    if (!ctx.projectList) throw new GenerationError("list_missing", "La lista ya no existe.");
    if (ctx.projectList.status === "archived") {
      throw new GenerationError("list_archived", "La lista está archivada.");
    }
  }
  if (templateData.targetType === "ticket" && templateData.contactId && !ctx.contact) {
    throw new GenerationError("contact_missing", "El contacto configurado ya no existe.");
  }
}

/* -------------------------------------------------------------- generate */

async function generateEntity(
  tx: DbExecutor,
  def: Definition,
  actor: SessionUser,
  templateData: TemplateData,
  occurrenceLocal: LocalDate,
  ctx: Context,
): Promise<{ entityType: string; entityId: number; folio?: string }> {
  const renderCtx: TemplateContext = {
    client: ctx.client ? { name: ctx.client.name } : null,
    contact: ctx.contact,
    project: ctx.project ? { name: ctx.project.name } : null,
    assignee: ctx.assignee,
    recurrence: { name: def.name },
    occurrence: { date: occurrenceLocal },
  };

  let title: string;
  let description: string;
  try {
    title = renderTemplate(templateData.title, renderCtx);
    description =
      "description" in templateData && templateData.description
        ? renderTemplate(templateData.description, renderCtx)
        : "";
  } catch (err) {
    if (err instanceof TemplateRenderError) {
      throw new GenerationError("variable_unresolved", err.message);
    }
    throw err;
  }

  if (templateData.targetType === "activity" || templateData.targetType === "project_activity") {
    const dueDate =
      templateData.dueOffsetDays !== null ? addDays(occurrenceLocal, templateData.dueOffsetDays) : null;
    const startDate =
      templateData.startOffsetDays !== null
        ? addDays(occurrenceLocal, templateData.startOffsetDays)
        : null;
    const item = await createWorkItem(tx, actor, {
      type: "activity",
      title,
      description: description || null,
      status: "pending",
      priority: templateData.priority,
      companyId: ctx.client?.id ?? null,
      assigneeId: ctx.assignee?.id ?? null,
      startDate,
      dueDate,
      estimatedMinutes: templateData.estimatedMinutes,
    });
    const [activity] = await tx
      .insert(activities)
      .values({
        organizationId: def.organizationId,
        workItemId: item.id,
        activityType: (templateData.activityType as (typeof activities.$inferSelect)["activityType"]) ?? "general",
        ...(templateData.targetType === "project_activity"
          ? { projectId: def.projectId, projectListId: def.projectListId }
          : {}),
      })
      .returning({ id: activities.id });
    await recordAudit(tx, {
      organizationId: def.organizationId,
      userId: Number(actor.id),
      entityType: "activity",
      entityId: activity.id,
      action: "create",
      source: "system",
      metadata: {
        workItemId: item.id,
        generatedByRecurrenceId: def.id,
        occurrence: occurrenceLocal,
      },
    });
    return { entityType: "activity", entityId: activity.id };
  }

  if (templateData.targetType === "ticket") {
    if (!ctx.client) throw new GenerationError("client_missing", "Los tickets requieren cliente.");
    const dueDate =
      templateData.dueOffsetDays !== null ? addDays(occurrenceLocal, templateData.dueOffsetDays) : null;
    const item = await createWorkItem(tx, actor, {
      type: "ticket",
      title,
      description: description || null,
      status: ctx.assignee ? "assigned" : "new",
      priority: templateData.priority,
      companyId: ctx.client.id,
      assigneeId: ctx.assignee?.id ?? null,
      dueDate,
    });
    const definition = await resolveSlaDefinition(
      tx,
      def.organizationId,
      templateData.priority,
      templateData.slaDefinitionId,
    );
    if (templateData.slaDefinitionId && !definition) {
      throw new GenerationError("sla_missing", "El SLA configurado ya no está activo.");
    }
    const snapshot = definition
      ? buildSlaSnapshot(definition, await getOrgCalendar(tx, def.organizationId), new Date())
      : {};
    const [ticket] = await tx
      .insert(tickets)
      .values({
        organizationId: def.organizationId,
        workItemId: item.id,
        folio: sql`'TK-' || lpad(nextval('ticket_folio_seq')::text, 6, '0')`,
        category: templateData.category,
        subcategory: templateData.subcategory || null,
        channel: templateData.channel,
        modality: templateData.modality,
        contact: ctx.contact?.name ?? null,
        ...snapshot,
      })
      .returning({ id: tickets.id, folio: tickets.folio });
    await recordAudit(tx, {
      organizationId: def.organizationId,
      userId: Number(actor.id),
      entityType: "ticket",
      entityId: ticket.id,
      action: "create",
      source: "system",
      metadata: {
        workItemId: item.id,
        folio: ticket.folio,
        generatedByRecurrenceId: def.id,
        occurrence: occurrenceLocal,
        sla: definition ? { id: definition.id, name: definition.name } : null,
      },
    });
    return { entityType: "ticket", entityId: ticket.id, folio: ticket.folio };
  }

  if (templateData.targetType === "report") {
    // Creates the Report in draft with its period resolved (spec Reportes §13):
    // content generation and the review/approval flow stay human-driven —
    // never auto-approved, never auto-sent.
    const period = resolvePeriod(templateData.periodRule, def.timezone, occurrenceRunAt(toSchedule(def), occurrenceLocal));
    const { reportId } = await createReportForRecurrence(tx, {
      organizationId: def.organizationId,
      title,
      companyId: ctx.client?.id ?? null,
      projectId: ctx.project?.id ?? null,
      templateId: templateData.templateId,
      responsibleUserId: ctx.assignee?.id ?? Number(actor.id),
      periodStart: period.start,
      periodEnd: period.end,
      createdById: Number(actor.id),
      recurrenceId: def.id,
    });
    return { entityType: "report", entityId: reportId };
  }

  throw new GenerationError("target_unsupported", "Tipo de generación no soportado.");
}

/* ---------------------------------------------------------- single occurrence */

export type ExecutionSource = (typeof recurrenceExecutions.$inferSelect)["executionSource"];

/**
 * Runs (or reserves) ONE occurrence, end to end, in a single transaction.
 * Idempotent: the (definitionId, occurrenceKey) unique index means a second
 * concurrent caller for the same key gets `duplicate_prevented`, never a
 * second object. On configuration/permanent errors the definition's
 * consecutive-failure counter advances and may flip status to "error".
 */
export async function executeOccurrence(
  organizationId: number,
  definitionId: number,
  occurrenceKey: string,
  scheduledFor: Date,
  source: ExecutionSource,
  executedByUserId: number | null,
): Promise<EngineOutcome> {
  return db.transaction(async (tx) => {
    const [def] = await tx
      .select()
      .from(recurrenceDefinitions)
      .where(
        and(
          eq(recurrenceDefinitions.id, definitionId),
          eq(recurrenceDefinitions.organizationId, organizationId),
        ),
      )
      .for("update");
    if (!def) return { kind: "failed", code: "definition_corrupt", message: "Recurrencia no encontrada." };

    // Reservation: unique index on (recurrenceDefinitionId, occurrenceKey) is
    // the actual idempotency guard — a concurrent second caller loses the race here.
    const [reserved] = await tx
      .insert(recurrenceExecutions)
      .values({
        organizationId,
        recurrenceDefinitionId: definitionId,
        occurrenceKey,
        scheduledFor,
        status: "running",
        startedAt: new Date(),
        attemptCount: 1,
        executionSource: source,
        executedByUserId,
      })
      .onConflictDoNothing()
      .returning({ id: recurrenceExecutions.id });

    if (!reserved) {
      return { kind: "duplicate_prevented" };
    }
    const executionId = reserved.id;

    const templateResult = templateDataSchema.safeParse(def.templateData);
    if (!templateResult.success) {
      await failExecution(tx, def, executionId, "template_invalid", "La plantilla guardada es inválida.");
      return { kind: "failed", code: "template_invalid", message: "La plantilla guardada es inválida." };
    }
    const templateData = templateResult.data;

    try {
      const contactId = templateData.targetType === "ticket" ? templateData.contactId : null;
      const ctx = await loadContext(tx, def, contactId);
      assertContextValid(def, ctx, templateData);
      const actor = await actorFor(tx, def);
      const occurrenceLocal = todayInTz(scheduledFor, def.timezone);
      const result = await generateEntity(tx, def, actor, templateData, occurrenceLocal, ctx);

      await tx
        .update(recurrenceExecutions)
        .set({
          status: "succeeded",
          completedAt: new Date(),
          generatedEntityType: result.entityType,
          generatedEntityId: result.entityId,
          metadata: result.folio ? { folio: result.folio } : null,
          updatedAt: new Date(),
        })
        .where(eq(recurrenceExecutions.id, executionId));

      await advanceSchedule(tx, def, true);
      return { kind: "succeeded", ...result };
    } catch (err) {
      const code = err instanceof GenerationError ? err.code : "timeout";
      const message = err instanceof Error ? err.message : "Error desconocido.";
      await failExecution(tx, def, executionId, code, message);
      return { kind: "failed", code, message };
    }
  });
}

async function failExecution(
  tx: DbExecutor,
  def: Definition,
  executionId: number,
  code: string,
  message: string,
) {
  // never persist raw stack traces or secrets — message is a bounded, human string
  const safeMessage = message.slice(0, 500);
  await tx
    .update(recurrenceExecutions)
    .set({
      status: "failed",
      completedAt: new Date(),
      errorCode: code,
      errorMessage: safeMessage,
      updatedAt: new Date(),
    })
    .where(eq(recurrenceExecutions.id, executionId));
  await advanceSchedule(tx, def, false);
}

/**
 * Consecutive-failure limit before auto-pausing: configurable per organization
 * (Settings -> Recurrentes), falling back to the engine constant.
 */
async function orgFailureLimit(tx: DbExecutor, orgId: number): Promise<number> {
  const [row] = await tx
    .select({ value: organizationSettings.value })
    .from(organizationSettings)
    .where(
      and(
        eq(organizationSettings.organizationId, orgId),
        eq(organizationSettings.key, "recurrence.defaults"),
      ),
    );
  if (!row) return RECURRENCE_MAX_CONSECUTIVE_FAILURES;
  const parsed = recurrenceDefaultsSchema.safeParse(row.value);
  return parsed.success ? parsed.data.maxConsecutiveFailures : RECURRENCE_MAX_CONSECUTIVE_FAILURES;
}

/** Advances counters + nextRunAt, and applies the auto-pause-on-failures policy. */
async function advanceSchedule(tx: DbExecutor, def: Definition, success: boolean) {
  const schedule = toSchedule(def);
  const nowRef = def.nextRunAt ?? new Date();
  const nextLocal = nextOccurrenceLocal(schedule, todayInTz(nowRef, def.timezone), false);
  const exhausted = isExhausted({
    occurrenceCount: def.occurrenceCount + 1,
    maxOccurrences: def.maxOccurrences,
    endAt: def.endAt,
    nextLocal,
  });

  const consecutiveFailedCount = success ? 0 : def.consecutiveFailedCount + 1;
  const failureLimit = success
    ? RECURRENCE_MAX_CONSECUTIVE_FAILURES
    : await orgFailureLimit(tx, def.organizationId);
  const autoErrored = !success && consecutiveFailedCount >= failureLimit;

  let status = def.status;
  let isActive = def.isActive;
  if (autoErrored) {
    status = "error";
    isActive = false;
  } else if (exhausted) {
    status = def.maxOccurrences !== null && def.occurrenceCount + 1 >= (def.maxOccurrences ?? Infinity)
      ? "completed"
      : "expired";
    isActive = false;
  }

  await tx
    .update(recurrenceDefinitions)
    .set({
      occurrenceCount: def.occurrenceCount + 1,
      successfulCount: success ? def.successfulCount + 1 : def.successfulCount,
      failedCount: success ? def.failedCount : def.failedCount + 1,
      consecutiveFailedCount,
      lastRunAt: new Date(),
      lastSuccessfulRunAt: success ? new Date() : def.lastSuccessfulRunAt,
      lastFailedRunAt: success ? def.lastFailedRunAt : new Date(),
      nextRunAt: status === "active" && nextLocal ? occurrenceRunAt(schedule, nextLocal) : null,
      status,
      isActive,
      updatedAt: new Date(),
    })
    .where(eq(recurrenceDefinitions.id, def.id));

  if (autoErrored) {
    await recordAudit(tx, {
      organizationId: def.organizationId,
      userId: def.createdById ?? null,
      entityType: "recurrence_definition",
      entityId: def.id,
      action: "update",
      field: "status",
      oldValue: def.status,
      newValue: "error",
      source: "system",
      metadata: { event: "auto_paused_on_failures", consecutiveFailedCount },
    });
  } else if (exhausted && status !== def.status) {
    await recordAudit(tx, {
      organizationId: def.organizationId,
      userId: def.createdById ?? null,
      entityType: "recurrence_definition",
      entityId: def.id,
      action: "update",
      field: "status",
      oldValue: def.status,
      newValue: status,
      source: "system",
      metadata: { event: status === "completed" ? "auto_completed" : "auto_expired" },
    });
  }
}

/* --------------------------------------------------------------- batch run */

export type BatchResult = {
  processed: number;
  succeeded: number;
  failed: number;
  duplicatePrevented: number;
  outcomes: Array<{ definitionId: number; name: string } & EngineOutcome>;
};

/**
 * Processes all due recurrences (any organization) — one occurrence each,
 * isolated try/catch per definition so a single failure never breaks the batch.
 */
export async function runDueRecurrences(batchLimit = RECURRENCE_BATCH_LIMIT): Promise<BatchResult> {
  const now = new Date();
  const due = await db
    .select({ id: recurrenceDefinitions.id, organizationId: recurrenceDefinitions.organizationId, name: recurrenceDefinitions.name })
    .from(recurrenceDefinitions)
    .where(
      and(
        eq(recurrenceDefinitions.status, "active"),
        eq(recurrenceDefinitions.isActive, true),
        isNull(recurrenceDefinitions.archivedAt),
        lte(recurrenceDefinitions.nextRunAt, now),
      ),
    )
    .orderBy(recurrenceDefinitions.nextRunAt)
    .limit(batchLimit);

  const outcomes: BatchResult["outcomes"] = [];
  for (const row of due) {
    try {
      const [def] = await db
        .select()
        .from(recurrenceDefinitions)
        .where(eq(recurrenceDefinitions.id, row.id));
      if (!def || !def.nextRunAt) continue;
      const occurrenceKey = todayInTz(def.nextRunAt, def.timezone);
      const outcome = await executeOccurrence(
        row.organizationId,
        row.id,
        occurrenceKey,
        def.nextRunAt,
        "scheduler",
        null,
      );
      outcomes.push({ definitionId: row.id, name: row.name, ...outcome });
    } catch (err) {
      outcomes.push({
        definitionId: row.id,
        name: row.name,
        kind: "failed",
        code: "timeout",
        message: err instanceof Error ? err.message.slice(0, 500) : "Error desconocido.",
      });
    }
  }
  return {
    processed: outcomes.length,
    succeeded: outcomes.filter((o) => o.kind === "succeeded").length,
    failed: outcomes.filter((o) => o.kind === "failed").length,
    duplicatePrevented: outcomes.filter((o) => o.kind === "duplicate_prevented").length,
    outcomes,
  };
}

/* --------------------------------------------------------------- manual ops */

/** "Run now": generates an out-of-band occurrence, tracked with its own key. */
export async function runManually(
  organizationId: number,
  definitionId: number,
  executedByUserId: number,
): Promise<EngineOutcome> {
  const [def] = await db
    .select()
    .from(recurrenceDefinitions)
    .where(
      and(
        eq(recurrenceDefinitions.id, definitionId),
        eq(recurrenceDefinitions.organizationId, organizationId),
      ),
    );
  if (!def) return { kind: "failed", code: "definition_corrupt", message: "Recurrencia no encontrada." };
  const now = new Date();
  const occurrenceKey = `manual-${now.getTime()}`;
  return executeOccurrence(organizationId, definitionId, occurrenceKey, now, "manual", executedByUserId);
}

/** Retries a FAILED execution, reusing the same occurrenceKey (no duplicate). */
export async function retryExecution(
  organizationId: number,
  executionId: number,
  executedByUserId: number,
): Promise<EngineOutcome> {
  return db.transaction(async (tx) => {
    const [exec] = await tx
      .select()
      .from(recurrenceExecutions)
      .where(
        and(
          eq(recurrenceExecutions.id, executionId),
          eq(recurrenceExecutions.organizationId, organizationId),
        ),
      )
      .for("update");
    if (!exec) return { kind: "failed", code: "definition_corrupt", message: "Ejecución no encontrada." };
    if (exec.status !== "failed") {
      return { kind: "failed", code: "definition_corrupt", message: "Solo se pueden reintentar ejecuciones fallidas." };
    }
    const [def] = await tx
      .select()
      .from(recurrenceDefinitions)
      .where(eq(recurrenceDefinitions.id, exec.recurrenceDefinitionId))
      .for("update");
    if (!def) return { kind: "failed", code: "definition_corrupt", message: "Recurrencia no encontrada." };

    const templateResult = templateDataSchema.safeParse(def.templateData);
    if (!templateResult.success) {
      await failExecutionRetry(tx, exec.id, "template_invalid", "La plantilla guardada es inválida.");
      return { kind: "failed", code: "template_invalid", message: "La plantilla guardada es inválida." };
    }
    const templateData = templateResult.data;

    try {
      const contactId = templateData.targetType === "ticket" ? templateData.contactId : null;
      const ctx = await loadContext(tx, def, contactId);
      assertContextValid(def, ctx, templateData);
      const actor = await actorFor(tx, def);
      const occurrenceLocal = todayInTz(exec.scheduledFor, def.timezone);
      const result = await generateEntity(tx, def, actor, templateData, occurrenceLocal, ctx);

      await tx
        .update(recurrenceExecutions)
        .set({
          status: "succeeded",
          completedAt: new Date(),
          attemptCount: exec.attemptCount + 1,
          executionSource: "retry",
          executedByUserId,
          generatedEntityType: result.entityType,
          generatedEntityId: result.entityId,
          errorCode: null,
          errorMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(recurrenceExecutions.id, exec.id));
      await tx
        .update(recurrenceDefinitions)
        .set({
          successfulCount: def.successfulCount + 1,
          failedCount: Math.max(0, def.failedCount - 1),
          consecutiveFailedCount: 0,
          lastSuccessfulRunAt: new Date(),
          ...(def.status === "error" ? { status: "paused" as const } : {}),
        })
        .where(eq(recurrenceDefinitions.id, def.id));
      await recordAudit(tx, {
        organizationId,
        userId: executedByUserId,
        entityType: "recurrence_execution",
        entityId: exec.id,
        action: "update",
        field: "status",
        oldValue: "failed",
        newValue: "succeeded",
        metadata: { event: "retried", attempt: exec.attemptCount + 1 },
      });
      return { kind: "succeeded", ...result };
    } catch (err) {
      const code = err instanceof GenerationError ? err.code : "timeout";
      const message = err instanceof Error ? err.message : "Error desconocido.";
      await failExecutionRetry(tx, exec.id, code, message, exec.attemptCount + 1);
      return { kind: "failed", code, message };
    }
  });
}

async function failExecutionRetry(
  tx: DbExecutor,
  executionId: number,
  code: string,
  message: string,
  attemptCount?: number,
) {
  await tx
    .update(recurrenceExecutions)
    .set({
      status: "failed",
      completedAt: new Date(),
      errorCode: code,
      errorMessage: message.slice(0, 500),
      executionSource: "retry",
      ...(attemptCount !== undefined ? { attemptCount } : {}),
      updatedAt: new Date(),
    })
    .where(eq(recurrenceExecutions.id, executionId));
}

/** Skips the currently-due occurrence: records a `skipped` execution, advances the schedule. */
export async function skipNextOccurrence(
  organizationId: number,
  definitionId: number,
  actorUserId: number,
  reason: string | null,
): Promise<{ ok: true } | { ok: false; message: string }> {
  return db.transaction(async (tx) => {
    const [def] = await tx
      .select()
      .from(recurrenceDefinitions)
      .where(
        and(
          eq(recurrenceDefinitions.id, definitionId),
          eq(recurrenceDefinitions.organizationId, organizationId),
        ),
      )
      .for("update");
    if (!def) return { ok: false, message: "Recurrencia no encontrada." };
    if (!def.nextRunAt) return { ok: false, message: "No hay una próxima ejecución que omitir." };

    const occurrenceKey = todayInTz(def.nextRunAt, def.timezone);
    const [reserved] = await tx
      .insert(recurrenceExecutions)
      .values({
        organizationId,
        recurrenceDefinitionId: definitionId,
        occurrenceKey,
        scheduledFor: def.nextRunAt,
        status: "skipped",
        startedAt: new Date(),
        completedAt: new Date(),
        executionSource: "manual",
        executedByUserId: actorUserId,
        metadata: reason ? { reason } : null,
      })
      .onConflictDoNothing()
      .returning({ id: recurrenceExecutions.id });
    if (!reserved) return { ok: false, message: "Esa ocurrencia ya fue procesada." };

    const schedule = toSchedule(def);
    const nextLocal = nextOccurrenceLocal(schedule, todayInTz(def.nextRunAt, def.timezone), false);
    const exhausted = isExhausted({
      occurrenceCount: def.occurrenceCount + 1,
      maxOccurrences: def.maxOccurrences,
      endAt: def.endAt,
      nextLocal,
    });
    await tx
      .update(recurrenceDefinitions)
      .set({
        occurrenceCount: def.occurrenceCount + 1,
        skippedCount: def.skippedCount + 1,
        nextRunAt: !exhausted && nextLocal ? occurrenceRunAt(schedule, nextLocal) : null,
        status: exhausted ? (def.maxOccurrences !== null ? "completed" : "expired") : def.status,
        isActive: exhausted ? false : def.isActive,
        updatedAt: new Date(),
      })
      .where(eq(recurrenceDefinitions.id, def.id));
    await recordAudit(tx, {
      organizationId,
      userId: actorUserId,
      entityType: "recurrence_definition",
      entityId: def.id,
      action: "update",
      metadata: { event: "occurrence_skipped", reason, occurrenceKey },
    });
    return { ok: true };
  });
}

/** Backfill: generates missed occurrences in [from, to] as separate executions. Preview-safe (dry=true). */
export async function backfillOccurrences(
  organizationId: number,
  definitionId: number,
  fromLocal: LocalDate,
  toLocal: LocalDate,
  actorUserId: number,
  dry = false,
): Promise<{ dates: LocalDate[]; results?: EngineOutcome[] }> {
  const [def] = await db
    .select()
    .from(recurrenceDefinitions)
    .where(
      and(
        eq(recurrenceDefinitions.id, definitionId),
        eq(recurrenceDefinitions.organizationId, organizationId),
      ),
    );
  if (!def) return { dates: [] };
  const schedule = toSchedule(def);
  const dates: LocalDate[] = [];
  let cursor = fromLocal;
  let inclusive = true;
  for (let i = 0; i < RECURRENCE_MAX_BACKFILL + 1; i++) {
    const next = nextOccurrenceLocal(schedule, cursor, inclusive);
    inclusive = false;
    if (!next || next > toLocal) break;
    dates.push(next);
    cursor = next;
  }
  const limited = dates.slice(0, RECURRENCE_MAX_BACKFILL);
  if (dry) return { dates: limited };

  const results: EngineOutcome[] = [];
  for (const local of limited) {
    const scheduledFor = occurrenceRunAt(schedule, local);
    const outcome = await executeOccurrence(
      organizationId,
      definitionId,
      local,
      scheduledFor,
      "backfill",
      actorUserId,
    );
    results.push(outcome);
  }
  await db.transaction(async (tx) => {
    await recordAudit(tx, {
      organizationId,
      userId: actorUserId,
      entityType: "recurrence_definition",
      entityId: definitionId,
      action: "update",
      metadata: { event: "backfill", from: fromLocal, to: toLocal, count: limited.length },
    });
  });
  return { dates: limited, results };
}
