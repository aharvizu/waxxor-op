"use server";

import { and, eq, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, type DbExecutor } from "@/db";
import {
  companies,
  projectLists,
  projects,
  recurrenceDefinitions,
  slaDefinitions,
  users,
} from "@/db/schema";
import {
  type ActionState,
  businessError,
  parseForm,
  success,
  unexpectedError,
} from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import {
  ENABLED_TARGET_TYPES,
  RECURRENCE_MAX_BACKFILL,
  computeNextRun,
  isValidTimezone,
  templateDataSchema,
  usedVariables,
  TEMPLATE_VARIABLES,
  type ScheduleFields,
} from "@/lib/recurrence";
import {
  backfillOccurrences,
  retryExecution,
  runManually,
  skipNextOccurrence,
} from "@/lib/recurrence-engine";
import { requireRole, requireUser, type SessionUser } from "@/lib/session";

/** Manage roles per spec §27; Technician creates/runs but not backfill/hard-delete. */
const MGMT_ROLES = ["superadmin", "administrator", "director", "project_manager"] as const;
const CREATE_ROLES = [...MGMT_ROLES, "technician"] as const;

class NotFoundError extends Error {}
class RuleError extends Error {}

function fail(err: unknown): ActionState {
  if (err instanceof NotFoundError) return businessError("La recurrencia ya no existe.");
  if (err instanceof RuleError) return businessError(err.message);
  return unexpectedError(err);
}

function refresh(id?: number) {
  revalidatePath("/recurring");
  if (id) revalidatePath(`/recurring/${id}`);
}

const idSchema = z.object({ id: z.coerce.number().int().positive() });
const optionalText = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim() || null);
const optionalId = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number().int().positive().nullable(),
);
const optionalDate = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.").nullable(),
);
const optionalInt = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number().int().positive().nullable(),
);

async function loadDefinition(tx: DbExecutor, user: SessionUser, id: number) {
  const [row] = await tx
    .select()
    .from(recurrenceDefinitions)
    .where(and(eq(recurrenceDefinitions.id, id), eq(recurrenceDefinitions.organizationId, user.organizationId)));
  if (!row) throw new NotFoundError();
  return row;
}

async function orgUserId(tx: DbExecutor, orgId: number, id: number | null) {
  if (id === null) return null;
  const [row] = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, id), eq(users.organizationId, orgId), ne(users.role, "client")));
  return row?.id ?? null;
}

function canEditDefinition(user: SessionUser, def: typeof recurrenceDefinitions.$inferSelect): boolean {
  if ((MGMT_ROLES as readonly string[]).includes(user.role)) return true;
  // Technician: edit only what they created (spec §27).
  return def.createdById === Number(user.id);
}

/* ================================================================== schema */

const scheduleSchema = z
  .object({
    frequency: z.enum(["daily", "weekly", "monthly", "quarterly", "semiannual", "annual", "weekdays", "custom"]),
    interval: z.coerce.number().int().min(1).max(52).default(1),
    daysOfWeek: z
      .array(z.coerce.number().int().min(1).max(7))
      .optional()
      .default([]),
    dayOfMonth: optionalInt,
    monthOfYear: optionalInt,
    weekOfMonth: optionalInt,
    timeOfDay: z.string().regex(/^\d{2}:\d{2}$/, "Hora inválida."),
    timezone: z.string().min(1, "Zona horaria requerida.").refine(isValidTimezone, "Zona horaria inválida."),
    startAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de inicio requerida."),
    endAt: optionalDate,
    maxOccurrences: optionalInt,
  })
  .refine((s) => s.dayOfMonth === null || s.dayOfMonth === -1 || (s.dayOfMonth >= 1 && s.dayOfMonth <= 31), {
    message: "Día del mes inválido.",
    path: ["dayOfMonth"],
  })
  .refine((s) => !s.endAt || s.endAt >= s.startAt, {
    message: "La fecha de fin debe ser posterior al inicio.",
    path: ["endAt"],
  });

const definitionCoreSchema = z.object({
  name: z.string("Nombre requerido.").trim().min(1, "Nombre requerido."),
  description: optionalText,
  targetType: z.enum(ENABLED_TARGET_TYPES, "Selecciona un tipo soportado."),
  companyId: optionalId,
  projectId: optionalId,
  projectListId: optionalId,
  assigneeId: optionalId,
});

function parseTemplateJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new RuleError("La plantilla no es un JSON válido.");
  }
}

