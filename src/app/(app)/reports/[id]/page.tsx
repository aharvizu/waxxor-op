import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { ClipboardList, Download, FileText, History } from "lucide-react";
import { db } from "@/db";
import {
  auditLogs,
  clients,
  contacts,
  projects,
  reportTemplates,
  reportVersions,
  reports,
  users,
} from "@/db/schema";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import { reportStatusMeta, reportTypeMeta } from "@/lib/labels";
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

const TABS = [
  ["preview", "Vista previa"],
  ["content", "Contenido"],
  ["metrics", "Métricas"],
  ["versions", "Versiones"],
  ["history", "Historial"],
  ["config", "Configuración"],
] as const;
type Tab = (typeof TABS)[number][0];

const MGMT_ROLES = ["superadmin", "administrator", "director", "project_manager"];

export default async function ReportDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const reportId = Number(id);
  if (!Number.isInteger(reportId)) notFound();

  const [row] = await db
    .select({
      report: reports,
      clientName: clients.name,
      projectName: projects.name,
      responsibleName: users.name,
      templateName: reportTemplates.name,
    })
    .from(reports)
    .leftJoin(clients, eq(reports.clientId, clients.id))
    .leftJoin(projects, eq(reports.projectId, projects.id))
    .leftJoin(users, eq(reports.responsibleUserId, users.id))
    .leftJoin(reportTemplates, eq(reports.templateId, reportTemplates.id))
    .where(and(eq(reports.id, reportId), eq(reports.organizationId, user.organizationId)));
  if (!row) notFound();
  const report = row.report;

  const tab: Tab = TABS.some(([t]) => t === rawTab) ? (rawTab as Tab) : "preview";
  const isMgmt = MGMT_ROLES.includes(user.role);
  const metrics = (report.metricsSnapshot ?? null) as PeriodMetrics | null;

  const clientContacts = report.clientId
    ? await db
        .select({ id: contacts.id, name: contacts.firstName, lastName: contacts.lastName })
        .from(contacts)
        .where(and(eq(contacts.clientId, report.clientId), eq(contacts.isActive, true)))
    : [];

  return (
    <div>
      {report.status === "failed" ? (
        <div className="mb-5 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-fg">
          La generación falló{report.failureReason ? `: ${report.failureReason}` : "."} Corrige la
          configuración y vuelve a generar.
        </div>
      ) : null}
      {report.status === "sent" ? (
        <div className="mb-5 rounded-lg border border-primary/20 bg-primary-soft px-4 py-3 text-sm text-primary">
          Enviado el {report.sentAt ? fmtDate(report.sentAt) : "—"} por {report.deliveryChannel ?? "—"} (versión v{report.version}).
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
            {row.clientName ?? "Interno"}
            {row.projectName ? ` · ${row.projectName}` : ""}
            {report.periodStart ? ` · ${report.periodStart} – ${report.periodEnd}` : ""}
            {` · Responsable: ${row.responsibleName ?? "—"}`}
            {row.templateName ? ` · Plantilla: ${row.templateName}` : ""}
          </>
        }
        action={
          <>
            {metrics ? (
              <>
                <a href={`/reports/${report.id}/print`} target="_blank" className={buttonSecondaryClass}>
                  <FileText className="size-4" /> PDF (imprimir)
                </a>
                <a href={`/api/reports/${report.id}/export?dataset=summary`} className={buttonSecondaryClass}>
                  <Download className="size-4" /> CSV
                </a>
              </>
            ) : null}
            <Link href="/reports" className={buttonSecondaryClass}>Volver</Link>
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

      {tab === "preview" ? <PreviewTab report={report} metrics={metrics} clientName={row.clientName} /> : null}
      {tab === "content" ? (
        ["sent", "archived"].includes(report.status) ? (
          <p className="text-sm text-muted">
            Un reporte {report.status === "sent" ? "enviado" : "archivado"} no se edita — duplícalo para partir de su contenido.
          </p>
        ) : (
          <div className="max-w-3xl">
            <Card className="p-6">
              <NarrativeForm report={report} />
            </Card>
          </div>
        )
      ) : null}
      {tab === "metrics" ? <MetricsTab metrics={metrics} /> : null}
      {tab === "versions" ? <VersionsTab orgId={user.organizationId} reportId={report.id} /> : null}
      {tab === "history" ? <HistoryTab orgId={user.organizationId} reportId={report.id} /> : null}
      {tab === "config" ? (
        <ConfigTab
          report={report}
          isMgmt={isMgmt}
          isSuperAdmin={user.role === "superadmin"}
          contacts={clientContacts.map((c) => ({ id: c.id, name: `${c.name} ${c.lastName}` }))}
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
  clientName,
}: {
  report: typeof reports.$inferSelect;
  metrics: PeriodMetrics | null;
  clientName: string | null;
}) {
  if (!metrics) {
    return (
      <EmptyState icon={<ClipboardList />} title="Aún no se genera el contenido">
        Genera el reporte para calcular las métricas del periodo y congelarlas como snapshot.
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
          <p className="text-xs tracking-widest text-faint uppercase">Reporte {reportTypeMeta[report.reportType]?.label}</p>
          <h2 className="mt-2 text-2xl font-semibold text-fg">{report.title}</h2>
          <p className="mt-2 text-sm text-muted">
            {clientName ?? "Interno"} · {report.periodStart} – {report.periodEnd} · v{report.version}
          </p>
        </Card>
      ) : null}
      {has("executive_summary") && (report.executiveSummary || report.content) ? (
        <Card className="p-6">
          <CardHeader title="Resumen ejecutivo" className="mb-3 px-0 pt-0" />
          <p className="text-sm whitespace-pre-wrap text-fg">{report.executiveSummary || report.content}</p>
        </Card>
      ) : null}
      {has("period_summary") ? (
        <Card className="p-6">
          <CardHeader title="Resumen del periodo" className="mb-3 px-0 pt-0" />
          <p className="text-sm whitespace-pre-wrap text-fg">{report.content}</p>
        </Card>
      ) : null}
      {has("tickets") ? (
        <Card className="p-6">
          <CardHeader title="Tickets" className="mb-2 px-0 pt-0" />
          <MetricLine label="Creados" value={metrics.tickets.created} />
          <MetricLine label="Cerrados" value={metrics.tickets.closed} />
          <MetricLine label="Abiertos al final del periodo" value={metrics.tickets.openAtEnd} />
          <MetricLine label="Reabiertos" value={metrics.tickets.reopened} />
          {metrics.tickets.avgFirstResponseMinutes !== null ? (
            <MetricLine label="Primera respuesta promedio" value={formatMinutes(metrics.tickets.avgFirstResponseMinutes)} />
          ) : null}
          {metrics.tickets.avgResolutionMinutes !== null ? (
            <MetricLine label="Resolución promedio" value={formatMinutes(metrics.tickets.avgResolutionMinutes)} />
          ) : null}
        </Card>
      ) : null}
      {has("sla") ? (
        <Card className="p-6">
          <CardHeader title="SLA" className="mb-2 px-0 pt-0" />
          <MetricLine label="Tickets evaluados" value={metrics.sla.evaluated} />
          <MetricLine label="Cumplidos" value={metrics.sla.met} />
          <MetricLine label="Cumplimiento" value={metrics.sla.compliancePct !== null ? `${metrics.sla.compliancePct}%` : "No disponible"} />
          <MetricLine label="Primera respuesta" value={metrics.sla.firstResponsePct !== null ? `${metrics.sla.firstResponsePct}%` : "No disponible"} />
          <MetricLine label="Excluidos (sin SLA)" value={metrics.sla.excludedNoSla} />
        </Card>
      ) : null}
      {has("activities") ? (
        <Card className="p-6">
          <CardHeader title="Actividades" className="mb-2 px-0 pt-0" />
          <MetricLine label="Creadas" value={metrics.activities.created} />
          <MetricLine label="Completadas" value={metrics.activities.completed} />
          <MetricLine label="Vencidas ahora" value={metrics.activities.overdueNow} />
        </Card>
      ) : null}
      {has("time") ? (
        <Card className="p-6">
          <CardHeader title="Tiempo" className="mb-2 px-0 pt-0" />
          <MetricLine label="Total" value={formatMinutes(metrics.time.total)} />
          <MetricLine label="Facturable" value={formatMinutes(metrics.time.billable)} />
          <MetricLine label="Incluido en contrato" value={formatMinutes(metrics.time.inContract)} />
        </Card>
      ) : null}
      {has("billing") ? (
        <Card className="p-6">
          <CardHeader title="Cobro operativo" className="mb-2 px-0 pt-0" />
          <MetricLine label="Por revisar" value={metrics.billing.pendingReview} />
          <MetricLine label="Cobrables" value={metrics.billing.billable} />
          <MetricLine label="Monto potencial" value={fmtMoney(metrics.billing.potentialAmount)} />
        </Card>
      ) : null}
      {has("conclusions") && report.conclusions ? (
        <Card className="p-6">
          <CardHeader title="Conclusiones" className="mb-3 px-0 pt-0" />
          <p className="text-sm whitespace-pre-wrap text-fg">{report.conclusions}</p>
        </Card>
      ) : null}
      {has("recommendations") && report.recommendations ? (
        <Card className="p-6">
          <CardHeader title="Recomendaciones" className="mb-3 px-0 pt-0" />
          <p className="text-sm whitespace-pre-wrap text-fg">{report.recommendations}</p>
        </Card>
      ) : null}
      <p className="text-center text-xs text-faint">
        Datos calculados el {metrics.computedAt.slice(0, 10)} — snapshot congelado, no cambia si la
        operación cambia después. Las notas internas nunca aparecen aquí.
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------- metrics */

function MetricsTab({ metrics }: { metrics: PeriodMetrics | null }) {
  if (!metrics) {
    return <p className="text-sm text-muted">Sin métricas — genera el reporte primero.</p>;
  }
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard icon={<ClipboardList />} label="Tickets creados" value={String(metrics.tickets.created)} />
        <StatCard icon={<ClipboardList />} label="Tickets cerrados" value={String(metrics.tickets.closed)} />
        <StatCard icon={<History />} label="SLA" value={metrics.sla.compliancePct !== null ? `${metrics.sla.compliancePct}%` : "N/D"} />
        <StatCard icon={<History />} label="Tiempo" value={formatMinutes(metrics.time.total)} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BreakdownCard title="Tickets por técnico" rows={metrics.tickets.byAssignee.map((r) => [r.key, `${r.created} / ${r.closed}`])} note="creados / cerrados" />
        <BreakdownCard title="Tickets por categoría" rows={metrics.tickets.byCategory.map((r) => [r.key, `${r.created} / ${r.closed}`])} note="creados / cerrados" />
        <BreakdownCard title="Tiempo por persona" rows={metrics.time.byUser.map((r) => [r.key, formatMinutes(r.minutes)])} />
        <BreakdownCard title="Tiempo por cliente" rows={metrics.time.byClient.map((r) => [r.key, formatMinutes(r.minutes)])} />
        <BreakdownCard
          title="SLA por prioridad"
          rows={metrics.sla.byPriority.map((r) => [r.key, r.evaluated > 0 ? `${Math.round((r.met / r.evaluated) * 100)}% (${r.met}/${r.evaluated})` : "N/D"])}
        />
        <BreakdownCard
          title="Recurrentes"
          rows={[
            ["Ejecuciones", String(metrics.recurring.executions)],
            ["Exitosas", String(metrics.recurring.succeeded)],
            ["Fallidas", String(metrics.recurring.failed)],
          ]}
        />
      </div>
    </div>
  );
}

function BreakdownCard({ title, rows, note }: { title: string; rows: [string, string][]; note?: string }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader title={title} description={note} />
      {rows.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted">Sin datos en el periodo.</p>
      ) : (
        <ul className="divide-y divide-edge">
          {rows.map(([k, v]) => (
            <li key={k} className="flex items-center justify-between px-5 py-2 text-sm">
              <span className="text-fg">{k}</span>
              <span className="tabular-nums text-muted">{v}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------- versions */

async function VersionsTab({ orgId, reportId }: { orgId: number; reportId: number }) {
  const rows = await db
    .select({ version: reportVersions, authorName: users.name })
    .from(reportVersions)
    .leftJoin(users, eq(reportVersions.authorId, users.id))
    .where(and(eq(reportVersions.organizationId, orgId), eq(reportVersions.reportId, reportId)))
    .orderBy(desc(reportVersions.versionNumber));
  if (rows.length === 0) {
    return <p className="text-sm text-muted">Sin versiones todavía — la primera generación crea la v1.</p>;
  }
  return (
    <Card className="overflow-visible">
      <Table>
        <THead>
          <tr>
            <Th>Versión</Th>
            <Th>Autor</Th>
            <Th>Fecha</Th>
            <Th>Motivo</Th>
            <Th>Aprobada</Th>
            <Th>Enviada</Th>
          </tr>
        </THead>
        <tbody className="divide-y divide-edge">
          {rows.map(({ version, authorName }) => (
            <tr key={version.id}>
              <Td className="font-medium text-fg tabular-nums">v{version.versionNumber}</Td>
              <Td className="text-muted">{authorName ?? "sistema"}</Td>
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

async function HistoryTab({ orgId, reportId }: { orgId: number; reportId: number }) {
  const rows = await db
    .select({ log: auditLogs, actorName: users.name })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(and(eq(auditLogs.organizationId, orgId), eq(auditLogs.entityType, "report"), eq(auditLogs.entityId, reportId)))
    .orderBy(asc(auditLogs.createdAt));
  if (rows.length === 0) return <p className="text-sm text-muted">Sin eventos todavía.</p>;
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
              {actorName ?? "sistema"} · {fmtDateTime(log.createdAt)}
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
}: {
  report: typeof reports.$inferSelect;
  isMgmt: boolean;
  isSuperAdmin: boolean;
  contacts: { id: number; name: string }[];
}) {
  return (
    <div className="max-w-2xl space-y-4">
      {["draft", "changes_requested", "failed", "ready_for_review"].includes(report.status) ? (
        <Card className="p-5">
          <CardHeader
            title={report.version > 0 && report.generatedAt ? "Regenerar" : "Generar"}
            description="Calcula las métricas del periodo y crea la siguiente versión."
            className="mb-3 px-0 pt-0"
          />
          <RowAction action="generateReportAction" fields={{ id: report.id }} label={report.generatedAt ? "Regenerar (nueva versión)" : "Generar contenido"} />
        </Card>
      ) : null}
      {report.status === "ready_for_review" ? (
        <>
          <Card className="p-5">
            <CardHeader title="Solicitar cambios" className="mb-3 px-0 pt-0" />
            <RequestChangesForm id={report.id} />
          </Card>
          {isMgmt ? (
            <Card className="p-5">
              <CardHeader title="Aprobar" description="La aprobación queda ligada a la versión actual." className="mb-3 px-0 pt-0" />
              <RowAction action="approveReport" fields={{ id: report.id }} label={`Aprobar v${report.version}`} />
            </Card>
          ) : null}
        </>
      ) : null}
      {isMgmt && ["approved", "ready_for_review"].includes(report.status) ? (
        <Card className="p-5">
          <CardHeader
            title="Marcar enviado"
            description={report.status === "approved" ? "Registra el envío del reporte aprobado." : "Enviar sin aprobación requiere motivo de excepción (auditado)."}
            className="mb-3 px-0 pt-0"
          />
          <MarkSentForm id={report.id} approved={report.status === "approved"} contacts={contacts} />
        </Card>
      ) : null}
      <Card className="p-5">
        <CardHeader title="Otras acciones" className="mb-3 px-0 pt-0" />
        <div className="flex flex-wrap gap-3">
          <RowAction action="duplicateReport" fields={{ id: report.id }} label="Duplicar" />
          {report.status !== "archived" ? (
            <RowAction action="archiveReport" fields={{ id: report.id }} label="Archivar" confirm="¿Archivar este reporte? Historial y versiones se conservan." />
          ) : (
            <RowAction action="restoreReport" fields={{ id: report.id }} label="Restaurar" />
          )}
          {isSuperAdmin ? (
            <Disclosure label="Eliminación permanente (SuperAdmin)">
              <RowAction
                action="deleteReport"
                fields={{ id: report.id }}
                label="Eliminar permanentemente"
                confirm={`¿Eliminar "${report.title}" y todas sus versiones para siempre?`}
                danger
              />
            </Disclosure>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
