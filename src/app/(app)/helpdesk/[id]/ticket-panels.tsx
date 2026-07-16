"use client";

import { useState, useActionState } from "react";
import Link from "next/link";
import { Check, Paperclip, Pencil, RotateCcw, Trash2, X } from "lucide-react";
import {
  Badge,
  buttonClass,
  buttonDangerClass,
  buttonSecondaryClass,
  cx,
  inputClass,
  labelClass,
} from "@/components/ui";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-result";
import { ACTIVITY_TYPES } from "@/lib/activities";
import {
  CONFIRMATION_TYPES,
  TICKET_BILLING_MODALITIES,
  TICKET_BILLING_STATUSES,
  TICKET_WORKFLOW_STATUSES,
} from "@/lib/tickets";
import {
  activityTypeMeta,
  confirmationTypeMeta,
  ticketBillingMeta,
  ticketStatusMeta,
} from "@/lib/labels";
import {
  assignTicket,
  changeTicketStatus,
  renameTicket,
  closeTicket,
  createRelatedActivity,
  deleteAttachment,
  deleteMessage,
  deleteTicket,
  editOwnNote,
  linkActivity,
  logMessage,
  reopenTicket,
  resolveTicket,
  setTicketBilling,
  setTicketPriority,
  unlinkActivity,
  updateTicketDetails,
  uploadAttachment,
} from "../actions";

type Option = { id: number; name: string };
const PRIORITIES = ["low", "medium", "high", "critical"] as const;
const CHANNELS = ["manual", "whatsapp", "email", "phone", "portal", "internal"] as const;

function useForm(action: (p: ActionState, f: FormData) => Promise<ActionState>) {
  return useActionState<ActionState, FormData>(action, null);
}

/* ------------------------------------------------------- header controls */

export function StatusSelect({
  ticketId,
  status,
  disabled,
}: {
  ticketId: number;
  status: string;
  disabled: boolean;
}) {
  const [state, formAction] = useForm(changeTicketStatus);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={ticketId} />
      <select
        name="status"
        key={status}
        defaultValue={TICKET_WORKFLOW_STATUSES.includes(status as never) ? status : ""}
        disabled={disabled}
        aria-label="Change status"
        className={cx(inputClass, "h-8 w-auto text-xs")}
      >
        {!TICKET_WORKFLOW_STATUSES.includes(status as never) ? (
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
      {!disabled ? (
        <button type="submit" className={cx(buttonSecondaryClass, "h-8 px-2.5 text-xs")}>
          Set
        </button>
      ) : null}
      {state && !state.ok ? <FormAlert state={state} className="w-full" /> : null}
    </form>
  );
}

export function TitleEditor({ ticketId, title }: { ticketId: number; title: string }) {
  const [editing, setEditing] = useState(false);
  const [state, formAction] = useForm(renameTicket);
  if (!editing) {
    return (
      <span className="group inline-flex items-center gap-2">
        <span>{title}</span>
        <button
          type="button"
          aria-label="Edit title"
          onClick={() => setEditing(true)}
          className="text-faint opacity-0 transition-opacity group-hover:opacity-100 hover:text-primary"
        >
          <Pencil className="size-4" />
        </button>
      </span>
    );
  }
  return (
    <form action={formAction} className="flex w-full max-w-xl items-center gap-2">
      <input type="hidden" name="id" value={ticketId} />
      <input name="title" defaultValue={title} required autoFocus className={inputClass} />
      <SubmitButton className="h-9 px-3">
        <Check />
      </SubmitButton>
      <button
        type="button"
        aria-label="Cancel"
        onClick={() => setEditing(false)}
        className={cx(buttonSecondaryClass, "h-9 w-9 p-0")}
      >
        <X />
      </button>
      {state && !state.ok ? <FormAlert state={state} /> : null}
    </form>
  );
}

export function ReopenControl({ ticketId }: { ticketId: number }) {
  const [open, setOpen] = useState(false);
  const [state, formAction] = useForm(reopenTicket);
  return (
    <div>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={buttonSecondaryClass}>
          <RotateCcw /> Reopen
        </button>
      ) : null}
      {/* form stays in the DOM (hidden) so no-JS posts and tests can reach it */}
      <form
        action={formAction}
        className={cx("flex flex-wrap items-center gap-2", !open && "hidden")}
      >
        <input type="hidden" name="id" value={ticketId} />
        <input
          name="reason"
          required={open}
          placeholder="Reason for reopening…"
          className={cx(inputClass, "w-64")}
        />
        <SubmitButton>Reopen</SubmitButton>
        <button type="button" onClick={() => setOpen(false)} className={buttonSecondaryClass}>
          Cancel
        </button>
        <FormAlert state={state} className="w-full" />
      </form>
    </div>
  );
}

