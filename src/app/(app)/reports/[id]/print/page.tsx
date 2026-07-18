import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, organizations, projects, reports, users } from "@/db/schema";
import { fmtMoney } from "@/lib/format";
import { reportTypeMeta } from "@/lib/labels";
import type { PeriodMetrics } from "@/lib/report-metrics";
import { requireUser } from "@/lib/session";
import { getSetting } from "@/lib/settings-data";
import { formatMinutes } from "@/lib/time-entries";
import { PrintButton } from "@/components/print-button";

export const metadata: Metadata = { title: "Report PDF" };

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <tr>
      <td className="border-b border-slate-200 py-1.5 pr-6 text-sm text-slate-600">{label}</td>
      <td className="border-b border-slate-200 py-1.5 text-right text-sm font-medium tabular-nums">{value}</td>
    </tr>
  );
}

/**
 * Print-optimized report output — the PDF mechanism for the MVP: the browser's
 * print-to-PDF renders this page with @page CSS (cover, sections, footer with
 * version). No PDF library and no blob storage were added (documented decision,
 * see docs/features/reports.md §Exportación). Internal notes NEVER render here.
 */
export default async function ReportPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const reportId = Number(id);
  if (!Number.isInteger(reportId)) notFound();

  const [row] = await db
    .select({
      report: reports,
      clientName: clients.name,
      projectName: projects.name,
      responsibleName: users.name,
      orgName: organizations.name,
    })
    .from(reports)
    .leftJoin(clients, eq(reports.clientId, clients.id))
    .leftJoin(projects, eq(reports.projectId, projects.id))
    .leftJoin(users, eq(reports.responsibleUserId, users.id))
    .leftJoin(organizations, eq(reports.organizationId, organizations.id))
    .where(and(eq(reports.id, reportId), eq(reports.organizationId, user.organizationId)));
  if (!row) notFound();
  const report = row.report;
  const metrics = (report.metricsSnapshot ?? null) as PeriodMetrics | null;
  if (!metrics) notFound();

  const branding = await getSetting(user.organizationId, "reports.branding");
  const snapshot = report.contentSnapshot as { sections?: { key: string; title: string; enabled: boolean }[] } | null;
  const enabled = new Set((snapshot?.sections ?? []).filter((s) => s.enabled).map((s) => s.key));
  const has = (key: string) => enabled.size === 0 || enabled.has(key);
  const isExternal = report.clientId !== null;

  return (
    <div className="mx-auto max-w-[720px] bg-white p-10 text-slate-900 print:p-0">
      <div className="mb-6 flex justify-end print:hidden">
        <PrintButton />
      </div>

      {has("cover") ? (
        <section className="mb-12 border-b-4 border-slate-900 pb-10 text-center" style={{ pageBreakAfter: "always" }}>
          {branding.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logo} alt={row.orgName ?? ""} className="mx-auto mb-4 h-14 w-auto" />
          ) : null}
          <p className="text-xs font-semibold tracking-[0.3em] text-slate-500 uppercase">{row.orgName}</p>
          <h1 className="mt-10 text-3xl font-bold">{branding.coverTitle ?? report.title}</h1>
          {branding.coverSubtitle ? (
            <p className="mt-2 text-sm text-slate-600">{branding.coverSubtitle}</p>
          ) : null}
          <p className="mt-3 text-sm text-slate-600">
            {reportTypeMeta[report.reportType]?.label ?? report.reportType}
          </p>
          <div className="mx-auto mt-10 max-w-sm space-y-1 text-sm text-slate-700">
            {row.clientName ? <p>Cliente: <strong>{row.clientName}</strong></p> : null}
            {row.projectName ? <p>Proyecto: <strong>{row.projectName}</strong></p> : null}
            <p>Periodo: <strong>{report.periodStart} – {report.periodEnd}</strong></p>
            <p>Responsable: <strong>{row.responsibleName ?? "—"}</strong></p>
            <p>Fecha de generación: <strong>{report.generatedAt?.toISOString().slice(0, 10) ?? "—"}</strong></p>
            <p>Versión: <strong>v{report.version}</strong> · {isExternal ? "Documento para cliente" : "Uso interno"}</p>
          </div>
          {branding.corporateIntro ? (
            <p className="mx-auto mt-8 max-w-md text-xs leading-relaxed text-slate-600">{branding.corporateIntro}</p>
          ) : null}
          {branding.confidentialityNotice ? (
            <p className="mx-auto mt-4 max-w-md text-[10px] leading-relaxed text-slate-500">{branding.confidentialityNotice}</p>
          ) : null}
        </section>
      ) : null}

      {has("executive_summary") && (report.executiveSummary || report.content) ? (
        <section className="mb-8">
          <h2 className="mb-2 border-b-2 border-slate-900 pb-1 text-lg font-bold">1. Resumen ejecutivo</h2>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{report.executiveSummary || report.content}</p>
        </section>
      ) : null}

      {has("period_summary") ? (
        <section className="mb-8">
          <h2 className="mb-2 border-b-2 border-slate-900 pb-1 text-lg font-bold">2. Resumen del periodo</h2>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{report.content}</p>
        </section>
      ) : null}

      {has("tickets") ? (
        <section className="mb-8">
          <h2 className="mb-2 border-b-2 border-slate-900 pb-1 text-lg font-bold">3. Tickets</h2>
          <table className="w-full">
            <tbody>
              <Row label="Tickets creados" value={metrics.tickets.created} />
              <Row label="Tickets cerrados" value={metrics.tickets.closed} />
              <Row label="Abiertos al cierre del periodo" value={metrics.tickets.openAtEnd} />
              <Row label="Reabiertos" value={metrics.tickets.reopened} />
              {metrics.tickets.avgFirstResponseMinutes !== null ? (
                <Row label="Primera respuesta promedio" value={formatMinutes(metrics.tickets.avgFirstResponseMinutes)} />
              ) : null}
              {metrics.tickets.avgResolutionMinutes !== null ? (
                <Row label="Resolución promedio" value={formatMinutes(metrics.tickets.avgResolutionMinutes)} />
              ) : null}
            </tbody>
          </table>
        </section>
      ) : null}

      {has("sla") ? (
        <section className="mb-8">
          <h2 className="mb-2 border-b-2 border-slate-900 pb-1 text-lg font-bold">4. Cumplimiento de SLA</h2>
          <table className="w-full">
            <tbody>
              <Row label="Tickets evaluados" value={metrics.sla.evaluated} />
              <Row label="Cumplidos" value={metrics.sla.met} />
              <Row label="Cumplimiento de resolución" value={metrics.sla.compliancePct !== null ? `${metrics.sla.compliancePct}%` : "No disponible"} />
              <Row label="Cumplimiento de primera respuesta" value={metrics.sla.firstResponsePct !== null ? `${metrics.sla.firstResponsePct}%` : "No disponible"} />
            </tbody>
          </table>
        </section>
      ) : null}

      {has("activities") ? (
        <section className="mb-8">
          <h2 className="mb-2 border-b-2 border-slate-900 pb-1 text-lg font-bold">5. Actividades</h2>
          <table className="w-full">
            <tbody>
              <Row label="Creadas" value={metrics.activities.created} />
              <Row label="Completadas" value={metrics.activities.completed} />
            </tbody>
          </table>
        </section>
      ) : null}

      {has("time") ? (
        <section className="mb-8">
          <h2 className="mb-2 border-b-2 border-slate-900 pb-1 text-lg font-bold">6. Tiempo de atención</h2>
          <table className="w-full">
            <tbody>
              <Row label="Total registrado" value={formatMinutes(metrics.time.total)} />
              <Row label="Facturable" value={formatMinutes(metrics.time.billable)} />
              <Row label="Incluido en contrato" value={formatMinutes(metrics.time.inContract)} />
            </tbody>
          </table>
        </section>
      ) : null}

      {has("billing") && !isExternal ? (
        // billing amounts are internal by default — external reports exclude them
        <section className="mb-8">
          <h2 className="mb-2 border-b-2 border-slate-900 pb-1 text-lg font-bold">7. Cobro operativo (interno)</h2>
          <table className="w-full">
            <tbody>
              <Row label="Tickets por revisar" value={metrics.billing.pendingReview} />
              <Row label="Monto potencial" value={fmtMoney(metrics.billing.potentialAmount)} />
            </tbody>
          </table>
        </section>
      ) : null}

      {has("conclusions") && report.conclusions ? (
        <section className="mb-8">
          <h2 className="mb-2 border-b-2 border-slate-900 pb-1 text-lg font-bold">Conclusiones</h2>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{report.conclusions}</p>
        </section>
      ) : null}

      {has("recommendations") && report.recommendations ? (
        <section className="mb-8">
          <h2 className="mb-2 border-b-2 border-slate-900 pb-1 text-lg font-bold">Recomendaciones</h2>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{report.recommendations}</p>
        </section>
      ) : null}

      <footer className="mt-12 border-t border-slate-300 pt-3 text-center text-xs text-slate-500">
        {branding.footerText ? <span className="block">{branding.footerText}</span> : null}
        {row.orgName} · {report.title} · v{report.version} · {report.periodStart} – {report.periodEnd} ·{" "}
        {isExternal ? "Documento para cliente" : "Uso interno"}
      </footer>
    </div>
  );
}
