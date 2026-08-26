import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, organizations, projects, reports, users } from "@/db/schema";
import { fmtMoney } from "@/lib/format";
import { getLabels } from "@/lib/labels";
import { getOrgLocale } from "@/lib/get-org-locale";
import { t, type Locale } from "@/lib/i18n";
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
  const locale: Locale = await getOrgLocale(user.organizationId);
  const { reportTypeMeta } = getLabels(locale);
  const { id } = await params;
  const reportId = Number(id);
  if (!Number.isInteger(reportId)) notFound();

  const [row] = await db
    .select({
      report: reports,
      companyName: companies.name,
      projectName: projects.name,
      responsibleName: users.name,
      orgName: organizations.name,
    })
    .from(reports)
    .leftJoin(companies, eq(reports.companyId, companies.id))
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
  const isExternal = report.companyId !== null;

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
            {row.companyName ? <p>{t("Empresa", "Company", locale)}: <strong>{row.companyName}</strong></p> : null}
            {row.projectName ? <p>{t("Proyecto", "Project", locale)}: <strong>{row.projectName}</strong></p> : null}
            <p>{t("Periodo", "Period", locale)}: <strong>{report.periodStart} – {report.periodEnd}</strong></p>
            <p>{t("Responsable", "Owner", locale)}: <strong>{row.responsibleName ?? "—"}</strong></p>
            <p>{t("Fecha de generación", "Generation date", locale)}: <strong>{report.generatedAt?.toISOString().slice(0, 10) ?? "—"}</strong></p>
            <p>
              {t("Versión", "Version", locale)}: <strong>v{report.version}</strong> ·{" "}
              {isExternal ? t("Documento para cliente", "Client document", locale) : t("Uso interno", "Internal use", locale)}
            </p>
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
          <h2 className="mb-2 border-b-2 border-slate-900 pb-1 text-lg font-bold">1. {t("Resumen ejecutivo", "Executive summary", locale)}</h2>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{report.executiveSummary || report.content}</p>
        </section>
      ) : null}

      {has("period_summary") ? (
        <section className="mb-8">
          <h2 className="mb-2 border-b-2 border-slate-900 pb-1 text-lg font-bold">2. {t("Resumen del periodo", "Period summary", locale)}</h2>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{report.content}</p>
        </section>
      ) : null}

      {has("tickets") ? (
        <section className="mb-8">
          <h2 className="mb-2 border-b-2 border-slate-900 pb-1 text-lg font-bold">3. {t("Tickets", "Tickets", locale)}</h2>
          <table className="w-full">
            <tbody>
              <Row label={t("Tickets creados", "Tickets created", locale)} value={metrics.tickets.created} />
              <Row label={t("Tickets cerrados", "Tickets closed", locale)} value={metrics.tickets.closed} />
              <Row label={t("Abiertos al cierre del periodo", "Open at end of period", locale)} value={metrics.tickets.openAtEnd} />
              <Row label={t("Reabiertos", "Reopened", locale)} value={metrics.tickets.reopened} />
              {metrics.tickets.avgFirstResponseMinutes !== null ? (
                <Row
                  label={t("Primera respuesta promedio", "Average first response", locale)}
                  value={formatMinutes(metrics.tickets.avgFirstResponseMinutes)}
                />
              ) : null}
              {metrics.tickets.avgResolutionMinutes !== null ? (
                <Row
                  label={t("Resolución promedio", "Average resolution", locale)}
                  value={formatMinutes(metrics.tickets.avgResolutionMinutes)}
                />
              ) : null}
            </tbody>
          </table>
        </section>
      ) : null}

      {has("sla") ? (
        <section className="mb-8">
          <h2 className="mb-2 border-b-2 border-slate-900 pb-1 text-lg font-bold">4. {t("Cumplimiento de SLA", "SLA compliance", locale)}</h2>
          <table className="w-full">
            <tbody>
              <Row label={t("Tickets evaluados", "Tickets evaluated", locale)} value={metrics.sla.evaluated} />
              <Row label={t("Cumplidos", "Met", locale)} value={metrics.sla.met} />
              <Row
                label={t("Cumplimiento de resolución", "Resolution compliance", locale)}
                value={metrics.sla.compliancePct !== null ? `${metrics.sla.compliancePct}%` : t("No disponible", "Not available", locale)}
              />
              <Row
                label={t("Cumplimiento de primera respuesta", "First response compliance", locale)}
                value={metrics.sla.firstResponsePct !== null ? `${metrics.sla.firstResponsePct}%` : t("No disponible", "Not available", locale)}
              />
            </tbody>
          </table>
        </section>
      ) : null}

      {has("activities") ? (
        <section className="mb-8">
          <h2 className="mb-2 border-b-2 border-slate-900 pb-1 text-lg font-bold">5. {t("Actividades", "Activities", locale)}</h2>
          <table className="w-full">
            <tbody>
              <Row label={t("Creadas", "Created", locale)} value={metrics.activities.created} />
              <Row label={t("Completadas", "Completed", locale)} value={metrics.activities.completed} />
            </tbody>
          </table>
        </section>
      ) : null}

      {has("time") ? (
        <section className="mb-8">
          <h2 className="mb-2 border-b-2 border-slate-900 pb-1 text-lg font-bold">6. {t("Tiempo de atención", "Time spent", locale)}</h2>
          <table className="w-full">
            <tbody>
              <Row label={t("Total registrado", "Total logged", locale)} value={formatMinutes(metrics.time.total)} />
              <Row label={t("Facturable", "Billable", locale)} value={formatMinutes(metrics.time.billable)} />
              <Row label={t("Incluido en contrato", "Included in contract", locale)} value={formatMinutes(metrics.time.inContract)} />
            </tbody>
          </table>
        </section>
      ) : null}

      {has("billing") && !isExternal ? (
        // billing amounts are internal by default — external reports exclude them
        <section className="mb-8">
          <h2 className="mb-2 border-b-2 border-slate-900 pb-1 text-lg font-bold">
            7. {t("Cobro operativo (interno)", "Operational billing (internal)", locale)}
          </h2>
          <table className="w-full">
            <tbody>
              <Row label={t("Tickets por revisar", "Tickets to review", locale)} value={metrics.billing.pendingReview} />
              <Row label={t("Monto potencial", "Potential amount", locale)} value={fmtMoney(metrics.billing.potentialAmount)} />
            </tbody>
          </table>
        </section>
      ) : null}

      {has("conclusions") && report.conclusions ? (
        <section className="mb-8">
          <h2 className="mb-2 border-b-2 border-slate-900 pb-1 text-lg font-bold">{t("Conclusiones", "Conclusions", locale)}</h2>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{report.conclusions}</p>
        </section>
      ) : null}

      {has("recommendations") && report.recommendations ? (
        <section className="mb-8">
          <h2 className="mb-2 border-b-2 border-slate-900 pb-1 text-lg font-bold">{t("Recomendaciones", "Recommendations", locale)}</h2>
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{report.recommendations}</p>
        </section>
      ) : null}

      <footer className="mt-12 border-t border-slate-300 pt-3 text-center text-xs text-slate-500">
        {branding.footerText ? <span className="block">{branding.footerText}</span> : null}
        {row.orgName} · {report.title} · v{report.version} · {report.periodStart} – {report.periodEnd} ·{" "}
        {isExternal ? t("Documento para cliente", "Client document", locale) : t("Uso interno", "Internal use", locale)}
      </footer>
    </div>
  );
}