export function DeleteTicketControl({ ticketId }: { ticketId: number }) {
  const [state, formAction] = useForm(deleteTicket);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("Permanently delete this ticket and all its data?")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={ticketId} />
      <button type="submit" className={buttonDangerClass}>
        <Trash2 /> Delete
      </button>
      {state && !state.ok ? <FormAlert state={state} className="mt-2" /> : null}
    </form>
  );
}

/* --------------------------------------------------------------- composer */

export function Composer({ ticketId }: { ticketId: number }) {
  const [state, formAction] = useForm(logMessage);
  const [kind, setKind] = useState("outbound");
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form
      action={formAction}
      className="space-y-3 rounded-lg border border-dashed border-edge-strong p-4"
    >
      <input type="hidden" name="id" value={ticketId} />
      <FormAlert state={state} />
      <div className="flex flex-wrap gap-2 text-sm">
        {[
          ["outbound", "Message to client"],
          ["inbound", "Message received"],
          ["note", "Internal note"],
          ["call", "Call"],
          ["confirmation_request", "Request confirmation"],
        ].map(([v, label]) => (
          <label
            key={v}
            className={cx(
              "cursor-pointer rounded-md border px-2.5 py-1 transition-colors",
              kind === v
                ? "border-primary/40 bg-primary-soft text-primary"
                : "border-edge text-muted hover:bg-subtle",
            )}
          >
            <input
              type="radio"
              name="kind"
              value={v}
              checked={kind === v}
              onChange={() => setKind(v)}
              className="sr-only"
            />
            {label}
          </label>
        ))}
        {kind !== "note" && kind !== "call" ? (
          <select name="channel" defaultValue="manual" aria-label="Channel" className={cx(inputClass, "h-8 w-auto text-xs")}>
            {CHANNELS.filter((c) => c !== "internal").map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      <textarea
        name="body"
        rows={3}
        required
        placeholder={
          kind === "note" ? "Internal note (never visible to the client)…" : "What was said…"
        }
        aria-invalid={errors.body ? true : undefined}
        className={inputClass}
      />
      <FieldError errors={errors.body} />
      <SubmitButton>{kind === "note" ? "Add note" : "Log interaction"}</SubmitButton>
    </form>
  );
}

export function NoteActions({
  messageId,
  ticketId,
  body,
  canEdit,
  canDelete,
}: {
  messageId: number;
  ticketId: number;
  body: string;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editState, editAction] = useForm(editOwnNote);
  const [deleteState, deleteAction] = useForm(deleteMessage);
  return (
    <div>
      <span className="flex items-center gap-1">
        {canEdit ? (
          <button
            type="button"
            aria-label="Edit note"
            onClick={() => setEditing((v) => !v)}
            className="flex size-6 items-center justify-center rounded text-faint hover:bg-primary-soft hover:text-primary"
          >
            <Pencil className="size-3" />
          </button>
        ) : null}
        {canDelete ? (
          <form action={deleteAction}>
            <input type="hidden" name="messageId" value={messageId} />
            <input type="hidden" name="ticketId" value={ticketId} />
            <button
              type="submit"
              aria-label="Delete message"
              className="flex size-6 items-center justify-center rounded text-faint hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 className="size-3" />
            </button>
          </form>
        ) : null}
      </span>
      {editing ? (
        <form action={editAction} className="mt-2 space-y-2">
          <input type="hidden" name="messageId" value={messageId} />
          <input type="hidden" name="ticketId" value={ticketId} />
          <FormAlert state={editState} />
          <textarea name="body" rows={2} defaultValue={body} required className={inputClass} />
          <div className="flex gap-2">
            <SubmitButton className="h-8 px-3 text-xs">Save</SubmitButton>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className={cx(buttonSecondaryClass, "h-8 px-3 text-xs")}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
      {deleteState && !deleteState.ok ? <FormAlert state={deleteState} className="mt-1" /> : null}
    </div>
  );
}

/* ------------------------------------------------------ resolve & close */

export function ResolveForm({
  ticketId,
  category,
  subcategory,
  hasTime,
  billingPending,
}: {
  ticketId: number;
  category: string | null;
  subcategory: string | null;
  hasTime: boolean;
  billingPending: boolean;
}) {
  const [state, formAction] = useForm(resolveTicket);
  const [next, setNext] = useState("pending_confirmation");
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={ticketId} />
      <FormAlert state={state} />
      <div>
        <label className={labelClass}>Resolution</label>
        <textarea
          name="resolution"
          rows={4}
          required
          placeholder="What was done to solve it…"
          aria-invalid={errors.resolution ? true : undefined}
          className={inputClass}
        />
        <FieldError errors={errors.resolution} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Category</label>
          <input name="category" required defaultValue={category ?? ""} className={inputClass} />
          <FieldError errors={errors.category} />
        </div>
        <div>
          <label className={labelClass}>Subcategory (optional)</label>
          <input name="subcategory" defaultValue={subcategory ?? ""} className={inputClass} />
        </div>
      </div>
      <div>
        <label className={labelClass}>After resolving</label>
        <select
          name="nextStatus"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          className={inputClass}
        >
          <option value="pending_confirmation">Pending confirmation (follow up with the client)</option>
          <option value="closed">Close now (confirmation already done)</option>
        </select>
      </div>
      {next === "closed" ? (
        <CloseFields hasTime={hasTime} billingPending={billingPending} errors={errors} />
      ) : null}
      <SubmitButton>{next === "closed" ? "Resolve & close" : "Resolve"}</SubmitButton>
    </form>
  );
}

function CloseFields({
  hasTime,
  billingPending,
  errors,
}: {
  hasTime: boolean;
  billingPending: boolean;
  errors: Record<string, string[]>;
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Confirmation type</label>
          <select name="confirmationType" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              How was it confirmed…
            </option>
            {CONFIRMATION_TYPES.map((t) => (
              <option key={t} value={t}>
                {confirmationTypeMeta[t]?.label ?? t}
              </option>
            ))}
          </select>
          <FieldError errors={errors.confirmationType} />
        </div>
        <div>
          <label className={labelClass}>Confirmation notes (optional)</label>
          <input name="confirmationNotes" className={inputClass} />
        </div>
      </div>
      {!hasTime ? (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
          <label className={labelClass}>
            No time is logged — closing requires an audited exception reason
          </label>
          <input
            name="timeExceptionReason"
            placeholder="Why is it OK to close without time…"
            className={inputClass}
          />
        </div>
      ) : null}
      {billingPending ? (
        <div>
          <label className={labelClass}>Billing decision (still pending review)</label>
          <select name="billingStatus" defaultValue="" className={inputClass}>
            <option value="">Keep pending review</option>
            {TICKET_BILLING_STATUSES.filter((s) => s !== "pending_review").map((s) => (
              <option key={s} value={s}>
                {ticketBillingMeta[s]?.label ?? s}
              </option>
            ))}
          </select>
        </div>
      ) : null}
    </>
  );
}

export function CloseForm({
  ticketId,
  hasTime,
  billingPending,
}: {
  ticketId: number;
  hasTime: boolean;
  billingPending: boolean;
}) {
  const [state, formAction] = useForm(closeTicket);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={ticketId} />
      <FormAlert state={state} />
      <CloseFields hasTime={hasTime} billingPending={billingPending} errors={errors} />
      <div>
        <label className={labelClass}>Confirmation channel (optional)</label>
        <input name="confirmationChannel" placeholder="e.g. WhatsApp +52…" className={inputClass} />
      </div>
      <SubmitButton>Close ticket</SubmitButton>
    </form>
  );
}

/* -------------------------------------------------------------- billing */

export function BillingForm({
  ticketId,
  defaults,
  billableMinutes,
}: {
  ticketId: number;
  defaults: {
    billingStatus: string;
    billingModality: string;
    hourlyRate: string | null;
    fixedAmount: string | null;
    billingPeriod: string | null;
    externalReference: string | null;
    billingNotes: string | null;
  };
  billableMinutes: number;
}) {
  const [state, formAction] = useForm(setTicketBilling);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={ticketId} />
      <FormAlert state={state} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Billing status</label>
          <select name="billingStatus" defaultValue={defaults.billingStatus} className={inputClass}>
            {TICKET_BILLING_STATUSES.map((s) => (
              <option key={s} value={s}>
                {ticketBillingMeta[s]?.label ?? s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Modality</label>
          <select name="billingModality" defaultValue={defaults.billingModality} className={inputClass}>
            {TICKET_BILLING_MODALITIES.map((m) => (
              <option key={m} value={m}>
                {m.replace("_", " ")}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Hourly rate</label>
          <input
            name="hourlyRate"
            type="number"
            step="0.01"
            min="0"
            defaultValue={defaults.hourlyRate ?? ""}
            className={inputClass}
          />
          <FieldError errors={errors.hourlyRate} />
        </div>
        <div>
          <label className={labelClass}>Fixed amount</label>
          <input
            name="fixedAmount"
            type="number"
            step="0.01"
            min="0"
            defaultValue={defaults.fixedAmount ?? ""}
            className={inputClass}
          />
          <FieldError errors={errors.fixedAmount} />
        </div>
      </div>
      <p className="text-xs text-muted">
        Billable time: <span className="font-medium tabular-nums">{billableMinutes} min</span>{" "}
        (non-voided entries marked billable). Amount = minutes/60 × rate, or the fixed amount.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Billing period (optional)</label>
          <input
            name="billingPeriod"
            placeholder="e.g. 2026-07"
            defaultValue={defaults.billingPeriod ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>External reference (optional)</label>
          <input
            name="externalReference"
            defaultValue={defaults.externalReference ?? ""}
            className={inputClass}
          />
        </div>
      </div>
      <div>
        <label className={labelClass}>Billing notes (optional)</label>
        <input name="billingNotes" defaultValue={defaults.billingNotes ?? ""} className={inputClass} />
      </div>
      <SubmitButton>Save billing</SubmitButton>
    </form>
  );
}

/* ------------------------------------------------------------ side panel */

export function SidePanelForm({
  ticketId,
  defaults,
  clients,
  users,
}: {
  ticketId: number;
  defaults: {
    title: string;
    description: string | null;
    clientId: number | null;
    assigneeId: number | null;
    priority: string;
    category: string | null;
    subcategory: string | null;
    channel: string | null;
    modality: string | null;
    contact: string | null;
  };
  clients: Option[];
  users: Option[];
}) {
  const [detailsState, detailsAction] = useForm(updateTicketDetails);
  const [assignState, assignAction] = useForm(assignTicket);
  const [priorityState, priorityAction] = useForm(setTicketPriority);

  return (
    <div className="space-y-4">
      <form action={assignAction} className="space-y-2">
        <input type="hidden" name="id" value={ticketId} />
        <FormAlert state={assignState} />
        <label className={labelClass}>Assignee</label>
        <div className="flex gap-2">
          <select name="assigneeId" key={defaults.assigneeId ?? "none"} defaultValue={defaults.assigneeId ?? ""} className={inputClass}>
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <SubmitButton className="h-9 px-3 text-xs">Set</SubmitButton>
        </div>
      </form>

      <form action={priorityAction} className="space-y-2">
        <input type="hidden" name="id" value={ticketId} />
        <FormAlert state={priorityState} />
        <label className={labelClass}>Priority</label>
        <div className="flex gap-2">
          <select name="priority" key={defaults.priority} defaultValue={defaults.priority} className={inputClass}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <SubmitButton className="h-9 px-3 text-xs">Set</SubmitButton>
        </div>
      </form>

      <form action={detailsAction} className="space-y-3 border-t border-edge pt-4">
        <input type="hidden" name="id" value={ticketId} />
        <input type="hidden" name="title" value={defaults.title} />
        <input type="hidden" name="description" value={defaults.description ?? ""} />
        <FormAlert state={detailsState} />
        <div>
          <label className={labelClass}>Client</label>
          <select name="clientId" defaultValue={defaults.clientId ?? ""} className={inputClass}>
            <option value="">— None —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Contact</label>
          <input name="contact" defaultValue={defaults.contact ?? ""} className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Category</label>
            <input name="category" defaultValue={defaults.category ?? ""} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Subcategory</label>
            <input name="subcategory" defaultValue={defaults.subcategory ?? ""} className={inputClass} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Channel</label>
            <select name="channel" defaultValue={defaults.channel ?? ""} className={inputClass}>
              <option value="">—</option>
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Modality</label>
            <select name="modality" defaultValue={defaults.modality ?? ""} className={inputClass}>
              <option value="">—</option>
              <option value="remote">remote</option>
              <option value="onsite">onsite</option>
            </select>
          </div>
        </div>
        <SubmitButton className="h-9 px-3 text-xs">Save details</SubmitButton>
      </form>
    </div>
  );
}

/* ------------------------------------------------------ related activities */

export function RelatedActivityForms({
  ticketId,
  users,
  linkable,
}: {
  ticketId: number;
  users: Option[];
  linkable: Option[];
}) {
  const [createState, createAction] = useForm(createRelatedActivity);
  const [linkState, linkAction] = useForm(linkActivity);
  const createErrors = createState && !createState.ok ? (createState.fieldErrors ?? {}) : {};
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <form
        action={createAction}
        className="space-y-3 rounded-lg border border-dashed border-edge-strong p-4"
      >
        <input type="hidden" name="id" value={ticketId} />
        <FormAlert state={createState} />
        <div className="text-sm font-semibold text-fg">New related activity</div>
        <input
          name="title"
          required
          placeholder="Title…"
          aria-invalid={createErrors.title ? true : undefined}
          className={inputClass}
        />
        <FieldError errors={createErrors.title} />
        <div className="grid grid-cols-2 gap-3">
          <select name="activityType" defaultValue="general" aria-label="Type" className={inputClass}>
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {activityTypeMeta[t]?.label ?? t}
              </option>
            ))}
          </select>
          <select name="priority" defaultValue="medium" aria-label="Priority" className={inputClass}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <select name="assigneeId" defaultValue="" aria-label="Assignee" className={inputClass}>
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
          <input name="dueDate" type="date" aria-label="Due date" className={inputClass} />
        </div>
        <SubmitButton>Create</SubmitButton>
      </form>

      <form
        action={linkAction}
        className="h-fit space-y-3 rounded-lg border border-dashed border-edge-strong p-4"
      >
        <input type="hidden" name="id" value={ticketId} />
        <FormAlert state={linkState} />
        <div className="text-sm font-semibold text-fg">Link existing activity</div>
        <select name="activityId" required defaultValue="" className={inputClass}>
          <option value="" disabled>
            {linkable.length === 0 ? "No eligible activities" : "Pick an activity…"}
          </option>
          {linkable.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted">
          Archived, converted, already-linked and project activities are not eligible.
        </p>
        <SubmitButton>Link</SubmitButton>
      </form>
    </div>
  );
}

export function UnlinkButton({ ticketId, activityId }: { ticketId: number; activityId: number }) {
  const [state, formAction] = useForm(unlinkActivity);
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={ticketId} />
      <input type="hidden" name="activityId" value={activityId} />
      <button
        type="submit"
        aria-label="Unlink activity"
        title="Unlink from this ticket"
        className="flex size-7 items-center justify-center rounded-md text-faint hover:bg-danger/10 hover:text-danger"
      >
        <X className="size-3.5" />
      </button>
      {state && !state.ok ? <FormAlert state={state} /> : null}
    </form>
  );
}

/* -------------------------------------------------------------- files */

export function UploadForm({ ticketId }: { ticketId: number }) {
  const [state, formAction] = useForm(uploadAttachment);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={ticketId} />
      <input type="file" name="file" required className="text-sm text-muted" />
      <SubmitButton>
        <Paperclip /> Attach
      </SubmitButton>
      <FormAlert state={state} className="w-full" />
      <FieldError errors={errors.file} />
    </form>
  );
}

export function DeleteAttachmentButton({
  attachmentId,
  ticketId,
}: {
  attachmentId: number;
  ticketId: number;
}) {
  const [state, formAction] = useForm(deleteAttachment);
  return (
    <form action={formAction}>
      <input type="hidden" name="attachmentId" value={attachmentId} />
      <input type="hidden" name="ticketId" value={ticketId} />
      <button
        type="submit"
        aria-label="Delete attachment"
        className="flex size-7 items-center justify-center rounded-md text-faint hover:bg-danger/10 hover:text-danger"
      >
        <Trash2 className="size-3.5" />
      </button>
      {state && !state.ok ? <FormAlert state={state} /> : null}
    </form>
  );
}

export function TabLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
        active ? "bg-primary-soft text-primary" : "text-muted hover:bg-subtle hover:text-fg",
      )}
    >
      {children}
    </Link>
  );
}

export function PrimaryActions({ ticketId, isClosed }: { ticketId: number; isClosed: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`/helpdesk/${ticketId}?tab=conversation#composer`} className={buttonClass}>
        Respond
      </Link>
      <Link href={`/helpdesk/${ticketId}?tab=time`} className={buttonSecondaryClass}>
        Log time
      </Link>
      {!isClosed ? (
        <Link href={`/helpdesk/${ticketId}?tab=resolution`} className={buttonSecondaryClass}>
          Resolve / Close
        </Link>
      ) : null}
    </div>
  );
}

export function StatusBadgeSmall({ status }: { status: string }) {
  const meta = ticketStatusMeta[status];
  return <Badge tone={meta?.tone ?? "slate"}>{meta?.label ?? status}</Badge>;
}
