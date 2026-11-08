import Link from "next/link";
import { fmtDate } from "@/lib/format";
import { getLabels } from "@/lib/labels";
import { t, type Locale } from "@/lib/i18n";
import { workDetailHref } from "@/lib/work-peek";
import { formatMinutes } from "@/lib/time-entries";
import { getWorkItemTimeLog } from "@/lib/time-entries-data";
import { PanelRow, SidePanel } from "@/components/side-panel";
import { Badge, buttonClass, buttonSecondaryClass } from "@/components/ui";
import { TicketRowActions } from "../helpdesk/ticket-row-actions";
import type { WorkKanbanStatusOption } from "./work-kanban";
import type { WorkRow } from "./work-views";

/** Enough of the log to answer "what has been done here?" without scrolling past it. */
const TIME_LOG_LIMIT = 8;

/**
 * Quick view for a row of the combined Work list. The identity fields come
 * straight from the row the page already loaded, so they can never disagree
 * with the list behind it; the time log is the one thing fetched on open,
 * since totals are always computed from `time_entries` and never stored on the
 * work item. That query only runs when the panel is open, and the page renders
 * it inside a Suspense boundary so the list never waits for it.
 *
 * It is a preview, not a second detail page: the type-exclusive substance (SLA
 * and cobro for a ticket, project and subactivities for an activity) stays on
 * the real detail page, which this links straight into. Tickets also get the
 * inline status/priority/assignee controls, reused from the Helpdesk row
 * actions, so the common edits never need a page load.
 */
export async function WorkPeek({
  row,
  orgId,
  closeHref,
  locale,
  ticketStatuses,
  ticketPriorities,
  users,
}: {
  row: WorkRow;
  orgId: number;
  closeHref: string;
  locale: Locale;
  ticketStatuses: WorkKanbanStatusOption[];
  ticketPriorities: { id: number; name: string; isActive: boolean }[];
  users: { id: number; name: string }[];
}) {
  const { ticketBillingMeta, ticketPriorityMeta, workCategoryMeta } = getLabels(locale);
  const detailHref = workDetailHref({ type: row.type, entityId: row.entityId });
  const isTicket = row.type === "ticket";
  // `row.id` is work_items.id — the column time_entries hangs off, for both types.
  const timeLog = await getWorkItemTimeLog(orgId, row.id, TIME_LOG_LIMIT);

  return (
    <SidePanel
      closeHref={closeHref}
      label={t("Vista rápida", "Quick view", locale)}
      eyebrow={`${isTicket ? t("Ticket", "Ticket", locale) : t("Actividad", "Activity", locale)} · ${row.folio}`}
      title={row.title}
      footer={
        <>
          {isTicket && row.statusId !== null && row.priorityId !== null ? (
            <TicketRowActions
              ticketId={row.entityId}
              statusId={row.statusId}
              priorityId={row.priorityId}
              assigneeId={row.assigneeId}
              users={users}
              statuses={ticketStatuses}
              priorities={ticketPriorities}
            />
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Link href={detailHref} className={buttonClass}>
              {t("Abrir detalle completo", "Open full detail", locale)}
            </Link>
            <Link href={`${detailHref}?tab=time`} className={buttonSecondaryClass}>
              {t("Registrar tiempo", "Log time", locale)}
            </Link>
            {isTicket ? (
              <Link href={`${detailHref}?tab=resolution`} className={buttonSecondaryClass}>
                {t("Resolver / Cerrar", "Resolve / Close", locale)}
              </Link>
            ) : null}
          </div>
        </>
      }
    >
      <dl className="space-y-2 text-sm">
        <PanelRow
          label={t("Empresa", "Company", locale)}
          value={
            row.companyName && row.companyId ? (
              <Link href={`/companies/${row.companyId}`} className="hover:text-primary hover:underline">
                {row.companyName}
              </Link>
            ) : (
              t("Interno", "Internal", locale)
            )
          }
        />
        <PanelRow
          label={t("Responsable", "Assignee", locale)}
          value={row.assigneeName ?? t("Sin asignar", "Unassigned", locale)}
        />
        <PanelRow label={t("Estado", "Status", locale)} value={row.statusLabel} />
        <PanelRow
          label={t("Etapa", "Stage", locale)}
          value={workCategoryMeta[row.category]?.label ?? row.category}
        />
        <PanelRow
          label={t("Prioridad", "Priority", locale)}
          value={
            <Badge tone={ticketPriorityMeta[row.priority]?.tone ?? "slate"}>
              {ticketPriorityMeta[row.priority]?.label ?? row.priority}
            </Badge>
          }
        />
        <PanelRow
          label={t("Vence", "Due", locale)}
          value={row.dueDate ? fmtDate(row.dueDate) : t("Sin fecha", "No date", locale)}
        />
      </dl>

      {row.description?.trim() ? (
        <section className="mt-5 border-t border-edge pt-4">
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">
            {t("Descripción", "Description", locale)}
          </h3>
          {/* whitespace-pre-wrap: descriptions are plain text with the author's own line breaks. */}
          <p className="whitespace-pre-wrap text-sm text-fg">{row.description}</p>
        </section>
      ) : null}

      <section className="mt-5 border-t border-edge pt-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
            {t("Tiempo registrado", "Time logged", locale)}
          </h3>
          <span className="text-xs tabular-nums text-muted">
            {timeLog.totalMinutes > 0 ? formatMinutes(timeLog.totalMinutes) : "—"}
            {timeLog.billableMinutes > 0
              ? ` · ${formatMinutes(timeLog.billableMinutes)} ${t("facturable", "billable", locale)}`
              : ""}
          </span>
        </div>

        {timeLog.entryCount === 0 ? (
          <p className="text-sm text-muted">{t("Sin tiempo registrado.", "No time logged.", locale)}</p>
        ) : (
          <ul className="space-y-2.5">
            {timeLog.entries.map((entry) => (
              <li key={entry.id} className="text-sm">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="tabular-nums text-fg">{fmtDate(entry.date)}</span>
                  <span className="font-medium tabular-nums text-fg">{formatMinutes(entry.durationMinutes)}</span>
                  <span className="truncate text-muted">{entry.userName ?? t("Sin usuario", "No user", locale)}</span>
                  <Badge tone={ticketBillingMeta[entry.billingStatus]?.tone ?? "slate"}>
                    {ticketBillingMeta[entry.billingStatus]?.label ?? entry.billingStatus}
                  </Badge>
                </div>
                {entry.description.trim() ? (
                  <p className="mt-0.5 text-xs text-muted">{entry.description}</p>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {timeLog.entryCount > timeLog.entries.length ? (
          <Link href={`${detailHref}?tab=time`} className="mt-2.5 inline-block text-xs text-primary hover:underline">
            {t(
              `Ver los ${timeLog.entryCount} registros`,
              `See all ${timeLog.entryCount} entries`,
              locale,
            )}
          </Link>
        ) : null}

        {/* Voided entries are in no total above — say so rather than leave a silent gap. */}
        {timeLog.voidedCount > 0 ? (
          <p className="mt-2 text-xs text-faint">
            {t(
              `${timeLog.voidedCount} registro(s) anulado(s), no contados.`,
              `${timeLog.voidedCount} voided entr(ies), not counted.`,
              locale,
            )}
          </p>
        ) : null}
      </section>
    </SidePanel>
  );
}
