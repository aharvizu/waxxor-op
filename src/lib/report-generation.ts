import { and, eq, sql } from "drizzle-orm";
import { db, type DbExecutor } from "@/db";
import {
  clients,
  projects,
  reportTemplates,
  reportVersions,
  reports,
} from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { computePeriodMetrics, type PeriodMetrics } from "@/lib/report-metrics";
import {
  buildNarrative,
  canTransitionReport,
  defaultSections,
  sectionsSchema,
  type ReportSection,
} from "@/lib/reports";

/**
 * Report generation service — independent of the UI, used by server actions
 * and by the Recurrences engine. Metrics are computed with read-only queries
 * BEFORE the write transaction; every write (version + report + audit) commits
 * atomically. See docs/features/report-generation.md.
 */

export class ReportGenerationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

export type GenerationResult = {
  reportId: number;
  version: number;
  metrics: PeriodMetrics;
};

function resolveSections(template: typeof reportTemplates.$inferSelect | null): ReportSection[] {
  if (template?.sections) {
    const parsed = sectionsSchema.safeParse(template.sections);
    if (parsed.success) return parsed.data;
  }
  return defaultSections();
}

/**
 * Generates (or regenerates) a report's content: computes real period metrics,
 * freezes them as snapshots, writes the next immutable version and moves the
 * report to ready_for_review. Throws ReportGenerationError on business blocks.
 */
export async function generateReport(
  orgId: number,
  reportId: number,
  actorUserId: number,
): Promise<GenerationResult> {
  const [report] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.id, reportId), eq(reports.organizationId, orgId)));
  if (!report) throw new ReportGenerationError("not_found", "El reporte no existe.");
  if (!report.periodStart || !report.periodEnd) {
    throw new ReportGenerationError("no_period", "Define el periodo antes de generar.");
  }
  if (report.periodStart > report.periodEnd) {
    throw new ReportGenerationError("bad_period", "El periodo es inválido.");
  }
  if (!canTransitionReport(report.status, "generating")) {
    throw new ReportGenerationError(
      "bad_status",
      `No se puede generar desde el estado "${report.status}".`,
    );
  }
  if (report.clientId) {
    const [client] = await db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(and(eq(clients.id, report.clientId), eq(clients.organizationId, orgId)));
    if (!client) throw new ReportGenerationError("bad_client", "El cliente no existe en esta organización.");
  }
  if (report.projectId) {
    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, report.projectId), eq(projects.organizationId, orgId)));
    if (!project) throw new ReportGenerationError("bad_project", "El proyecto no existe en esta organización.");
  }
  const template = report.templateId
    ? (
        await db
          .select()
          .from(reportTemplates)
          .where(and(eq(reportTemplates.id, report.templateId), eq(reportTemplates.organizationId, orgId)))
      )[0] ?? null
    : null;

  // Read-only aggregation, outside the write transaction.
  const metrics = await computePeriodMetrics(
    orgId,
    { start: report.periodStart, end: report.periodEnd },
    { clientId: report.clientId, projectId: report.projectId },
  );
  const narrative = buildNarrative({
    periodStart: report.periodStart,
    periodEnd: report.periodEnd,
    ticketsCreated: metrics.tickets.created,
    ticketsClosed: metrics.tickets.closed,
    slaEvaluated: metrics.sla.evaluated,
    slaMet: metrics.sla.met,
    activitiesCompleted: metrics.activities.completed,
    totalMinutes: metrics.time.total,
    billableMinutes: metrics.time.billable,
  });
  const sections = resolveSections(template);
  const contentSnapshot = {
    sections,
    narrativeBaseline: narrative,
    template: template ? { id: template.id, name: template.name } : null,
    generatedFor: { clientId: report.clientId, projectId: report.projectId },
  };

  return db.transaction(async (tx) => {
    // regenerating over existing content = next version; first run = version 1
    const [{ maxVersion }] = await tx
      .select({ maxVersion: sql<number>`coalesce(max(${reportVersions.versionNumber}), 0)::int` })
      .from(reportVersions)
      .where(eq(reportVersions.reportId, report.id));
    const nextVersion = maxVersion + 1;

    await tx.insert(reportVersions).values({
      organizationId: orgId,
      reportId: report.id,
      versionNumber: nextVersion,
      contentSnapshot,
      metricsSnapshot: metrics,
      narrative,
      executiveSummary: report.executiveSummary,
      conclusions: report.conclusions,
      recommendations: report.recommendations,
      authorId: actorUserId,
      changeReason: nextVersion === 1 ? null : "Regeneración",
    });
    await tx
      .update(reports)
      .set({
        status: "ready_for_review",
        contentSnapshot,
        metricsSnapshot: metrics,
        // the editable narrative is only seeded when empty — edits survive regeneration
        content: report.content.trim() === "" ? narrative : report.content,
        version: nextVersion,
        generatedAt: new Date(),
        generatedByUserId: actorUserId,
        failureReason: null,
        updatedAt: new Date(),
      })
      .where(eq(reports.id, report.id));
    await recordAudit(tx, {
      organizationId: orgId,
      userId: actorUserId,
      entityType: "report",
      entityId: report.id,
      action: "update",
      metadata: {
        event: nextVersion === 1 ? "generated" : "regenerated",
        version: nextVersion,
        period: { start: report.periodStart, end: report.periodEnd },
      },
    });
    return { reportId: report.id, version: nextVersion, metrics };
  });
}

/**
 * Recurrence-engine entry point: creates the Report row inside the engine's
 * transaction. Content generation happens on the NEXT step (the report lands
 * in draft; the engine immediately calls generateReport after its transaction
 * commits — see recurrence-engine.ts). Never auto-approves, never auto-sends.
 */
export async function createReportForRecurrence(
  tx: DbExecutor,
  input: {
    organizationId: number;
    title: string;
    clientId: number | null;
    projectId: number | null;
    templateId: number | null;
    responsibleUserId: number | null;
    periodStart: string;
    periodEnd: string;
    createdById: number;
    recurrenceId: number;
  },
): Promise<{ reportId: number }> {
  const [created] = await tx
    .insert(reports)
    .values({
      organizationId: input.organizationId,
      title: input.title,
      reportType: input.clientId ? "monthly_service" : "custom_internal",
      status: "draft",
      clientId: input.clientId,
      projectId: input.projectId,
      templateId: input.templateId,
      responsibleUserId: input.responsibleUserId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      createdById: input.createdById,
    })
    .returning({ id: reports.id });
  await recordAudit(tx, {
    organizationId: input.organizationId,
    userId: input.createdById,
    entityType: "report",
    entityId: created.id,
    action: "create",
    source: "system",
    metadata: {
      generatedByRecurrenceId: input.recurrenceId,
      period: { start: input.periodStart, end: input.periodEnd },
    },
  });
  return { reportId: created.id };
}
