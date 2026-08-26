import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { ClipboardList, Download, FileText, History } from "lucide-react";
import { db } from "@/db";
import { BarChart } from "@/components/charts";
import {
  auditLogs,
  companies,
  contacts,
  projects,
  reportTemplates,
  reportVersions,
  reports,
  users,
} from "@/db/schema";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { getLabels } from "@/lib/labels";
import { getOrgLocale } from "@/lib/get-org-locale";
import { t, type Locale } from "@/lib/i18n";
import type { PeriodMetrics } from "@/lib/report-metrics";
import { requireUser } from "@/lib/session";
import { formatMinutes } from "@/lib/time-entries";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  StatCard,
  THead,
  Table,
  Td,
  Th,
  buttonSecondaryClass,
  cx,
} from "@/components/ui";
import {
  Disclosure,
  MarkSentForm,
  NarrativeForm,
  RequestChangesForm,
  RowAction,
} from "../report-forms";

export const metadata: Metadata = { title: "Report" };

function getTabs(locale: Locale) {
  return [
    ["preview", t("Vista previa", "Preview", locale)],
    ["content", t("Contenido", "Content", locale)],
    ["metrics", t("Métricas", "Metrics", locale)],
    ["versions", t("Versiones", "Versions", locale)],
    ["history", t("Historial", "History", locale)],
    ["config", t("Configuración", "Configuration", locale)],
  ] as const;
}
type Tab = ReturnType<typeof getTabs>[number][0];

const MGMT_ROLES = ["superadmin", "administrator", "director", "project_manager"];

