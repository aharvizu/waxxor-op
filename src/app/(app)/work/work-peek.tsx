import Link from "next/link";
import { fmtDate } from "@/lib/format";
import { getLabels } from "@/lib/labels";
import { t, type Locale } from "@/lib/i18n";
import { workDetailHref } from "@/lib/work-peek";
import { PanelRow, SidePanel } from "@/components/side-panel";
import { Badge, buttonClass, buttonSecondaryClass } from "@/components/ui";
import { TicketRowActions } from "../helpdesk/ticket-row-actions";
import type { WorkKanbanStatusOption } from "./work-kanban";
import type { WorkRow } from "./work-views";

/**
 * Quick view for a row of the combined Work list. Reads **only the row the
 * page already loaded** — no second query — so opening the panel costs nothing
 * and can never disagree with the list behind it.
 *
 * It is a preview, not a second detail page: the type-exclusive substance (SLA
 * and cobro for a ticket, project and subactivities for an activity) stays on
 * the real detail page, which this links straight into. Tickets also get the
 * inline status/priority/assignee controls, reused from the Helpdesk row
 * actions, so the common edits never need a page load.
 */
export function WorkPeek({
  row,
  closeHref,
  locale,
  ticketStatuses,
  ticketPriorities,
  users,
}: {
  row: WorkRow;
  closeHref: string;
  locale: Locale;
  ticketStatuses: WorkKanbanStatusOption[];
  ticketPriorities: { id: number; name: string; isActive: boolean }[];
  users: { id: number; name: string }[];
}) {
  const { ticketPriorityMeta, workCategoryMeta } = getLabels(locale);
  const detailHref = workDetailHref({ type: row.type, entityId: row.entityId });
  const isTicket = row.type === "ticket";

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
    </SidePanel>
  );
}