function validateTemplateVariables(templateData: Record<string, unknown>) {
  for (const field of ["title", "description"]) {
    const text = templateData[field];
    if (typeof text !== "string") continue;
    for (const v of usedVariables(text)) {
      if (!(TEMPLATE_VARIABLES as readonly string[]).includes(v)) {
        throw new RuleError(`Variable no permitida en la plantilla: {{${v}}}`);
      }
    }
  }
}

async function validateContext(
  tx: DbExecutor,
  orgId: number,
  data: { companyId: number | null; projectId: number | null; projectListId: number | null; assigneeId: number | null },
) {
  if (data.companyId) {
    const [client] = await tx
      .select({ id: companies.id })
      .from(companies)
      .where(and(eq(companies.id, data.companyId), eq(companies.organizationId, orgId)));
    if (!client) throw new RuleError("El cliente no existe en esta organización.");
  }
  if (data.projectId) {
    const [project] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, data.projectId), eq(projects.organizationId, orgId)));
    if (!project) throw new RuleError("El proyecto no existe en esta organización.");
    if (data.projectListId) {
      const [list] = await tx
        .select({ id: projectLists.id })
        .from(projectLists)
        .where(and(eq(projectLists.id, data.projectListId), eq(projectLists.projectId, data.projectId)));
      if (!list) throw new RuleError("La lista no pertenece a ese proyecto.");
    }
  }
  return {
    assigneeId: await orgUserId(tx, orgId, data.assigneeId),
  };
}

async function validateSlaDefinition(tx: DbExecutor, orgId: number, slaDefinitionId: number | null) {
  if (!slaDefinitionId) return;
  const [row] = await tx
    .select({ id: slaDefinitions.id })
    .from(slaDefinitions)
    .where(
      and(
        eq(slaDefinitions.id, slaDefinitionId),
        eq(slaDefinitions.organizationId, orgId),
        eq(slaDefinitions.status, "active"),
      ),
    );
  if (!row) throw new RuleError("El SLA seleccionado no existe o no está activo.");
}

/* =============================================================== create */

