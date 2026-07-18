"use server";

import { and, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, type DbExecutor } from "@/db";
import {
  clients,
  contacts,
  indicatorThresholds,
  projects,
  reportTemplates,
  reportVersions,
  reports,
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
import { INDICATOR_THRESHOLD_DEFAULTS } from "@/lib/indicators";
import { ReportGenerationError, generateReport } from "@/lib/report-generation";
import {
  ORG_TIMEZONE,
  PERIOD_RULES,
  canTransitionReport,
  clientRequiredFor,
  reportTypeSchema,
  resolvePeriod,
  sectionsSchema,
} from "@/lib/reports";
import { requireRole, requireUser, type SessionUser } from "@/lib/session";

/** Approve/send and template management: management roles (spec §32). */
const MGMT_ROLES = ["superadmin", "administrator", "director", "project_manager"] as const;

class NotFoundError extends Error {}
class RuleError extends Error {}

function fail(err: unknown): ActionState {
  if (err instanceof NotFoundError) return businessError("El reporte ya no existe.");
  if (err instanceof RuleError) return businessError(err.message);
  if (err instanceof ReportGenerationError) return businessError(err.message);
  return unexpectedError(err);
}

function refresh(id?: number) {
  revalidatePath("/reports");
  if (id) revalidatePath(`/reports/${id}`);
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
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.");

async function loadReport(tx: DbExecutor, user: SessionUser, id: number) {
  const [row] = await tx
    .select()
    .from(reports)
    .where(and(eq(reports.id, id), eq(reports.organizationId, user.organizationId)));
  if (!row) throw new NotFoundError();
  return row;
}

async function validateScope(
  tx: DbExecutor,
  orgId: number,
  data: { clientId: number | null; projectId: number | null; responsibleUserId: number | null; recipientContactId?: number | null },
) {
  if (data.clientId) {
    const [c] = await tx
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.id, data.clientId), eq(clients.organizationId, orgId)));
    if (!c) throw new RuleError("El cliente no existe en esta organización.");
  }
  if (data.projectId) {
    const [p] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, data.projectId), eq(projects.organizationId, orgId)));
    if (!p) throw new RuleError("El proyecto no existe en esta organización.");
  }
  if (data.responsibleUserId) {
    const [u] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, data.responsibleUserId), eq(users.organizationId, orgId), ne(users.role, "client")));
    if (!u) throw new RuleError("El responsable debe ser un usuario interno de la organización.");
  }
  if (data.recipientContactId) {
    const [ct] = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.id, data.recipientContactId), eq(contacts.organizationId, orgId)));
    if (!ct) throw new RuleError("El contacto destinatario no existe.");
  }
}

/* ==================================================================== create */

const createSchema = z.object({
  title: z.string("Nombre requerido.").trim().min(1, "Nombre requerido."),
  reportType: reportTypeSchema,
  clientId: optionalId,
  projectId: optionalId,
  templateId: optionalId,
  responsibleUserId: optionalId,
  recipientContactId: optionalId,
  deliveryChannel: optionalText,
  periodRule: z.enum(PERIOD_RULES).default("previous_month"),
  periodStart: z.preprocess((v) => (v === "" ? undefined : v), dateStr.optional()),
  periodEnd: z.preprocess((v) => (v === "" ? undefined : v), dateStr.optional()),
  generateNow: z.preprocess((v) => v === "on" || v === "true", z.boolean()).default(false),
});

export async function createReport(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(createSchema, formData);
  if (error) return error;

  let period: { start: string; end: string };
  if (data.periodRule === "custom") {
    if (!data.periodStart || !data.periodEnd) return businessError("Define el periodo personalizado completo.");
    if (data.periodStart > data.periodEnd) return businessError("El inicio del periodo debe ser anterior o igual al fin.");
    period = { start: data.periodStart, end: data.periodEnd };
  } else {
    period = resolvePeriod(data.periodRule, ORG_TIMEZONE, new Date());
  }
  if (clientRequiredFor(data.reportType) && !data.clientId) {
    return businessError("Este tipo de reporte requiere cliente.");
  }
  if (data.reportType === "project_report" && !data.projectId) {
    return businessError("El reporte de proyecto requiere un proyecto.");
  }

  let reportId = 0;
  try {
    await db.transaction(async (tx) => {
      await validateScope(tx, user.organizationId, data);
      if (data.templateId) {
        const [t] = await tx
          .select({ id: reportTemplates.id })
          .from(reportTemplates)
          .where(and(eq(reportTemplates.id, data.templateId), eq(reportTemplates.organizationId, user.organizationId)));
        if (!t) throw new RuleError("La plantilla no existe en esta organización.");
      }
      const [created] = await tx
        .insert(reports)
        .values({
          organizationId: user.organizationId,
          title: data.title,
          reportType: data.reportType,
          clientId: data.clientId,
          projectId: data.projectId,
          templateId: data.templateId,
          responsibleUserId: data.responsibleUserId ?? Number(user.id),
          recipientContactId: data.recipientContactId,
          deliveryChannel: data.deliveryChannel,
          periodStart: period.start,
          periodEnd: period.end,
          createdById: Number(user.id),
        })
        .returning({ id: reports.id });
      reportId = created.id;
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "report",
        entityId: reportId,
        action: "create",
        metadata: { reportType: data.reportType, period },
      });
    });
    if (data.generateNow) {
      await generateReport(user.organizationId, reportId, Number(user.id));
    }
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/reports");
  redirect(`/reports/${reportId}`);
}

