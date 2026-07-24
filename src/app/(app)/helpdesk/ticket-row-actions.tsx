"use client";

import { useActionState } from "react";
import { cx, inputClass } from "@/components/ui";
import { FormAlert } from "@/components/form-feedback";
import type { ActionState } from "@/lib/action-result";
import { isWorkflowDropdownCategory } from "@/lib/tickets";
import type { TicketStatusCategoryValue } from "@/lib/ticket-catalogs";
import { assignTicket, changeTicketStatus, setTicketPriority } from "./actions";

type Option = { id: number; name: string };
type StatusOption = Option & { category: TicketStatusCategoryValue; isActive: boolean };
type PriorityOption = Option & { isActive: boolean };
const smallSelect = cx(inputClass, "h-7 w-auto max-w-28 px-1.5 text-xs");

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

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <form action={assignAction}>
        <input type="hidden" name="id" value={ticketId} />
        <select
          name="assigneeId"
          key={assigneeId ?? "none"}
          defaultValue={assigneeId ?? ""}
          aria-label="Assign"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className={smallSelect}
        >
          <option value="">Assign…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </form>
      <form action={statusAction}>
        <input type="hidden" name="id" value={ticketId} />
        <select
          name="statusId"
          key={statusId}
          defaultValue={editableStatus ? statusId : ""}
          aria-label="Status"
          disabled={!editableStatus}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className={smallSelect}
        >
          {!editableStatus ? (
            <option value="" disabled>
              {currentStatus?.name ?? statusId}
            </option>
          ) : null}
          {workflowStatuses.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </form>
      <form action={priorityAction}>
        <input type="hidden" name="id" value={ticketId} />
        <select
          name="priorityId"
          key={priorityId}
          defaultValue={priorityId}
          aria-label="Priority"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className={smallSelect}
        >
          {priorityOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </form>
      {[assignState, statusState, priorityState].map((s, i) =>
        s && !s.ok ? <FormAlert key={i} state={s} className="w-full" /> : null,
      )}
    </div>
  );
}
