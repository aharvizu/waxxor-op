import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { getLabels } from "@/lib/labels";
import { getOrgLocale } from "@/lib/get-org-locale";
import { t, type Locale } from "@/lib/i18n";
import {
  getProjectActivityMessages,
  getProjectDetail,
  getProjectMilestones,
  getProjectRisks,
  getProjectWorkTree,
  toProgressInput,
  type ProjectActivityMessage,
  type ProjectTreeActivity,
} from "@/lib/project-data";
import { computeProgress } from "@/lib/projects";
import { requireUser } from "@/lib/session";
import { getSetting } from "@/lib/settings-data";
import { formatMinutes } from "@/lib/time-entries";
import { PrintButton } from "@/components/print-button";

export const metadata: Metadata = { title: "Reporte de proyecto — PDF" };

/**
 * Printable project progress report — same browser-print mechanism as
 * reports/billing/print and reports/[id]/print (no PDF library). A single
 * current-state snapshot, no period filter: unlike billing this isn't
 * about a date range, it's evidence of where the project stands today.
 */
export default async function ProjectReportPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId)) notFound();

  const locale = await getOrgLocale(user.organizationId);
  const {
    projectStatusMeta,
    projectHealthMeta,
    projectPriorityMeta,
    activityStatusMeta,
    ticketPriorityMeta,
    riskSeverityMeta,
    projectListStatusMeta,
    milestoneStatusMeta,
  } = getLabels(locale);

  const [detail, milestones, risks, tree, activityMessages, branding, profile, [org]] = await Promise.all([
    getProjectDetail(user.organizationId, projectId),
    getProjectMilestones(user.organizationId, projectId),
    getProjectRisks(user.organizationId, projectId),
    getProjectWorkTree(user.organizationId, projectId),
    getProjectActivityMessages(user.organizationId, projectId),
    getSetting(user.organizationId, "reports.branding"),
    getSetting(user.organizationId, "organization.profile"),
    db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, user.organizationId)),
  ]);
  if (!detail) notFound();

  const messagesByWorkItem = new Map<number, ProjectActivityMessage[]>();
  for (const m of activityMessages) {
    const list = messagesByWorkItem.get(m.workItemId);
    if (list) list.push(m);
    else messagesByWorkItem.set(m.workItemId, [m]);
  }

  // reports.branding.logo wins when set, otherwise fall back to the org's
  // general profile logo — same precedence as reports/billing/print.
  const logo = branding.logo ?? profile.logo;
  const orgName = org?.name ?? "Waxxor";
  const project = detail.project;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const progress = computeProgress(toProgressInput(detail, now));

  const openRisks = risks.filter((r) => ["open", "monitoring", "occurred"].includes(r.risk.status));

  const pending: string[] = [];
  if (detail.overdue > 0)
    pending.push(t(`${detail.overdue} actividad(es) vencida(s)`, `${detail.overdue} overdue activit${detail.overdue === 1 ? "y" : "ies"}`, locale));
  if (detail.blocked > 0)
    pending.push(t(`${detail.blocked} actividad(es) bloqueada(s)`, `${detail.blocked} blocked activit${detail.blocked === 1 ? "y" : "ies"}`, locale));
  if (detail.unassigned > 0)
    pending.push(t(`${detail.unassigned} actividad(es) sin responsable`, `${detail.unassigned} unassigned activit${detail.unassigned === 1 ? "y" : "ies"}`, locale));
  if (detail.milestonesOverdue > 0)
    pending.push(t(`${detail.milestonesOverdue} hito(s) vencido(s)`, `${detail.milestonesOverdue} overdue milestone(s)`, locale));
  if (detail.openHighRisks > 0)
    pending.push(
      t(`${detail.openHighRisks} riesgo(s) alto(s)/crítico(s) abierto(s)`, `${detail.openHighRisks} open high/critical risk(s)`, locale),
    );

  const byList = new Map<number | null, ProjectTreeActivity[]>();
  for (const a of tree.activities) {
    const list = byList.get(a.listId);
    if (list) list.push(a);
    else byList.set(a.listId, [a]);
  }
  const listSections = [
    ...tree.lists.map((l) => ({ id: l.id, name: l.name, status: l.status, items: byList.get(l.id) ?? [] })),
    ...(byList.has(null) ? [{ id: -1, name: t("Sin lista", "No list", locale), status: null, items: byList.get(null)! }] : []),
  ].filter((s) => s.items.length > 0);

  return (
    <div className="mx-auto max-w-[720px] bg-white p-10 text-slate-900 print:p-0">
      <div className="mb-6 flex justify-end print:hidden">
        <PrintButton label={t("Imprimir / PDF", "Print / PDF", locale)} />
      </div>

      <header className="mb-6 border-b-4 border-slate-900 pb-4">
        {logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logo} alt={orgName} className="mb-3 h-10 w-auto" />
        ) : null}
        <p className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">
          {branding.coverSubtitle || t("Seguridad Informática", "IT Security", locale)}
        </p>
        <h1 className="mt-2 text-2xl font-bold">{t("Reporte de avance de proyecto", "Project progress report", locale)}</h1>
        <div className="mt-3 flex items-end justify-between">
          <div className="text-sm text-slate-700">
            <p>
              <span className="font-mono text-xs text-slate-500">{project.folio}</span> <strong>{project.name}</strong>
            </p>
            <p>
              {t("Cliente", "Client", locale)}: <strong>{detail.companyName ?? t("Interno", "Internal", locale)}</strong>
            </p>
            <p>
              PM: <strong>{detail.managerName ?? "—"}</strong>
            </p>
            <p>
              {t("Generado", "Generated", locale)}: <strong>{fmtDateTime(now)}</strong>
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-slate-500 uppercase">{t("Avance", "Progress", locale)}</p>
            <p className="text-2xl font-bold tabular-nums">{progress.percent}%</p>
            <p className="text-xs text-slate-500">{progressDaysLabel(progress.daysRemaining, locale)}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-slate-600">
          <span>
            {t("Estado", "Status", locale)}: <strong>{projectStatusMeta[project.status]?.label ?? project.status}</strong>
          </span>
          <span>
            {t("Salud", "Health", locale)}: <strong>{projectHealthMeta[project.healthStatus]?.label ?? project.healthStatus}</strong>
          </span>
          <span>
            {t("Prioridad", "Priority", locale)}: <strong>{projectPriorityMeta[project.priority]?.label ?? project.priority}</strong>
          </span>
          <span>
            {t("Objetivo", "Target", locale)}: <strong>{project.targetDate ? fmtDate(project.targetDate) : "—"}</strong>
          </span>
        </div>
      </header>

      <div className="mb-6 grid grid-cols-3 gap-4 text-sm">
        <SummaryStat label={t("Actividades", "Activities", locale)} value={`${detail.completed}/${detail.total}`} hint={t("completadas", "completed", locale)} />
        <SummaryStat label={t("Vencidas / bloqueadas", "Overdue / blocked", locale)} value={`${detail.overdue} / ${detail.blocked}`} />
        <SummaryStat label={t("Sin responsable", "Unassigned", locale)} value={String(detail.unassigned)} />
        <SummaryStat
          label={t("Hitos", "Milestones", locale)}
          value={`${detail.milestonesCompleted}/${detail.milestonesTotal}`}
          hint={detail.milestonesOverdue > 0 ? t(`${detail.milestonesOverdue} vencido(s)`, `${detail.milestonesOverdue} overdue`, locale) : undefined}
        />
        <SummaryStat
          label={t("Tiempo registrado", "Time logged", locale)}
          value={formatMinutes(detail.loggedMinutes)}
          hint={project.estimatedMinutes ? t(`de ${formatMinutes(project.estimatedMinutes)} estimados`, `of ${formatMinutes(project.estimatedMinutes)} estimated`, locale) : undefined}
        />
        <SummaryStat
          label={t("Riesgos abiertos", "Open risks", locale)}
          value={String(detail.openRisks)}
          hint={detail.openHighRisks > 0 ? t(`${detail.openHighRisks} alto(s)/crítico(s)`, `${detail.openHighRisks} high/critical`, locale) : undefined}
        />
      </div>

      <div className="mb-8">
        <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-600 uppercase">
          {t("Pendientes que requieren atención", "Items needing attention", locale)}
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-600">{t("Nada urgente — el proyecto está bajo control.", "Nothing urgent — the project is under control.", locale)}</p>
        ) : (
          <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
            {pending.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
      </div>

      {milestones.length > 0 ? (
        <div className="mb-8">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-600 uppercase">{t("Hitos", "Milestones", locale)}</h2>
          <table className="w-full border-collapse text-sm">
            <thead style={{ display: "table-header-group" }}>
              <tr className="border-b-2 border-slate-900 text-left text-xs font-semibold tracking-wide text-slate-600 uppercase">
                <th className="py-2 pr-2">{t("Hito", "Milestone", locale)}</th>
                <th className="py-2 pr-2">{t("Objetivo", "Target", locale)}</th>
                <th className="py-2 pr-2">{t("Estado", "Status", locale)}</th>
                <th className="py-2 text-right">{t("Actividades", "Activities", locale)}</th>
              </tr>
            </thead>
            <tbody>
              {milestones.map((m) => (
                <tr key={m.milestone.id} className="border-b border-slate-200 align-top">
                  <td className="py-2 pr-2">{m.milestone.name}</td>
                  <td className="py-2 pr-2 tabular-nums">{fmtDate(m.milestone.targetDate)}</td>
                  <td className="py-2 pr-2">{milestoneStatusMeta[m.milestone.status]?.label ?? m.milestone.status}</td>
                  <td className="py-2 text-right tabular-nums">{m.linkedCompleted}/{m.linkedActivities}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {listSections.map((section) => (
        <div key={section.id} className="mb-8" style={{ pageBreakInside: "avoid" }}>
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-600 uppercase">
            {section.name}
            {section.status ? ` — ${projectListStatusMeta[section.status]?.label ?? section.status}` : ""}
          </h2>
          <table className="w-full border-collapse text-sm">
            <thead style={{ display: "table-header-group" }}>
              <tr className="border-b-2 border-slate-900 text-left text-xs font-semibold tracking-wide text-slate-600 uppercase">
                <th className="py-2 pr-2">{t("Actividad", "Activity", locale)}</th>
                <th className="py-2 pr-2">{t("Responsable", "Assignee", locale)}</th>
                <th className="py-2 pr-2">{t("Estado", "Status", locale)}</th>
                <th className="py-2 pr-2">{t("Prioridad", "Priority", locale)}</th>
                <th className="py-2 pr-2">{t("Vence", "Due", locale)}</th>
                <th className="py-2 text-right">{t("Tiempo", "Time", locale)}</th>
              </tr>
            </thead>
            <tbody>
              {section.items.map((a) => (
                <tr key={a.activityId} className="border-b border-slate-200 align-top">
                  <td className="py-2 pr-2">
                    {a.parentActivityId ? "↳ " : ""}
                    {a.title}
                  </td>
                  <td className="py-2 pr-2 text-slate-600">{a.assigneeName ?? "—"}</td>
                  <td className="py-2 pr-2">{activityStatusMeta[a.status]?.label ?? a.status}</td>
                  <td className="py-2 pr-2">{ticketPriorityMeta[a.priority]?.label ?? a.priority}</td>
                  <td className={cxDue(a.status, a.dueDate, today)}>{a.dueDate ? fmtDate(a.dueDate) : "—"}</td>
                  <td className="py-2 text-right tabular-nums text-slate-600">{a.minutes > 0 ? formatMinutes(a.minutes) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {section.items.some((a) => (messagesByWorkItem.get(a.workItemId)?.length ?? 0) > 0) ? (
            <div className="mt-3">
              <h3 className="mb-1.5 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
                {t("Mensajes de la conversación", "Conversation messages", locale)}
              </h3>
              <div className="space-y-2.5">
                {section.items
                  .filter((a) => (messagesByWorkItem.get(a.workItemId)?.length ?? 0) > 0)
                  .map((a) => (
                    <div key={a.activityId} className="text-xs leading-relaxed text-slate-600">
                      <p className="font-medium text-slate-700">{a.title}</p>
                      <ul className="mt-0.5 space-y-1">
                        {messagesByWorkItem.get(a.workItemId)!.map((m, i) => (
                          <li key={i}>
                            <span className="text-slate-400">
                              {m.authorName ?? "—"} · {fmtDateTime(m.occurredAt)}:
                            </span>{" "}
                            {m.body}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
              </div>
            </div>
          ) : null}
        </div>
      ))}

      {openRisks.length > 0 ? (
        <div className="mb-8">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-600 uppercase">{t("Riesgos abiertos", "Open risks", locale)}</h2>
          <table className="w-full border-collapse text-sm">
            <thead style={{ display: "table-header-group" }}>
              <tr className="border-b-2 border-slate-900 text-left text-xs font-semibold tracking-wide text-slate-600 uppercase">
                <th className="py-2 pr-2">{t("Riesgo", "Risk", locale)}</th>
                <th className="py-2 pr-2">{t("Severidad", "Severity", locale)}</th>
                <th className="py-2 pr-2">{t("Responsable", "Owner", locale)}</th>
              </tr>
            </thead>
            <tbody>
              {openRisks.map((r) => (
                <tr key={r.risk.id} className="border-b border-slate-200 align-top">
                  <td className="py-2 pr-2">{r.risk.title}</td>
                  <td className="py-2 pr-2">{riskSeverityMeta[r.severity]?.label ?? r.severity}</td>
                  <td className="py-2 pr-2 text-slate-600">{r.ownerName ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="mt-16 grid grid-cols-2 gap-12 text-center text-xs text-slate-600">
        <div>
          <div className="border-t border-slate-400 pt-2">{t("Firma del cliente", "Client signature", locale)}</div>
        </div>
        <div>
          <div className="border-t border-slate-400 pt-2">
            {t("Firma / sello", "Signature / stamp", locale)} {orgName}
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryStat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="text-xs text-slate-500 uppercase">{label}</p>
      <p className="text-lg font-bold tabular-nums">{value}</p>
      {hint ? <p className="text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

function progressDaysLabel(daysRemaining: number | null, locale: Locale): string {
  if (daysRemaining === null) return t("Sin fecha objetivo", "No target date", locale);
  if (daysRemaining >= 0) return t(`${daysRemaining} días restantes`, `${daysRemaining} days remaining`, locale);
  return t(`${Math.abs(daysRemaining)} días de retraso`, `${Math.abs(daysRemaining)} days late`, locale);
}

function cxDue(status: string, dueDate: string | null, today: string): string {
  const open = ["pending", "in_progress", "waiting", "blocked"].includes(status);
  const overdue = open && dueDate !== null && dueDate < today;
  return `py-2 pr-2 tabular-nums ${overdue ? "font-medium text-red-600" : "text-slate-600"}`;
}