/* ================================================================== generate */

export async function generateReportAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  try {
    const result = await generateReport(user.organizationId, data.id, Number(user.id));
    refresh(data.id);
    return success(`Reporte generado (versión ${result.version}).`);
  } catch (err) {
    // record the failure so the report shows the failed state with its reason
    if (err instanceof ReportGenerationError && !["not_found", "bad_status"].includes(err.code)) {
      try {
        await db.transaction(async (tx) => {
          const report = await loadReport(tx, user, data.id);
          if (canTransitionReport(report.status, "failed") || report.status === "draft") {
            await tx
              .update(reports)
              .set({ status: "failed", failureReason: err.message.slice(0, 300), updatedAt: new Date() })
              .where(eq(reports.id, report.id));
            await recordAudit(tx, {
              organizationId: user.organizationId,
              userId: Number(user.id),
              entityType: "report",
              entityId: report.id,
              action: "update",
              field: "status",
              oldValue: report.status,
              newValue: "failed",
              metadata: { event: "generation_failed", reason: err.message.slice(0, 300) },
            });
          }
        });
        refresh(data.id);
      } catch {
        // keep the original error
      }
    }
    return fail(err);
  }
}

/* ================================================================= narrative */

const narrativeSchema = z.object({
  id: z.coerce.number().int().positive(),
  title: z.string().trim().min(1, "Nombre requerido."),
  content: z.string().optional().default(""),
  executiveSummary: optionalText,
  conclusions: optionalText,
  recommendations: optionalText,
  internalNotes: optionalText,
  subject: optionalText,
});

const NARRATIVE_AUDITED = [
  "title", "content", "executiveSummary", "conclusions", "recommendations", "internalNotes", "subject",
] as const;

export async function updateReportNarrative(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(narrativeSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const before = await loadReport(tx, user, data.id);
      if (before.status === "archived" || before.status === "sent") {
        throw new RuleError("Un reporte enviado o archivado no se edita — duplícalo o crea una nueva versión.");
      }
      const patch = { ...data, id: undefined };
      const changes = diffFields(
        { organizationId: user.organizationId, userId: Number(user.id), entityType: "report", entityId: before.id },
        before,
        patch,
        NARRATIVE_AUDITED,
      );
      if (changes.length === 0) return;
      // editing an approved report never silently keeps the approval: back to review
      const demote = before.status === "approved";
      await tx
        .update(reports)
        .set({
          ...patch,
          ...(demote ? { status: "ready_for_review" as const, approvedAt: null, approvedByUserId: null } : {}),
          updatedAt: new Date(),
        })
        .where(eq(reports.id, before.id));
      await recordAudit(tx, changes);
      if (demote) {
        await recordAudit(tx, {
          organizationId: user.organizationId,
          userId: Number(user.id),
          entityType: "report",
          entityId: before.id,
          action: "update",
          field: "status",
          oldValue: "approved",
          newValue: "ready_for_review",
          metadata: { event: "approval_invalidated_by_edit" },
        });
      }
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.id);
  return success("Reporte actualizado.");
}

/* ================================================================== workflow */

