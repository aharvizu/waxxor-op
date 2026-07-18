import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { reports } from "@/db/schema";
import { auth } from "@/auth";
import { recordAudit } from "@/lib/audit";
import { canAccessInternalPortal } from "@/lib/roles";
import type { PeriodMetrics } from "@/lib/report-metrics";
import { toCsv } from "@/lib/reports";

/**
 * CSV export of a report's frozen metrics snapshot. Org-scoped, authenticated,
 * CSV-injection-safe (see csvEscape). Datasets: summary | tickets | time | sla.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  const user = session?.user;
  if (!user || !user.organizationId || !canAccessInternalPortal(user.role)) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { id } = await params;
  const reportId = Number(id);
  if (!Number.isInteger(reportId)) return new Response("Not found", { status: 404 });

  const [report] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.id, reportId), eq(reports.organizationId, user.organizationId)));
  if (!report) return new Response("Not found", { status: 404 });
  const metrics = report.metricsSnapshot as PeriodMetrics | null;
  if (!metrics) return new Response("Report has no generated content", { status: 409 });

  const url = new URL(req.url);
  const dataset = url.searchParams.get("dataset") ?? "summary";

  let csv: string;
  let filename: string;
  switch (dataset) {
    case "tickets":
      csv = toCsv(
        ["dimension", "clave", "creados", "cerrados"],
        [
          ...metrics.tickets.byStatus.map((r) => ["estado", r.key, r.created, r.closed] as [string, string, number, number]),
          ...metrics.tickets.byPriority.map((r) => ["prioridad", r.key, r.created, r.closed] as [string, string, number, number]),
          ...metrics.tickets.byAssignee.map((r) => ["tecnico", r.key, r.created, r.closed] as [string, string, number, number]),
          ...metrics.tickets.byCategory.map((r) => ["categoria", r.key, r.created, r.closed] as [string, string, number, number]),
        ],
      );
      filename = `reporte-${reportId}-tickets.csv`;
      break;
    case "time":
      csv = toCsv(
        ["dimension", "clave", "minutos"],
        [
          ...metrics.time.byUser.map((r) => ["persona", r.key, r.minutes] as [string, string, number]),
          ...metrics.time.byClient.map((r) => ["cliente", r.key, r.minutes] as [string, string, number]),
          ...metrics.time.byModality.map((r) => ["modalidad", r.key, r.minutes] as [string, string, number]),
        ],
      );
      filename = `reporte-${reportId}-tiempo.csv`;
      break;
    case "sla":
      csv = toCsv(
        ["prioridad", "evaluados", "cumplidos"],
        metrics.sla.byPriority.map((r) => [r.key, r.evaluated, r.met]),
      );
      filename = `reporte-${reportId}-sla.csv`;
      break;
    default:
      csv = toCsv(
        ["metrica", "valor"],
        [
          ["Periodo inicio", metrics.period.start],
          ["Periodo fin", metrics.period.end],
          ["Tickets creados", metrics.tickets.created],
          ["Tickets cerrados", metrics.tickets.closed],
          ["Tickets abiertos al final", metrics.tickets.openAtEnd],
          ["Tickets reabiertos", metrics.tickets.reopened],
          ["SLA evaluados", metrics.sla.evaluated],
          ["SLA cumplidos", metrics.sla.met],
          ["SLA cumplimiento %", metrics.sla.compliancePct ?? "No disponible"],
          ["Actividades creadas", metrics.activities.created],
          ["Actividades completadas", metrics.activities.completed],
          ["Minutos totales", metrics.time.total],
          ["Minutos facturables", metrics.time.billable],
          ["Cobro por revisar", metrics.billing.pendingReview],
          ["Monto potencial", metrics.billing.potentialAmount],
        ],
      );
      filename = `reporte-${reportId}-resumen.csv`;
  }

  await db.transaction(async (tx) => {
    await recordAudit(tx, {
      organizationId: user.organizationId!,
      userId: Number(user.id),
      entityType: "report",
      entityId: reportId,
      action: "update",
      metadata: { event: "exported_csv", dataset },
    });
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