export async function createRecurrence(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole(...CREATE_ROLES);
  const core = definitionCoreSchema.safeParse(Object.fromEntries(formData));
  if (!core.success) {
    return {
      ok: false,
      kind: "validation",
      message: "Revisa los campos marcados.",
      fieldErrors: z.flattenError(core.error).fieldErrors as Record<string, string[]>,
    };
  }
  const schedule = scheduleSchema.safeParse(Object.fromEntries(formData));
  if (!schedule.success) {
    return {
      ok: false,
      kind: "validation",
      message: "Revisa la frecuencia.",
      fieldErrors: z.flattenError(schedule.error).fieldErrors as Record<string, string[]>,
    };
  }
  const activate = formData.get("activate") === "true";
  let templateRaw: unknown;
  try {
    templateRaw = parseTemplateJson(String(formData.get("templateData") ?? "{}"));
  } catch (err) {
    return fail(err);
  }
  const template = templateDataSchema.safeParse(templateRaw);
  if (!template.success) {
    return businessError("La plantilla es inválida para el tipo seleccionado.");
  }
  if (template.data.targetType !== core.data.targetType) {
    return businessError("La plantilla no coincide con el tipo seleccionado.");
  }
  if (core.data.targetType === "project_activity" && (!core.data.projectId || !core.data.projectListId)) {
    return businessError("Actividad de proyecto requiere Proyecto y Lista.");
  }

  let id = 0;
  try {
    await db.transaction(async (tx) => {
      try {
        validateTemplateVariables(template.data as unknown as Record<string, unknown>);
      } catch (err) {
        throw err instanceof RuleError ? err : new RuleError("Plantilla inválida.");
      }
      if (template.data.targetType === "ticket") {
        await validateSlaDefinition(tx, user.organizationId, template.data.slaDefinitionId);
      }
      const resolved = await validateContext(tx, user.organizationId, core.data);
      const s: ScheduleFields = {
        frequency: schedule.data.frequency,
        interval: schedule.data.interval,
        daysOfWeek: schedule.data.daysOfWeek.length > 0 ? schedule.data.daysOfWeek : null,
        dayOfMonth: schedule.data.dayOfMonth,
        monthOfYear: schedule.data.monthOfYear,
        weekOfMonth: schedule.data.weekOfMonth,
        timeOfDay: schedule.data.timeOfDay,
        timezone: schedule.data.timezone,
        startAt: schedule.data.startAt,
        endAt: schedule.data.endAt,
      };
      const next = computeNextRun(s, new Date());

      const [created] = await tx
        .insert(recurrenceDefinitions)
        .values({
          organizationId: user.organizationId,
          name: core.data.name,
          description: core.data.description,
          targetType: core.data.targetType,
          status: activate ? "active" : "draft",
          isActive: activate,
          timezone: s.timezone,
          scheduleType: "calendar",
          frequency: s.frequency,
          interval: s.interval,
          daysOfWeek: s.daysOfWeek,
          dayOfMonth: s.dayOfMonth,
          monthOfYear: s.monthOfYear,
          weekOfMonth: s.weekOfMonth,
          timeOfDay: s.timeOfDay,
          startAt: s.startAt,
          endAt: s.endAt,
          maxOccurrences: schedule.data.maxOccurrences,
          nextRunAt: activate ? (next?.runAt ?? null) : null,
          companyId: core.data.companyId,
          projectId: core.data.projectId,
          projectListId: core.data.projectListId,
          assigneeId: resolved.assigneeId,
          templateData: template.data,
          createdById: Number(user.id),
        })
        .returning({ id: recurrenceDefinitions.id });
      id = created.id;
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "recurrence_definition",
        entityId: id,
        action: "create",
        metadata: { name: core.data.name, targetType: core.data.targetType, activated: activate },
      });
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/recurring");
  redirect(`/recurring/${id}`);
}

/* =============================================================== update */

const REC_AUDITED = [
  "name", "description", "companyId", "projectId", "projectListId", "assigneeId",
  "timezone", "frequency", "interval", "dayOfMonth", "monthOfYear", "weekOfMonth",
  "timeOfDay", "startAt", "endAt", "maxOccurrences",
] as const;

export async function updateRecurrence(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (!(CREATE_ROLES as readonly string[]).includes(user.role)) {
    return businessError("No tienes permiso para editar recurrencias.");
  }
  const idResult = idSchema.safeParse(Object.fromEntries(formData));
  if (!idResult.success) return businessError("Identificador inválido.");
  const core = definitionCoreSchema.safeParse(Object.fromEntries(formData));
  if (!core.success) {
    return {
      ok: false,
      kind: "validation",
      message: "Revisa los campos marcados.",
      fieldErrors: z.flattenError(core.error).fieldErrors as Record<string, string[]>,
    };
  }
  const schedule = scheduleSchema.safeParse(Object.fromEntries(formData));
  if (!schedule.success) {
    return {
      ok: false,
      kind: "validation",
      message: "Revisa la frecuencia.",
      fieldErrors: z.flattenError(schedule.error).fieldErrors as Record<string, string[]>,
    };
  }
  let templateRaw: unknown;
  try {
    templateRaw = parseTemplateJson(String(formData.get("templateData") ?? "{}"));
  } catch (err) {
    return fail(err);
  }
  const template = templateDataSchema.safeParse(templateRaw);
  if (!template.success) return businessError("La plantilla es inválida.");

  try {
    await db.transaction(async (tx) => {
      const before = await loadDefinition(tx, user, idResult.data.id);
      if (!canEditDefinition(user, before)) {
        throw new RuleError("Solo puedes editar recurrencias que creaste.");
      }
      try {
        validateTemplateVariables(template.data as unknown as Record<string, unknown>);
      } catch (err) {
        throw err instanceof RuleError ? err : new RuleError("Plantilla inválida.");
      }
      if (template.data.targetType === "ticket") {
        await validateSlaDefinition(tx, user.organizationId, template.data.slaDefinitionId);
      }
      const resolved = await validateContext(tx, user.organizationId, core.data);
      const s: ScheduleFields = {
        frequency: schedule.data.frequency,
        interval: schedule.data.interval,
        daysOfWeek: schedule.data.daysOfWeek.length > 0 ? schedule.data.daysOfWeek : null,
        dayOfMonth: schedule.data.dayOfMonth,
        monthOfYear: schedule.data.monthOfYear,
        weekOfMonth: schedule.data.weekOfMonth,
        timeOfDay: schedule.data.timeOfDay,
        timezone: schedule.data.timezone,
        startAt: schedule.data.startAt,
        endAt: schedule.data.endAt,
      };
      const next = before.status === "active" ? computeNextRun(s, new Date()) : null;

      const patch = {
        name: core.data.name,
        description: core.data.description,
        companyId: core.data.companyId,
        projectId: core.data.projectId,
        projectListId: core.data.projectListId,
        assigneeId: resolved.assigneeId,
        timezone: s.timezone,
        frequency: s.frequency,
        interval: s.interval,
        daysOfWeek: s.daysOfWeek,
        dayOfMonth: s.dayOfMonth,
        monthOfYear: s.monthOfYear,
        weekOfMonth: s.weekOfMonth,
        timeOfDay: s.timeOfDay,
        startAt: s.startAt,
        endAt: s.endAt,
        maxOccurrences: schedule.data.maxOccurrences,
      };
      const changes = diffFields(
        { organizationId: user.organizationId, userId: Number(user.id), entityType: "recurrence_definition", entityId: before.id },
        before,
        patch,
        REC_AUDITED,
      );
      await tx
        .update(recurrenceDefinitions)
        .set({
          ...patch,
          templateData: template.data,
          nextRunAt: before.status === "active" ? (next?.runAt ?? null) : before.nextRunAt,
          updatedById: Number(user.id),
          updatedAt: new Date(),
        })
        .where(eq(recurrenceDefinitions.id, before.id));
      if (changes.length > 0) await recordAudit(tx, changes);
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "recurrence_definition",
        entityId: before.id,
        action: "update",
        metadata: { event: "template_updated" },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(idResult.data.id);
  return success("Recurrencia actualizada.");
}

/* ========================================================= lifecycle actions */

export async function activateRecurrence(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const before = await loadDefinition(tx, user, data.id);
      if (!canEditDefinition(user, before)) throw new RuleError("No tienes permiso sobre esta recurrencia.");
      if (before.status !== "draft" && before.status !== "paused") {
        throw new RuleError("Solo se puede activar desde borrador o pausada.");
      }
      const s: ScheduleFields = {
        frequency: before.frequency,
        interval: before.interval,
        daysOfWeek: before.daysOfWeek as number[] | null,
        dayOfMonth: before.dayOfMonth,
        monthOfYear: before.monthOfYear,
        weekOfMonth: before.weekOfMonth,
        timeOfDay: before.timeOfDay,
        timezone: before.timezone,
        startAt: before.startAt,
        endAt: before.endAt,
      };
      const next = computeNextRun(s, new Date());
      await tx
        .update(recurrenceDefinitions)
        .set({
          status: "active",
          isActive: true,
          nextRunAt: next?.runAt ?? null,
          consecutiveFailedCount: 0,
          pauseReason: null,
          updatedAt: new Date(),
        })
        .where(eq(recurrenceDefinitions.id, before.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "recurrence_definition",
        entityId: before.id,
        action: "update",
        field: "status",
        oldValue: before.status,
        newValue: "active",
        metadata: { event: "activated" },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.id);
  return success("Recurrencia activada.");
}

export async function pauseRecurrence(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(idSchema.extend({ reason: optionalText }), formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const before = await loadDefinition(tx, user, data.id);
      if (!canEditDefinition(user, before)) throw new RuleError("No tienes permiso sobre esta recurrencia.");
      if (before.status !== "active") throw new RuleError("Solo se puede pausar una recurrencia activa.");
      await tx
        .update(recurrenceDefinitions)
        .set({ status: "paused", isActive: false, pauseReason: data.reason, updatedAt: new Date() })
        .where(eq(recurrenceDefinitions.id, before.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "recurrence_definition",
        entityId: before.id,
        action: "update",
        field: "status",
        oldValue: "active",
        newValue: "paused",
        metadata: { event: "paused", reason: data.reason },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.id);
  return success("Recurrencia pausada.");
}

export async function reactivateRecurrence(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(
    idSchema.extend({ mode: z.enum(["next_future", "recalculate"]).default("next_future") }),
    formData,
  );
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const before = await loadDefinition(tx, user, data.id);
      if (!canEditDefinition(user, before)) throw new RuleError("No tienes permiso sobre esta recurrencia.");
      if (before.status !== "paused" && before.status !== "error") {
        throw new RuleError("Solo se puede reactivar desde pausada o con error.");
      }
      const s: ScheduleFields = {
        frequency: before.frequency,
        interval: before.interval,
        daysOfWeek: before.daysOfWeek as number[] | null,
        dayOfMonth: before.dayOfMonth,
        monthOfYear: before.monthOfYear,
        weekOfMonth: before.weekOfMonth,
        timeOfDay: before.timeOfDay,
        timezone: before.timezone,
        startAt: before.startAt,
        endAt: before.endAt,
      };
      // "next_future" recomputes from now (same math); "recalculate" is identical
      // in this MVP since there's no separate pending-occurrence queue to resume.
      const next = computeNextRun(s, new Date());
      await tx
        .update(recurrenceDefinitions)
        .set({
          status: "active",
          isActive: true,
          nextRunAt: next?.runAt ?? null,
          consecutiveFailedCount: 0,
          pauseReason: null,
          updatedAt: new Date(),
        })
        .where(eq(recurrenceDefinitions.id, before.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "recurrence_definition",
        entityId: before.id,
        action: "update",
        field: "status",
        oldValue: before.status,
        newValue: "active",
        metadata: { event: "reactivated", mode: data.mode },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.id);
  return success("Recurrencia reactivada.");
}

export async function finishRecurrence(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const before = await loadDefinition(tx, user, data.id);
      if (!canEditDefinition(user, before)) throw new RuleError("No tienes permiso sobre esta recurrencia.");
      if (["completed", "expired", "archived"].includes(before.status)) {
        throw new RuleError("La recurrencia ya está finalizada.");
      }
      await tx
        .update(recurrenceDefinitions)
        .set({ status: "completed", isActive: false, nextRunAt: null, updatedAt: new Date() })
        .where(eq(recurrenceDefinitions.id, before.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "recurrence_definition",
        entityId: before.id,
        action: "update",
        field: "status",
        oldValue: before.status,
        newValue: "completed",
        metadata: { event: "finished" },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.id);
  return success("Recurrencia finalizada.");
}

export async function archiveRecurrence(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole(...MGMT_ROLES);
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const before = await loadDefinition(tx, user, data.id);
      if (before.archivedAt) return;
      await tx
        .update(recurrenceDefinitions)
        .set({ archivedAt: new Date(), isActive: false, status: "archived", updatedAt: new Date() })
        .where(eq(recurrenceDefinitions.id, before.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "recurrence_definition",
        entityId: before.id,
        action: "update",
        field: "status",
        oldValue: before.status,
        newValue: "archived",
        metadata: { event: "archived" },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.id);
  return success("Recurrencia archivada.");
}

/** Restore never re-activates automatically — always lands as paused/draft. */
export async function restoreRecurrence(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole(...MGMT_ROLES);
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const before = await loadDefinition(tx, user, data.id);
      if (!before.archivedAt) throw new RuleError("La recurrencia no está archivada.");
      const restored = before.occurrenceCount > 0 ? "paused" : "draft";
      await tx
        .update(recurrenceDefinitions)
        .set({ archivedAt: null, status: restored, isActive: false, updatedAt: new Date() })
        .where(eq(recurrenceDefinitions.id, before.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "recurrence_definition",
        entityId: before.id,
        action: "update",
        field: "status",
        oldValue: "archived",
        newValue: restored,
        metadata: { event: "restored" },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.id);
  return success("Recurrencia restaurada.");
}

/** SuperAdmin-only permanent deletion; blocked while it has executions. */
export async function deleteRecurrence(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const me = await requireRole("superadmin");
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const before = await loadDefinition(tx, me, data.id);
      const [work] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(sql`recurrence_executions`)
        .where(sql`recurrence_definition_id = ${before.id} and status = 'succeeded'`);
      if (work.n > 0) {
        throw new RuleError("Esta recurrencia generó objetos — archívala en lugar de eliminarla.");
      }
      await tx.delete(recurrenceDefinitions).where(eq(recurrenceDefinitions.id, before.id));
      await recordAudit(tx, {
        organizationId: me.organizationId,
        userId: Number(me.id),
        entityType: "recurrence_definition",
        entityId: before.id,
        action: "delete",
        metadata: { values: { name: before.name, status: before.status } },
      });
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/recurring");
  return success("Recurrencia eliminada permanentemente.");
}

/* ================================================================== duplicate */

export async function duplicateRecurrence(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole(...CREATE_ROLES);
  const { data, error } = parseForm(idSchema.extend({ name: z.string().trim().min(1, "Nombre requerido.") }), formData);
  if (error) return error;
  let newId = 0;
  try {
    await db.transaction(async (tx) => {
      const before = await loadDefinition(tx, user, data.id);
      const resolved = await validateContext(tx, user.organizationId, {
        companyId: before.companyId,
        projectId: before.projectId,
        projectListId: before.projectListId,
        assigneeId: before.assigneeId,
      });
      const [created] = await tx
        .insert(recurrenceDefinitions)
        .values({
          organizationId: user.organizationId,
          name: data.name,
          description: before.description,
          targetType: before.targetType,
          status: "draft",
          isActive: false,
          timezone: before.timezone,
          scheduleType: before.scheduleType,
          frequency: before.frequency,
          interval: before.interval,
          daysOfWeek: before.daysOfWeek,
          dayOfMonth: before.dayOfMonth,
          monthOfYear: before.monthOfYear,
          weekOfMonth: before.weekOfMonth,
          timeOfDay: before.timeOfDay,
          startAt: before.startAt,
          endAt: before.endAt,
          maxOccurrences: before.maxOccurrences,
          nextRunAt: null,
          companyId: before.companyId,
          projectId: before.projectId,
          projectListId: before.projectListId,
          assigneeId: resolved.assigneeId,
          templateData: before.templateData,
          createdById: Number(user.id),
        })
        .returning({ id: recurrenceDefinitions.id });
      newId = created.id;
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "recurrence_definition",
        entityId: newId,
        action: "create",
        metadata: { event: "duplicated_from", sourceId: before.id },
      });
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/recurring");
  redirect(`/recurring/${newId}`);
}

/* =================================================================== execute */

export async function runRecurrenceNow(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  try {
    const def = await db.transaction((tx) => loadDefinition(tx, user, data.id));
    if (!canEditDefinition(user, def)) return businessError("No tienes permiso sobre esta recurrencia.");
    const outcome = await runManually(user.organizationId, data.id, Number(user.id));
    refresh(data.id);
    if (outcome.kind === "succeeded") return success(`Generado: ${outcome.entityType} #${outcome.entityId}.`);
    if (outcome.kind === "duplicate_prevented") return businessError("Esa ocurrencia ya fue procesada.");
    return businessError(outcome.kind === "failed" ? outcome.message : "No se pudo ejecutar.");
  } catch (err) {
    return fail(err);
  }
}

export async function retryRecurrenceExecution(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(
    z.object({ executionId: z.coerce.number().int().positive(), definitionId: z.coerce.number().int().positive() }),
    formData,
  );
  if (error) return error;
  try {
    const def = await db.transaction((tx) => loadDefinition(tx, user, data.definitionId));
    if (!canEditDefinition(user, def)) return businessError("No tienes permiso sobre esta recurrencia.");
    const outcome = await retryExecution(user.organizationId, data.executionId, Number(user.id));
    refresh(data.definitionId);
    if (outcome.kind === "succeeded") return success(`Generado: ${outcome.entityType} #${outcome.entityId}.`);
    return businessError(outcome.kind === "failed" ? outcome.message : "No se pudo reintentar.");
  } catch (err) {
    return fail(err);
  }
}

export async function skipNextRecurrenceOccurrence(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(idSchema.extend({ reason: optionalText }), formData);
  if (error) return error;
  const def = await db.transaction((tx) => loadDefinition(tx, user, data.id).catch(() => null));
  if (!def) return businessError("La recurrencia ya no existe.");
  if (!canEditDefinition(user, def)) return businessError("No tienes permiso sobre esta recurrencia.");
  const result = await skipNextOccurrence(user.organizationId, data.id, Number(user.id), data.reason);
  refresh(data.id);
  return result.ok ? success("Ocurrencia omitida.") : businessError(result.message);
}

const backfillSchema = z.object({
  id: z.coerce.number().int().positive(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inicial requerida."),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha final requerida."),
  confirm: z.preprocess((v) => v === "on" || v === "true", z.boolean()).default(false),
});

/** SuperAdmin/Administrator/Director only (spec §27 — PM excluded from backfill). */
export async function backfillRecurrence(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole("superadmin", "administrator", "director");
  const { data, error } = parseForm(backfillSchema, formData);
  if (error) return error;
  if (data.to < data.from) return businessError("El rango de fechas es inválido.");
  if (!data.confirm) return businessError("Confirma el backfill antes de ejecutarlo.");
  try {
    const result = await backfillOccurrences(user.organizationId, data.id, data.from, data.to, Number(user.id), false);
    refresh(data.id);
    const succeeded = result.results?.filter((r) => r.kind === "succeeded").length ?? 0;
    const failed = result.results?.filter((r) => r.kind === "failed").length ?? 0;
    return success(`Backfill: ${succeeded} generado(s), ${failed} fallido(s) de ${result.dates.length} (límite ${RECURRENCE_MAX_BACKFILL}).`);
  } catch (err) {
    return fail(err);
  }
}