export async function requestReportChanges(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(idSchema.extend({ reason: optionalText }), formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const before = await loadReport(tx, user, data.id);
      if (!canTransitionReport(before.status, "changes_requested")) {
        throw new RuleError("Solo se pueden solicitar cambios sobre un reporte en revisión.");
      }
      await tx
        .update(reports)
        .set({ status: "changes_requested", reviewedAt: new Date(), reviewedByUserId: Number(user.id), updatedAt: new Date() })
        .where(eq(reports.id, before.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "report",
        entityId: before.id,
        action: "update",
        field: "status",
        oldValue: before.status,
        newValue: "changes_requested",
        metadata: { event: "changes_requested", reason: data.reason },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.id);
  return success("Cambios solicitados.");
}

export async function approveReport(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole(...MGMT_ROLES);
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const before = await loadReport(tx, user, data.id);
      if (!canTransitionReport(before.status, "approved")) {
        throw new RuleError("Solo se aprueba un reporte listo para revisión.");
      }
      if (!before.metricsSnapshot) {
        throw new RuleError("Genera el contenido antes de aprobar.");
      }
      const now = new Date();
      await tx
        .update(reports)
        .set({ status: "approved", approvedAt: now, approvedByUserId: Number(user.id), updatedAt: now })
        .where(eq(reports.id, before.id));
      // approval always identifies a specific version (consistency check + stamp)
      const [stamped] = await tx
        .update(reportVersions)
        .set({ approvedByUserId: Number(user.id), approvedAt: now })
        .where(and(eq(reportVersions.reportId, before.id), eq(reportVersions.versionNumber, before.version)))
        .returning({ id: reportVersions.id });
      if (!stamped) throw new RuleError("No existe la versión a aprobar — regenera el reporte.");
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "report",
        entityId: before.id,
        action: "update",
        field: "status",
        oldValue: before.status,
        newValue: "approved",
        metadata: { event: "approved", version: before.version },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.id);
  return success("Reporte aprobado.");
}

const sentSchema = idSchema.extend({
  deliveryChannel: z.string().trim().min(1, "Indica el canal."),
  recipientContactId: optionalId,
  recipientText: optionalText,
  sentDate: dateStr,
  notes: optionalText,
  exceptionReason: optionalText,
});

export async function markReportSent(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole(...MGMT_ROLES);
  const { data, error } = parseForm(sentSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const before = await loadReport(tx, user, data.id);
      const isException = before.status !== "approved";
      if (isException && !canTransitionReport(before.status, "sent")) {
        // only ready_for_review may be sent as an audited exception
        if (before.status !== "ready_for_review") {
          throw new RuleError("Solo se marca enviado un reporte aprobado (o en revisión, como excepción con motivo).");
        }
      }
      if (isException && !data.exceptionReason) {
        throw new RuleError("Enviar sin aprobación requiere un motivo de excepción.");
      }
      if (data.recipientContactId) {
        await validateScope(tx, user.organizationId, {
          clientId: null,
          projectId: null,
          responsibleUserId: null,
          recipientContactId: data.recipientContactId,
        });
      }
      const now = new Date();
      await tx
        .update(reports)
        .set({
          status: "sent",
          sentAt: now,
          sentByUserId: Number(user.id),
          deliveryChannel: data.deliveryChannel,
          recipientContactId: data.recipientContactId,
          updatedAt: now,
        })
        .where(eq(reports.id, before.id));
      await tx
        .update(reportVersions)
        .set({ sentAt: now })
        .where(and(eq(reportVersions.reportId, before.id), eq(reportVersions.versionNumber, before.version)));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "report",
        entityId: before.id,
        action: "update",
        field: "status",
        oldValue: before.status,
        newValue: "sent",
        metadata: {
          event: isException ? "sent_with_exception" : "sent",
          version: before.version,
          channel: data.deliveryChannel,
          recipientContactId: data.recipientContactId,
          sentDate: data.sentDate,
          notes: data.notes,
          ...(isException ? { exceptionReason: data.exceptionReason } : {}),
        },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.id);
  return success("Reporte marcado como enviado (sin envío real de correo).");
}

/* ============================================================ lifecycle misc */

export async function duplicateReport(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  let newId = 0;
  try {
    await db.transaction(async (tx) => {
      const before = await loadReport(tx, user, data.id);
      const [created] = await tx
        .insert(reports)
        .values({
          organizationId: user.organizationId,
          title: `${before.title} (copia)`,
          reportType: before.reportType,
          clientId: before.clientId,
          projectId: before.projectId,
          templateId: before.templateId,
          responsibleUserId: before.responsibleUserId,
          periodStart: before.periodStart,
          periodEnd: before.periodEnd,
          createdById: Number(user.id),
        })
        .returning({ id: reports.id });
      newId = created.id;
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "report",
        entityId: newId,
        action: "create",
        metadata: { event: "duplicated_from", sourceId: before.id },
      });
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/reports");
  redirect(`/reports/${newId}`);
}

export async function archiveReport(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const before = await loadReport(tx, user, data.id);
      if (before.status === "archived") return;
      await tx
        .update(reports)
        .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(reports.id, before.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "report",
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
  return success("Reporte archivado (historial y versiones conservados).");
}

export async function restoreReport(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const before = await loadReport(tx, user, data.id);
      if (before.status !== "archived") throw new RuleError("El reporte no está archivado.");
      await tx
        .update(reports)
        .set({ status: "draft", archivedAt: null, updatedAt: new Date() })
        .where(eq(reports.id, before.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "report",
        entityId: before.id,
        action: "update",
        field: "status",
        oldValue: "archived",
        newValue: "draft",
        metadata: { event: "restored" },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.id);
  return success("Reporte restaurado como borrador.");
}

export async function deleteReport(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const me = await requireRole("superadmin");
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const before = await loadReport(tx, me, data.id);
      await tx.delete(reports).where(eq(reports.id, before.id)); // versions cascade
      await recordAudit(tx, {
        organizationId: me.organizationId,
        userId: Number(me.id),
        entityType: "report",
        entityId: before.id,
        action: "delete",
        metadata: { values: { title: before.title, status: before.status, version: before.version } },
      });
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/reports");
  return success("Reporte eliminado permanentemente.");
}

/* ================================================================= templates */

const templateSchema = z.object({
  name: z.string("Nombre requerido.").trim().min(1, "Nombre requerido."),
  reportType: reportTypeSchema,
  description: optionalText,
  sectionsJson: z.string().optional().default(""),
  includeLogo: z.preprocess((v) => v === "on" || v === "true", z.boolean()).default(true),
  includeCover: z.preprocess((v) => v === "on" || v === "true", z.boolean()).default(true),
  includeExecutiveSummary: z.preprocess((v) => v === "on" || v === "true", z.boolean()).default(true),
  includeConclusions: z.preprocess((v) => v === "on" || v === "true", z.boolean()).default(true),
  includeRecommendations: z.preprocess((v) => v === "on" || v === "true", z.boolean()).default(false),
});

function parseSections(raw: string) {
  if (!raw.trim()) return null;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new RuleError("Las secciones no son un JSON válido.");
  }
  const parsed = sectionsSchema.safeParse(json);
  if (!parsed.success) throw new RuleError("Las secciones tienen un formato inválido.");
  return parsed.data;
}

export async function saveReportTemplate(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole(...MGMT_ROLES);
  const idRaw = formData.get("id");
  const { data, error } = parseForm(templateSchema, formData);
  if (error) return error;
  try {
    const sections = parseSections(String(formData.get("sectionsJson") ?? ""));
    await db.transaction(async (tx) => {
      if (idRaw) {
        const id = Number(idRaw);
        const [before] = await tx
          .select()
          .from(reportTemplates)
          .where(and(eq(reportTemplates.id, id), eq(reportTemplates.organizationId, user.organizationId)));
        if (!before) throw new NotFoundError();
        await tx
          .update(reportTemplates)
          .set({ ...data, sections, updatedAt: new Date() })
          .where(eq(reportTemplates.id, id));
        await recordAudit(tx, {
          organizationId: user.organizationId,
          userId: Number(user.id),
          entityType: "report_template",
          entityId: id,
          action: "update",
          metadata: { name: data.name },
        });
      } else {
        const [created] = await tx
          .insert(reportTemplates)
          .values({ ...data, sections, organizationId: user.organizationId, createdById: Number(user.id) })
          .returning({ id: reportTemplates.id });
        await recordAudit(tx, {
          organizationId: user.organizationId,
          userId: Number(user.id),
          entityType: "report_template",
          entityId: created.id,
          action: "create",
          metadata: { name: data.name, reportType: data.reportType },
        });
      }
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/reports/templates");
  return success("Plantilla guardada.");
}

/* ================================================================ thresholds */

export async function setIndicatorThreshold(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole("superadmin", "administrator");
  const { data, error } = parseForm(
    z.object({
      key: z.string().refine((k) => k in INDICATOR_THRESHOLD_DEFAULTS, "Umbral desconocido."),
      value: z.coerce.number().min(0).max(100000),
    }),
    formData,
  );
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(indicatorThresholds)
        .where(and(eq(indicatorThresholds.organizationId, user.organizationId), eq(indicatorThresholds.key, data.key)));
      const oldValue = existing ? existing.value : String(INDICATOR_THRESHOLD_DEFAULTS[data.key].value);
      await tx
        .insert(indicatorThresholds)
        .values({
          organizationId: user.organizationId,
          key: data.key,
          value: String(data.value),
          updatedById: Number(user.id),
        })
        .onConflictDoUpdate({
          target: [indicatorThresholds.organizationId, indicatorThresholds.key],
          set: { value: String(data.value), updatedById: Number(user.id), updatedAt: new Date() },
        });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "indicator_threshold",
        entityId: existing?.id ?? 0,
        action: existing ? "update" : "create",
        field: data.key,
        oldValue,
        newValue: String(data.value),
      });
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/indicators");
  return success("Umbral actualizado.");
}
