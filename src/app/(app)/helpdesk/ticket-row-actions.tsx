"use client";

import { useActionState } from "react";
import { FormAlert } from "@/components/form-feedback";
import { SearchableSelect } from "@/components/searchable-select";
import type { ActionState } from "@/lib/action-result";
import { isWorkflowDropdownCategory } from "@/lib/tickets";
import type { TicketStatusCategoryValue } from "@/lib/ticket-catalogs";
import { assignTicket, changeTicketStatus, setTicketPriority } from "./actions";
import { useLocale } from "@/components/locale-provider";
import { t } from "@/lib/i18n";

type Option = { id: number; name: string };
type StatusOption = Option & { category: TicketStatusCategoryValue; isActive: boolean };
type PriorityOption = Option & { isActive: boolean };
const smallSelect = "h-7 w-auto max-w-28 px-1.5 text-xs";

/** Inline row controls: assign, status, priority — submit on change. */
export function TicketRowActions({
  ticketId,
  statusId,
  priorityId,
  assigneeId,
  users,
  statuses,
  priorities,
}: {
  ticketId: number;
  statusId: number;
  priorityId: number;
  assigneeId: number | null;
  users: Option[];
  /** Org's ticket statuses (active + inactive) — filtered to the workflow-eligible subset below. */
  statuses: StatusOption[];
  /** Org's ticket priorities (active + inactive) — filtered to active for the dropdown. */
  priorities: PriorityOption[];
}) {
  const [assignState, assignAction] = useActionState<ActionState, FormData>(
    assignTicket,
    null,
  );
  const [statusState, statusAction] = useActionState<ActionState, FormData>(
    changeTicketStatus,
    null,
  );
  const [priorityState, priorityAction] = useActionState<ActionState, FormData>(
    setTicketPriority,
    null,
  );

  const currentStatus = statuses.find((s) => s.id === statusId);
  const workflowStatuses = statuses.filter((s) => s.isActive && isWorkflowDropdownCategory(s.category));
  const editableStatus = currentStatus ? currentStatus.isActive && isWorkflowDropdownCategory(currentStatus.category) : false;

  const priorityOptions = priorities.filter((p) => p.isActive || p.id === priorityId);
  const locale = useLocale();

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <form action={assignAction}>
        <input type="hidden" name="id" value={ticketId} />
        <SearchableSelect
          name="assigneeId"
          key={assigneeId ?? "none"}
          defaultValue={assigneeId ? String(assigneeId) : ""}
          aria-label={t("Asignar", "Assign", locale)}
          submitOnChange
          className={smallSelect}
          options={[{ value: "", label: t("Asignar…", "Assign…", locale) }, ...users.map((u) => ({ value: String(u.id), label: u.name }))]}
        />
      </form>
      <form action={statusAction}>
        <input type="hidden" name="id" value={ticketId} />
        <SearchableSelect
          name="statusId"
          key={statusId}
          defaultValue={editableStatus ? String(statusId) : ""}
          aria-label={t("Estado", "Status", locale)}
          disabled={!editableStatus}
          submitOnChange
          className={smallSelect}
          options={[
            ...(!editableStatus ? [{ value: "", label: currentStatus?.name ?? String(statusId), disabled: true }] : []),
            ...workflowStatuses.map((s) => ({ value: String(s.id), label: s.name })),
          ]}
        />
      </form>
      <form action={priorityAction}>
        <input type="hidden" name="id" value={ticketId} />
        <SearchableSelect
          name="priorityId"
          key={priorityId}
          defaultValue={String(priorityId)}
          aria-label={t("Prioridad", "Priority", locale)}
          submitOnChange
          className={smallSelect}
          options={priorityOptions.map((p) => ({ value: String(p.id), label: p.name }))}
        />
      </form>
      {[assignState, statusState, priorityState].map((s, i) =>
        s && !s.ok ? <FormAlert key={i} state={s} className="w-full" /> : null,
      )}
    </div>
  );
}
