"use client";

import { useActionState } from "react";
import { cx, inputClass } from "@/components/ui";
import { FormAlert } from "@/components/form-feedback";
import type { ActionState } from "@/lib/action-result";
import { TICKET_WORKFLOW_STATUSES } from "@/lib/tickets";
import { ticketStatusMeta } from "@/lib/labels";
import { assignTicket, changeTicketStatus, setTicketPriority } from "./actions";

type Option = { id: number; name: string };
const smallSelect = cx(inputClass, "h-7 w-auto max-w-28 px-1.5 text-xs");

/** Inline row controls: assign, status, priority — submit on change. */
export function TicketRowActions({
  ticketId,
  status,
  priority,
  assigneeId,
  users,
}: {
  ticketId: number;
  status: string;
  priority: string;
  assigneeId: number | null;
  users: Option[];
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
  const editableStatus = TICKET_WORKFLOW_STATUSES.includes(status as never);

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
          name="status"
          key={status}
          defaultValue={editableStatus ? status : ""}
          aria-label="Status"
          disabled={!editableStatus}
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className={smallSelect}
        >
          {!editableStatus ? (
            <option value="" disabled>
              {ticketStatusMeta[status]?.label ?? status}
            </option>
          ) : null}
          {TICKET_WORKFLOW_STATUSES.map((s) => (
            <option key={s} value={s}>
              {ticketStatusMeta[s]?.label ?? s}
            </option>
          ))}
        </select>
      </form>
      <form action={priorityAction}>
        <input type="hidden" name="id" value={ticketId} />
        <select
          name="priority"
          key={priority}
          defaultValue={priority}
          aria-label="Priority"
          onChange={(e) => e.currentTarget.form?.requestSubmit()}
          className={smallSelect}
        >
          {["low", "medium", "high", "critical"].map((p) => (
            <option key={p} value={p}>
              {p}
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