export default async function ReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  const locale = await getOrgLocale(user.organizationId);
  const { reportStatusMeta, reportTypeMeta } = getLabels(locale);
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const TABS = getTabs(locale);
  const reportId = Number(id);
  if (!Number.isInteger(reportId)) notFound();

  const [row] = await db
    .select({
      report: reports,
      companyName: companies.name,
      projectName: projects.name,
      responsibleName: users.name,
      templateName: reportTemplates.name,
    })
    .from(reports)
    .leftJoin(companies, eq(reports.companyId, companies.id))
    .leftJoin(projects, eq(reports.projectId, projects.id))
    .leftJoin(users, eq(reports.responsibleUserId, users.id))
    .leftJoin(reportTemplates, eq(reports.templateId, reportTemplates.id))
    .where(and(eq(reports.id, reportId), eq(reports.organizationId, user.organizationId)));
  if (!row) notFound();
  const report = row.report;

  const tab: Tab = TABS.some(([key]) => key === rawTab) ? (rawTab as Tab) : "preview";
  const isMgmt = MGMT_ROLES.includes(user.role);
  const metrics = (report.metricsSnapshot ?? null) as PeriodMetrics | null;

  const clientContacts = report.companyId
    ? await db
        .select({ id: contacts.id, name: contacts.firstName, lastName: contacts.lastName })
        .from(contacts)
        .where(and(eq(contacts.companyId, report.companyId), eq(contacts.isActive, true)))
    : [];

  return (
    <div>
      {report.status === "failed" ? (
        <div className="mb-5 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-fg">
          {t("La generación falló", "Generation failed", locale)}
          {report.failureReason ? `: ${report.failureReason}` : "."}{" "}
          {t("Corrige la configuración y vuelve a generar.", "Fix the configuration and generate again.", locale)}
        </div>
      ) : null}
      {report.status === "sent" ? (
        <div className="mb-5 rounded-lg border border-primary/20 bg-primary-soft px-4 py-3 text-sm text-primary">
          {t("Enviado el", "Sent on", locale)} {report.sentAt ? fmtDate(report.sentAt) : "—"}{" "}
          {t("por", "via", locale)} {report.deliveryChannel ?? "—"} ({t("versión", "version", locale)} v{report.version}).
        </div>
      ) : null}

      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {report.title}
            <Badge tone={reportStatusMeta[report.status]?.tone ?? "slate"}>
              {reportStatusMeta[report.status]?.label ?? report.status}
            </Badge>
            <Badge tone={reportTypeMeta[report.reportType]?.tone ?? "slate"}>
              {reportTypeMeta[report.reportType]?.label ?? report.reportType}
            </Badge>
            <span className="text-sm text-faint tabular-nums">v{report.version}</span>
          </span>
        }
        subtitle={
          <>
            {row.companyName ?? t("Interno", "Internal", locale)}
            {row.projectName ? ` · ${row.projectName}` : ""}
            {report.periodStart ? ` · ${report.periodStart} – ${report.periodEnd}` : ""}
            {` · ${t("Responsable", "Owner", locale)}: ${row.responsibleName ?? "—"}`}
            {row.templateName ? ` · ${t("Plantilla", "Template", locale)}: ${row.templateName}` : ""}
          </>
        }
        action={
          <>
            {metrics ? (
              <>
                <a href={`/reports/${report.id}/print`} target="_blank" className={buttonSecondaryClass}>
                  <FileText className="size-4" /> {t("PDF (imprimir)", "PDF (print)", locale)}
                </a>
                <a href={`/api/reports/${report.id}/export?dataset=summary`} className={buttonSecondaryClass}>
                  <Download className="size-4" /> CSV
                </a>
              </>
            ) : null}
            <Link href="/reports" className={buttonSecondaryClass}>{t("Volver", "Back", locale)}</Link>
          </>
        }
      />

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-edge pb-px">
        {TABS.map(([key, label]) => (
          <Link
            key={key}
            href={`/reports/${reportId}?tab=${key}`}
            aria-current={tab === key ? "page" : undefined}
            className={cx(
              "shrink-0 rounded-md px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors",
              tab === key ? "bg-primary-soft text-primary" : "text-muted hover:bg-subtle hover:text-fg",
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      {tab === "preview" ? (
        <PreviewTab report={report} metrics={metrics} companyName={row.companyName} reportTypeMeta={reportTypeMeta} locale={locale} />
      ) : null}
      {tab === "content" ? (
        ["sent", "archived"].includes(report.status) ? (
          <p className="text-sm text-muted">
            {report.status === "sent"
              ? t(
                  "Un reporte enviado no se edita — duplícalo para partir de su contenido.",
                  "A sent report cannot be edited — duplicate it to start from its content.",
                  locale,
                )
              : t(
                  "Un reporte archivado no se edita — duplícalo para partir de su contenido.",
                  "An archived report cannot be edited — duplicate it to start from its content.",
                  locale,
                )}
          </p>
        ) : (
          <div className="max-w-3xl">
            <Card className="p-6">
              <NarrativeForm report={report} />
            </Card>
          </div>
        )
      ) : null}
      {tab === "metrics" ? <MetricsTab metrics={metrics} locale={locale} /> : null}
      {tab === "versions" ? <VersionsTab orgId={user.organizationId} reportId={report.id} locale={locale} /> : null}
      {tab === "history" ? <HistoryTab orgId={user.organizationId} reportId={report.id} locale={locale} /> : null}
      {tab === "config" ? (
        <ConfigTab
          report={report}
          isMgmt={isMgmt}
          isSuperAdmin={user.role === "superadmin"}
          contacts={clientContacts.map((c) => ({ id: c.id, name: `${c.name} ${c.lastName}` }))}
          locale={locale}
        />
      ) : null}
    </div>
  );
}

/* ---------------------------------------------------------------- preview */

function MetricLine({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between border-b border-edge/60 py-1.5 text-sm">
      <span className="text-muted">{label}</span>
      <span className="font-medium text-fg tabular-nums">{value}</span>
    </div>
  );
}

function PreviewTab({
  report,
  metrics,
  companyName,
  reportTypeMeta,
  locale,
}: {
  report: typeof reports.$inferSelect;
  metrics: PeriodMetrics | null;
  companyName: string | null;
  reportTypeMeta: ReturnType<typeof getLabels>["reportTypeMeta"];
  locale: Locale;
}) {
  if (!metrics) {
    return (
      <EmptyState icon={<ClipboardList />} title={t("Aún no se genera el contenido", "Content has not been generated yet", locale)}>
        {t(
          "Genera el reporte para calcular las métricas del periodo y congelarlas como snapshot.",
          "Generate the report to calculate the period metrics and freeze them as a snapshot.",
          locale,
        )}
      </EmptyState>
    );
  }
  const snapshot = report.contentSnapshot as { sections?: { key: string; title: string; enabled: boolean; intro?: string }[] } | null;
  const enabled = new Set((snapshot?.sections ?? []).filter((s) => s.enabled).map((s) => s.key));
  const has = (key: string) => enabled.size === 0 || enabled.has(key);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {has("cover") ? (
        <Card className="p-8 text-center">
          <p className="text-xs tracking-widest text-faint uppercase">
            {t("Reporte", "Report", locale)} {reportTypeMeta[report.reportType]?.label}
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-fg">{report.title}</h2>
          <p className="mt-2 text-sm text-muted">
            {companyName ?? t("Interno", "Internal", locale)} · {report.periodStart} – {report.periodEnd} · v{report.version}
          </p>
        </Card>
      ) : null}
      {has("executive_summary") && (report.executiveSummary || report.content) ? (
        <Card className="p-6">
          <CardHeader title={t("Resumen ejecutivo", "Executive summary", locale)} className="mb-3 px-0 pt-0" />
          <p className="text-sm whitespace-pre-wrap text-fg">{report.executiveSummary || report.content}</p>
        </Card>
      ) : null}
      {has("period_summary") ? (
        <Card className="p-6">
          <CardHeader title={t("Resumen del periodo", "Period summary", locale)} className="mb-3 px-0 pt-0" />
          <p className="text-sm whitespace-pre-wrap text-fg">{report.content}</p>
        </Card>
      ) : null}
      {has("tickets") ? (
        <Card className="p-6">
          <CardHeader title={t("Tickets", "Tickets", locale)} className="mb-2 px-0 pt-0" />
          <MetricLine label={t("Creados", "Created", locale)} value={metrics.tickets.created} />
          <MetricLine label={t("Cerrados", "Closed", locale)} value={metrics.tickets.closed} />
          <MetricLine label={t("Abiertos al final del periodo", "Open at end of period", locale)} value={metrics.tickets.openAtEnd} />
          <MetricLine label={t("Reabiertos", "Reopened", locale)} value={metrics.tickets.reopened} />
          {metrics.tickets.avgFirstResponseMinutes !== null ? (
            <MetricLine
              label={t("Primera respuesta promedio", "Average first response", locale)}
              value={formatMinutes(metrics.tickets.avgFirstResponseMinutes)}
            />
          ) : null}
          {metrics.tickets.avgResolutionMinutes !== null ? (
            <MetricLine
              label={t("Resolución promedio", "Average resolution", locale)}
              value={formatMinutes(metrics.tickets.avgResolutionMinutes)}
            />
          ) : null}
        </Card>
      ) : null}
      {has("sla") ? (
        <Card className="p-6">
          <CardHeader title="SLA" className="mb-2 px-0 pt-0" />
          <MetricLine label={t("Tickets evaluados", "Tickets evaluated", locale)} value={metrics.sla.evaluated} />
          <MetricLine label={t("Cumplidos", "Met", locale)} value={metrics.sla.met} />
          <MetricLine
            label={t("Cumplimiento", "Compliance", locale)}
            value={metrics.sla.compliancePct !== null ? `${metrics.sla.compliancePct}%` : t("No disponible", "Not available", locale)}
          />
          <MetricLine
            label={t("Primera respuesta", "First response", locale)}
            value={metrics.sla.firstResponsePct !== null ? `${metrics.sla.firstResponsePct}%` : t("No disponible", "Not available", locale)}
          />
          <MetricLine label={t("Excluidos (sin SLA)", "Excluded (no SLA)", locale)} value={metrics.sla.excludedNoSla} />
        </Card>
      ) : null}
      {has("activities") ? (
        <Card className="p-6">
          <CardHeader title={t("Actividades", "Activities", locale)} className="mb-2 px-0 pt-0" />
          <MetricLine label={t("Creadas", "Created", locale)} value={metrics.activities.created} />
          <MetricLine label={t("Completadas", "Completed", locale)} value={metrics.activities.completed} />
          <MetricLine label={t("Vencidas ahora", "Overdue now", locale)} value={metrics.activities.overdueNow} />
        </Card>
      ) : null}
      {has("time") ? (
        <Card className="p-6">
          <CardHeader title={t("Tiempo", "Time", locale)} className="mb-2 px-0 pt-0" />
          <MetricLine label={t("Total", "Total", locale)} value={formatMinutes(metrics.time.total)} />
          <MetricLine label={t("Facturable", "Billable", locale)} value={formatMinutes(metrics.time.billable)} />
          <MetricLine label={t("Incluido en contrato", "Included in contract", locale)} value={formatMinutes(metrics.time.inContract)} />
        </Card>
      ) : null}
      {has("billing") ? (
        <Card className="p-6">
          <CardHeader title={t("Cobro operativo", "Operational billing", locale)} className="mb-2 px-0 pt-0" />
          <MetricLine label={t("Por revisar", "To review", locale)} value={metrics.billing.pendingReview} />
          <MetricLine label={t("Cobrables", "Billable", locale)} value={metrics.billing.billable} />
          <MetricLine label={t("Monto potencial", "Potential amount", locale)} value={fmtMoney(metrics.billing.potentialAmount)} />
        </Card>
      ) : null}
      {has("conclusions") && report.conclusions ? (
        <Card className="p-6">
          <CardHeader title={t("Conclusiones", "Conclusions", locale)} className="mb-3 px-0 pt-0" />
          <p className="text-sm whitespace-pre-wrap text-fg">{report.conclusions}</p>
        </Card>
      ) : null}
      {has("recommendations") && report.recommendations ? (
        <Card className="p-6">
          <CardHeader title={t("Recomendaciones", "Recommendations", locale)} className="mb-3 px-0 pt-0" />
          <p className="text-sm whitespace-pre-wrap text-fg">{report.recommendations}</p>
        </Card>
      ) : null}
      <p className="text-center text-xs text-faint">
        {t("Datos calculados el", "Data calculated on", locale)} {metrics.computedAt.slice(0, 10)} —{" "}
        {t(
          "snapshot congelado, no cambia si la operación cambia después. Las notas internas nunca aparecen aquí.",
          "frozen snapshot, it does not change if operations change afterward. Internal notes never appear here.",
          locale,
        )}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------- metrics */

function MetricsTab({ metrics, locale }: { metrics: PeriodMetrics | null; locale: Locale }) {
  if (!metrics) {
    return <p className="text-sm text-muted">{t("Sin métricas — genera el reporte primero.", "No metrics yet — generate the report first.", locale)}</p>;
  }
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={<ClipboardList />} label={t("Tickets creados", "Tickets created", locale)} value={String(metrics.tickets.created)} />
        <StatCard icon={<ClipboardList />} label={t("Tickets cerrados", "Tickets closed", locale)} value={String(metrics.tickets.closed)} />
        <StatCard icon={<History />} label="SLA" value={metrics.sla.compliancePct !== null ? `${metrics.sla.compliancePct}%` : "N/D"} />
        <StatCard icon={<History />} label={t("Tiempo", "Time", locale)} value={formatMinutes(metrics.time.total)} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BreakdownCard
          title={t("Tickets por técnico", "Tickets by technician", locale)}
          note={t("creados / cerrados", "created / closed", locale)}
          rows={metrics.tickets.byAssignee.map((r) => [r.key, `${r.created} / ${r.closed}`])}
          locale={locale}
          chart={
            <BarChart
              data={metrics.tickets.byAssignee.map((r) => ({ label: r.key, creados: r.created, cerrados: r.closed }))}
              series={[
                { key: "creados", label: t("Creados", "Created", locale), color: "primary" },
                { key: "cerrados", label: t("Cerrados", "Closed", locale), color: "accent" },
              ]}
            />
          }
        />
        <BreakdownCard
          title={t("Tickets por categoría", "Tickets by category", locale)}
          note={t("creados / cerrados", "created / closed", locale)}
          rows={metrics.tickets.byCategory.map((r) => [r.key, `${r.created} / ${r.closed}`])}
          locale={locale}
          chart={
            <BarChart
              data={metrics.tickets.byCategory.map((r) => ({ label: r.key, creados: r.created, cerrados: r.closed }))}
              series={[
                { key: "creados", label: t("Creados", "Created", locale), color: "primary" },
                { key: "cerrados", label: t("Cerrados", "Closed", locale), color: "accent" },
              ]}
            />
          }
        />
        <BreakdownCard
          title={t("Tiempo por persona", "Time by person", locale)}
          rows={metrics.time.byUser.map((r) => [r.key, formatMinutes(r.minutes)])}
          locale={locale}
        />
        <BreakdownCard
          title={t("Tiempo por cliente", "Time by client", locale)}
          rows={metrics.time.byClient.map((r) => [r.key, formatMinutes(r.minutes)])}
          locale={locale}
          chart={
            <BarChart
              data={metrics.time.byClient.map((r) => ({ label: r.key, minutos: r.minutes }))}
              series={[{ key: "minutos", label: t("Minutos", "Minutes", locale), color: "primary" }]}
              valueFormatter={(v) => formatMinutes(v)}
            />
          }
        />
        <BreakdownCard
          title={t("SLA por prioridad", "SLA by priority", locale)}
          rows={metrics.sla.byPriority.map((r) => [r.key, r.evaluated > 0 ? `${Math.round((r.met / r.evaluated) * 100)}% (${r.met}/${r.evaluated})` : "N/D"])}
          locale={locale}
        />
        <BreakdownCard
          title={t("Recurrentes", "Recurring", locale)}
          rows={[
            [t("Ejecuciones", "Runs", locale), String(metrics.recurring.executions)],
            [t("Exitosas", "Succeeded", locale), String(metrics.recurring.succeeded)],
            [t("Fallidas", "Failed", locale), String(metrics.recurring.failed)],
          ]}
          locale={locale}
        />
      </div>
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
  note,
  chart,
  locale,
}: {
  title: string;
  rows: [string, string][];
  note?: string;
  /** Visual twin of `rows` — the list below stays the authoritative table view, per dataviz skill. */
  chart?: ReactNode;
  locale: Locale;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader title={title} description={note} />
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">{t("Sin datos en el periodo.", "No data in the period.", locale)}</p>
      ) : (
        <>
          {chart ? <div className="px-5 pt-4">{chart}</div> : null}
          <ul className="divide-y divide-edge">
            {rows.map(([k, v]) => (
              <li key={k} className="flex items-center justify-between px-5 py-2 text-sm">
                <span className="text-fg">{k}</span>
                <span className="tabular-nums text-muted">{v}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- versions */

async function VersionsTab({ orgId, reportId, locale }: { orgId: number; reportId: number; locale: Locale }) {
  const rows = await db
    .select({ version: reportVersions, authorName: users.name })
    .from(reportVersions)
    .leftJoin(users, eq(reportVersions.authorId, users.id))
    .where(and(eq(reportVersions.organizationId, orgId), eq(reportVersions.reportId, reportId)))
    .orderBy(desc(reportVersions.versionNumber));
  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted">
        {t("Sin versiones todavía — la primera generación crea la v1.", "No versions yet — the first generation creates v1.", locale)}
      </p>
    );
  }
  return (
    <Card className="overflow-visible">
      <Table>
        <THead>
          <tr>
            <Th>{t("Versión", "Version", locale)}</Th>
            <Th>{t("Autor", "Author", locale)}</Th>
            <Th>{t("Fecha", "Date", locale)}</Th>
            <Th>{t("Motivo", "Reason", locale)}</Th>
            <Th>{t("Aprobada", "Approved", locale)}</Th>
            <Th>{t("Enviada", "Sent", locale)}</Th>
          </tr>
        </THead>
        <tbody className="divide-y divide-edge">
          {rows.map(({ version, authorName }) => (
            <tr key={version.id}>
              <Td className="font-medium text-fg tabular-nums">v{version.versionNumber}</Td>
              <Td className="text-muted">{authorName ?? t("sistema", "system", locale)}</Td>
              <Td className="text-muted">{fmtDateTime(version.createdAt)}</Td>
              <Td className="text-muted">{version.changeReason ?? "—"}</Td>
              <Td className="text-muted">{version.approvedAt ? fmtDate(version.approvedAt) : "—"}</Td>
              <Td className="text-muted">{version.sentAt ? fmtDate(version.sentAt) : "—"}</Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

/* ----------------------------------------------------------------- history */

async function HistoryTab({ orgId, reportId, locale }: { orgId: number; reportId: number; locale: Locale }) {
  const rows = await db
    .select({ log: auditLogs, actorName: users.name })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(and(eq(auditLogs.organizationId, orgId), eq(auditLogs.entityType, "report"), eq(auditLogs.entityId, reportId)))
    .orderBy(asc(auditLogs.createdAt));
  if (rows.length === 0) {
    return <p className="text-sm text-muted">{t("Sin eventos todavía.", "No events yet.", locale)}</p>;
  }
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-edge">
        {rows.map(({ log, actorName }) => (
          <li key={log.id} className="flex items-baseline justify-between gap-3 px-5 py-2.5 text-sm">
            <span className="min-w-0">
              <span className="font-medium text-fg">
                {(log.metadata as { event?: string } | null)?.event ?? log.field ?? log.action}
              </span>{" "}
              <span className="text-muted">{log.field ? `${log.oldValue ?? "—"} → ${log.newValue ?? "—"}` : ""}</span>
            </span>
            <span className="shrink-0 text-xs text-faint tabular-nums">
              {actorName ?? t("sistema", "system", locale)} · {fmtDateTime(log.createdAt)}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ------------------------------------------------------------------ config */

function ConfigTab({
  report,
  isMgmt,
  isSuperAdmin,
  contacts,
  locale,
}: {
  report: typeof reports.$inferSelect;
  isMgmt: boolean;
  isSuperAdmin: boolean;
  contacts: { id: number; name: string }[];
  locale: Locale;
}) {
  return (
    <div className="max-w-2xl space-y-4">
      {["draft", "changes_requested", "failed", "ready_for_review"].includes(report.status) ? (
        <Card className="p-5">
          <CardHeader
            title={report.version > 0 && report.generatedAt ? t("Regenerar", "Regenerate", locale) : t("Generar", "Generate", locale)}
            description={t(
              "Calcula las métricas del periodo y crea la siguiente versión.",
              "Calculates the period metrics and creates the next version.",
              locale,
            )}
            className="mb-3 px-0 pt-0"
          />
          <RowAction
            action="generateReportAction"
            fields={{ id: report.id }}
            label={report.generatedAt ? t("Regenerar (nueva versión)", "Regenerate (new version)", locale) : t("Generar contenido", "Generate content", locale)}
          />
        </Card>
      ) : null}
      {report.status === "ready_for_review" ? (
        <>
          <Card className="p-5">
            <CardHeader title={t("Solicitar cambios", "Request changes", locale)} className="mb-3 px-0 pt-0" />
            <RequestChangesForm id={report.id} />
          </Card>
          {isMgmt ? (
            <Card className="p-5">
              <CardHeader
                title={t("Aprobar", "Approve", locale)}
                description={t("La aprobación queda ligada a la versión actual.", "Approval is tied to the current version.", locale)}
                className="mb-3 px-0 pt-0"
              />
              <RowAction action="approveReport" fields={{ id: report.id }} label={`${t("Aprobar", "Approve", locale)} v${report.version}`} />
            </Card>
          ) : null}
        </>
      ) : null}
      {isMgmt && ["approved", "ready_for_review"].includes(report.status) ? (
        <Card className="p-5">
          <CardHeader
            title={t("Marcar enviado", "Mark as sent", locale)}
            description={
              report.status === "approved"
                ? t("Registra el envío del reporte aprobado.", "Records the sending of the approved report.", locale)
                : t(
                    "Enviar sin aprobación requiere motivo de excepción (auditado).",
                    "Sending without approval requires an exception reason (audited).",
                    locale,
                  )
            }
            className="mb-3 px-0 pt-0"
          />
          <MarkSentForm id={report.id} approved={report.status === "approved"} contacts={contacts} />
        </Card>
      ) : null}
      <Card className="p-5">
        <CardHeader title={t("Otras acciones", "Other actions", locale)} className="mb-3 px-0 pt-0" />
        <div className="flex flex-wrap gap-3">
          <RowAction action="duplicateReport" fields={{ id: report.id }} label={t("Duplicar", "Duplicate", locale)} />
          {report.status !== "archived" ? (
            <RowAction
              action="archiveReport"
              fields={{ id: report.id }}
              label={t("Archivar", "Archive", locale)}
              confirm={t(
                "¿Archivar este reporte? Historial y versiones se conservan.",
                "Archive this report? History and versions are kept.",
                locale,
              )}
            />
          ) : (
            <RowAction action="restoreReport" fields={{ id: report.id }} label={t("Restaurar", "Restore", locale)} />
          )}
          {isSuperAdmin ? (
            <Disclosure label={t("Eliminación permanente (SuperAdmin)", "Permanent deletion (SuperAdmin)", locale)}>
              <RowAction
                action="deleteReport"
                fields={{ id: report.id }}
                label={t("Eliminar permanentemente", "Delete permanently", locale)}
                confirm={t(
                  `¿Eliminar "${report.title}" y todas sus versiones para siempre?`,
                  `Delete "${report.title}" and all its versions forever?`,
                  locale,
                )}
                danger
              />
            </Disclosure>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
