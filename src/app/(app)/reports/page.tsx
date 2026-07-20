import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import { ClipboardList, Plus } from "lucide-react";
import { db } from "@/db";
import { companies, projects, reports, users } from "@/db/schema";
import { fmtDate } from "@/lib/format";
import { reportStatusMeta, reportTypeMeta } from "@/lib/labels";
import { REPORT_STATUSES, REPORT_TYPES } from "@/lib/reports";
import { requireUser } from "@/lib/session";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  THead,
  Table,
  Td,
  Th,
  buttonClass,
  buttonSecondaryClass,
  cx,
  inputClass,
} from "@/components/ui";
import { RowAction } from "./report-forms";

export const metadata: Metadata = { title: "Reports" };

const VIEWS = [
  ["", "Todos"],
  ["mine", "Mis reportes"],
  ["draft", "Borradores"],
  ["pending_review", "Pendientes de revisión"],
  ["changes", "Cambios solicitados"],
  ["approved", "Aprobados"],
  ["pending_send", "Pendientes de envío"],
  ["sent", "Enviados"],
  ["failed", "Fallidos"],
  ["recurrent", "Recurrentes"],
  ["archived", "Archivados"],
] as const;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string;
    status?: string;
    reportType?: string;
    companyId?: string;
    projectId?: string;
    responsibleId?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;

  const conditions = [eq(reports.organizationId, user.organizationId)];
  switch (params.view) {
    case "mine":
      conditions.push(eq(reports.responsibleUserId, Number(user.id)));
      conditions.push(ne(reports.status, "archived"));
      break;
    case "draft":
      conditions.push(or(eq(reports.status, "draft"), eq(reports.status, "generating"))!);
      break;
    case "pending_review":
      conditions.push(eq(reports.status, "ready_for_review"));
      break;
    case "changes":
      conditions.push(eq(reports.status, "changes_requested"));
      break;
    case "approved":
      conditions.push(eq(reports.status, "approved"));
      break;
    case "pending_send":
      conditions.push(eq(reports.status, "approved"));
      conditions.push(isNull(reports.sentAt));
      break;
    case "sent":
      conditions.push(eq(reports.status, "sent"));
      break;
    case "failed":
      conditions.push(eq(reports.status, "failed"));
      break;
    case "recurrent":
      conditions.push(
        sql`exists (select 1 from audit_logs al where al.entity_type = 'report'
          and al.entity_id = ${reports.id} and al.metadata ? 'generatedByRecurrenceId')`,
      );
      break;
    case "archived":
      conditions.push(eq(reports.status, "archived"));
      break;
    default:
      conditions.push(ne(reports.status, "archived"));
  }
  if (params.status && (REPORT_STATUSES as readonly string[]).includes(params.status)) {
    conditions.push(eq(reports.status, params.status as (typeof reports.$inferSelect)["status"]));
  }
  if (params.reportType && (REPORT_TYPES as readonly string[]).includes(params.reportType)) {
    conditions.push(eq(reports.reportType, params.reportType as (typeof reports.$inferSelect)["reportType"]));
  }
  if (params.companyId) conditions.push(eq(reports.companyId, Number(params.companyId)));
  if (params.projectId) conditions.push(eq(reports.projectId, Number(params.projectId)));
  if (params.responsibleId) conditions.push(eq(reports.responsibleUserId, Number(params.responsibleId)));

  const [rows, companyRows, projectRows, userRows] = await Promise.all([
    db
      .select({
        report: reports,
        companyName: companies.name,
        projectName: projects.name,
        responsibleName: users.name,
      })
      .from(reports)
      .leftJoin(companies, eq(reports.companyId, companies.id))
      .leftJoin(projects, eq(reports.projectId, projects.id))
      .leftJoin(users, eq(reports.responsibleUserId, users.id))
      .where(and(...conditions))
      .orderBy(desc(reports.updatedAt))
      .limit(200),
    db.select({ id: companies.id, name: companies.name }).from(companies).where(eq(companies.organizationId, user.organizationId)).orderBy(asc(companies.name)),
    db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.organizationId, user.organizationId)).orderBy(asc(projects.name)),
    db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.organizationId, user.organizationId), ne(users.role, "client"))).orderBy(asc(users.name)),
  ]);

  const buildHref = (patch: Record<string, string | undefined>) => {
    const next = { ...params, ...patch };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) qs.set(k, v);
    const s = qs.toString();
    return s ? `/reports?${s}` : "/reports";
  };

  return (
    <div>
      <PageHeader
        title="Reportes"
        subtitle="Reportes operativos por cliente y periodo — revisión, aprobación y envío."
        action={
          <>
            <Link href="/reports/templates" className={buttonSecondaryClass}>Plantillas</Link>
            <Link href="/reports/new" className={buttonClass}>
              <Plus className="size-4" /> Nuevo reporte
            </Link>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {VIEWS.map(([value, label]) => (
          <Link
            key={value}
            href={buildHref({ view: value || undefined })}
            className={cx(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              (params.view ?? "") === value
                ? "bg-primary-soft text-primary"
                : "border border-edge text-muted hover:bg-subtle hover:text-fg",
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      <form method="get" className="mb-6 flex flex-wrap items-center gap-3">
        {params.view ? <input type="hidden" name="view" value={params.view} /> : null}
        <select name="reportType" defaultValue={params.reportType ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">Tipo</option>
          {REPORT_TYPES.map((t) => <option key={t} value={t}>{reportTypeMeta[t]?.label ?? t}</option>)}
        </select>
        <select name="companyId" defaultValue={params.companyId ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">Empresa</option>
          {companyRows.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="projectId" defaultValue={params.projectId ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">Proyecto</option>
          {projectRows.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select name="responsibleId" defaultValue={params.responsibleId ?? ""} className={cx(inputClass, "w-auto")}>
          <option value="">Responsable</option>
          {userRows.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <button type="submit" className={buttonSecondaryClass}>Filtrar</button>
      </form>

      {rows.length === 0 ? (
        <EmptyState
          icon={<ClipboardList />}
          title="Sin reportes en esta vista"
          action={
            <div className="flex gap-2">
              <Link href="/reports/new" className={buttonSecondaryClass}>Crear reporte</Link>
              <Link href="/recurring/new?targetType=report" className={buttonSecondaryClass}>Programar reporte mensual</Link>
            </div>
          }
        >
          Crea un reporte del periodo o programa uno recurrente por cliente.
        </EmptyState>
      ) : (
        <Card className="overflow-visible">
          <Table>
            <THead>
              <tr>
                <Th>Nombre</Th>
                <Th>Empresa</Th>
                <Th>Proyecto</Th>
                <Th>Tipo</Th>
                <Th>Periodo</Th>
                <Th>Versión</Th>
                <Th>Responsable</Th>
                <Th>Estado</Th>
                <Th>Generado</Th>
                <Th>Enviado</Th>
                <Th>Acciones</Th>
              </tr>
            </THead>
            <tbody className="divide-y divide-edge">
              {rows.map(({ report, companyName, projectName, responsibleName }) => (
                <tr key={report.id} className="group transition-colors hover:bg-subtle">
                  <Td>
                    <Link href={`/reports/${report.id}`} className="font-medium text-fg transition-colors group-hover:text-primary">
                      {report.title}
                    </Link>
                  </Td>
                  <Td className="text-muted">{companyName ?? "Interno"}</Td>
                  <Td className="text-muted">{projectName ?? "—"}</Td>
                  <Td>
                    <Badge tone={reportTypeMeta[report.reportType]?.tone ?? "slate"}>
                      {reportTypeMeta[report.reportType]?.label ?? report.reportType}
                    </Badge>
                  </Td>
                  <Td className="text-muted tabular-nums">
                    {report.periodStart && report.periodEnd ? `${report.periodStart} – ${report.periodEnd}` : "—"}
                  </Td>
                  <Td className="tabular-nums text-muted">v{report.version}</Td>
                  <Td className="text-muted">{responsibleName ?? "—"}</Td>
                  <Td>
                    <Badge tone={reportStatusMeta[report.status]?.tone ?? "slate"}>
                      {reportStatusMeta[report.status]?.label ?? report.status}
                    </Badge>
                  </Td>
                  <Td className="text-muted">{report.generatedAt ? fmtDate(report.generatedAt) : "—"}</Td>
                  <Td className="text-muted">{report.sentAt ? fmtDate(report.sentAt) : "—"}</Td>
                  <Td>
                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      {["draft", "changes_requested", "failed"].includes(report.status) ? (
                        <RowAction action="generateReportAction" fields={{ id: report.id }} label="Generar" />
                      ) : null}
                      {report.status !== "archived" ? (
                        <RowAction action="archiveReport" fields={{ id: report.id }} label="Archivar" confirm={`¿Archivar "${report.title}"?`} />
                      ) : (
                        <RowAction action="restoreReport" fields={{ id: report.id }} label="Restaurar" />
                      )}
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
