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
import { SearchableSelect } from "@/components/searchable-select";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-result";
import { CONFIRMATION_TYPES, TICKET_BILLING_MODALITIES } from "@/lib/tickets";
import { getLabels } from "@/lib/labels";
import { useLocale } from "@/components/locale-provider";
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
/** A catalog row's minimal display shape — id/name always; color when the caller renders a chip. */
export type CatalogOption = { id: number; name: string; color?: string | null };
const CHANNELS = ["manual", "whatsapp", "email", "phone", "portal", "internal"] as const;
/** Activities' priority is still the plain legacy enum — out of scope for the Ticket Priority catalog. */
const PRIORITIES = ["low", "medium", "high", "critical"] as const;

/** Small colored chip for a catalog row — Badge only supports 7 fixed tones, not arbitrary hex. */
export function CatalogChip({ option }: { option: CatalogOption | undefined }) {
  if (!option) return <Badge tone="slate">—</Badge>;
  if (!option.color) return <Badge tone="slate">{option.name}</Badge>;
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
      style={{ backgroundColor: `${option.color}22`, color: option.color }}
    >
      {option.name}
    </span>
  );
}

function useForm(action: (p: ActionState, f: FormData) => Promise<ActionState>) {
  return useActionState<ActionState, FormData>(action, null);
}

/* ------------------------------------------------------- header controls */

export function StatusSelect({
  ticketId,
  statusId,
  statuses,
  currentStatusName,
  disabled,
}: {
  ticketId: number;
  statusId: number;
  /** The org's active, dropdown-eligible statuses (category open/in_progress/waiting/cancelled — see isWorkflowDropdownCategory). */
  statuses: Option[];
  /** The current status, shown as a disabled placeholder when it's not in `statuses` (e.g. Resolved/Closed — those go through dedicated actions). */
  currentStatusName: string;
  disabled: boolean;
}) {
  const [state, formAction] = useForm(changeTicketStatus);
  const inDropdown = statuses.some((s) => s.id === statusId);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="id" value={ticketId} />
      <SearchableSelect
        name="statusId"
        key={statusId}
        defaultValue={inDropdown ? String(statusId) : ""}
        disabled={disabled}
        aria-label="Change status"
        className="h-8 w-auto text-xs"
        options={[
          ...(!inDropdown ? [{ value: "", label: currentStatusName, disabled: true }] : []),
          ...statuses.map((s) => ({ value: String(s.id), label: s.name })),
        ]}
      />
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
          <SearchableSelect
            name="channel"
            defaultValue="manual"
            aria-label="Channel"
            className="h-8 w-auto text-xs"
            options={CHANNELS.filter((c) => c !== "internal").map((c) => ({ value: c, label: c }))}
          />
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
  billingStatuses,
  categoryOptions,
  suggestedResolution,
}: {
  ticketId: number;
  category: string | null;
  subcategory: string | null;
  hasTime: boolean;
  billingPending: boolean;
  billingStatuses: Option[];
  /** Active names from the org's ticket-category catalog — the only selectable values (Settings → Tickets). */
  categoryOptions: string[];
  /** Result/description of the most recent time entry — prefilled as an editable
   * suggestion so a tech isn't forced to retype the same text twice, per the
   * user's request. Not a live link: once loaded, the field is independent. */
  suggestedResolution: string | null;
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
          defaultValue={suggestedResolution ?? ""}
          placeholder="What was done to solve it…"
          aria-invalid={errors.resolution ? true : undefined}
          className={inputClass}
        />
        <FieldError errors={errors.resolution} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Category</label>
          <SearchableSelect
            name="category"
            required
            defaultValue={category ?? ""}
            options={[
              { value: "", label: "— Select —", disabled: true },
              ...(category && !categoryOptions.includes(category) ? [{ value: category, label: category }] : []),
              ...categoryOptions.map((c) => ({ value: c, label: c })),
            ]}
          />
          <FieldError errors={errors.category} />
        </div>
        <div>
          <label className={labelClass}>Subcategory (optional)</label>
          <input name="subcategory" defaultValue={subcategory ?? ""} list="ticket-subcategory-options" className={inputClass} />
        </div>
      </div>
      <div>
        <label className={labelClass}>After resolving</label>
        <SearchableSelect
          name="nextStatus"
          value={next}
          onValueChange={setNext}
          options={[
            { value: "pending_confirmation", label: "Pending confirmation (follow up with the client)" },
            { value: "closed", label: "Close now (confirmation already done)" },
          ]}
        />
      </div>
      {next === "closed" ? (
        <CloseFields hasTime={hasTime} billingPending={billingPending} billingStatuses={billingStatuses} errors={errors} />
      ) : null}
      <SubmitButton>{next === "closed" ? "Resolve & close" : "Resolve"}</SubmitButton>
    </form>
  );
}

function CloseFields({
  hasTime,
  billingPending,
  billingStatuses,
  errors,
}: {
  hasTime: boolean;
  billingPending: boolean;
  billingStatuses: Option[];
  errors: Record<string, string[]>;
}) {
  const { confirmationTypeMeta } = getLabels(useLocale());
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Confirmation type</label>
          <SearchableSelect
            name="confirmationType"
            required
            defaultValue=""
            options={[
              { value: "", label: "How was it confirmed…", disabled: true },
              ...CONFIRMATION_TYPES.map((t) => ({ value: t, label: confirmationTypeMeta[t]?.label ?? t })),
            ]}
          />
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
          <label className={labelClass}>Billing decision (required to close)</label>
          <SearchableSelect
            name="billingStatusId"
            required
            defaultValue=""
            options={[
              { value: "", label: "— Select —", disabled: true },
              ...billingStatuses.map((s) => ({ value: String(s.id), label: s.name })),
            ]}
          />
        </div>
      ) : null}
    </>
  );
}

export function CloseForm({
  ticketId,
  hasTime,
  billingPending,
  billingStatuses,
}: {
  ticketId: number;
  hasTime: boolean;
  billingPending: boolean;
  billingStatuses: Option[];
}) {
  const [state, formAction] = useForm(closeTicket);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={ticketId} />
      <FormAlert state={state} />
      <CloseFields hasTime={hasTime} billingPending={billingPending} billingStatuses={billingStatuses} errors={errors} />
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
  billingStatuses,
}: {
  ticketId: number;
  defaults: {
    billingStatusId: number;
    billingModality: string;
    hourlyRate: string | null;
    fixedAmount: string | null;
  };
  billableMinutes: number;
  billingStatuses: Option[];
}) {
  const [state, formAction] = useForm(setTicketBilling);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  // A Fixed amount only ever counts if Modality is "fixed_price" (see #230 —
  // typing an amount with Modality left elsewhere silently computes $0).
  // Auto-switching here removes the most common way to hit that trap; the
  // server still rejects the combination outright if it happens anyway.
  const [modality, setModality] = useState(defaults.billingModality);
  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={ticketId} />
      <FormAlert state={state} />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Billing status</label>
          <SearchableSelect
            name="billingStatusId"
            defaultValue={String(defaults.billingStatusId)}
            options={billingStatuses.map((s) => ({ value: String(s.id), label: s.name }))}
          />
        </div>
        <div>
          <label className={labelClass}>Modality</label>
          <SearchableSelect
            name="billingModality"
            value={modality}
            onValueChange={setModality}
            options={TICKET_BILLING_MODALITIES.map((m) => ({ value: m, label: m.replace("_", " ") }))}
          />
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
            onChange={(e) => {
              if (Number(e.currentTarget.value) > 0) setModality("fixed_price");
            }}
            className={inputClass}
          />
          <FieldError errors={errors.fixedAmount} />
        </div>
      </div>
      <p className="text-xs text-muted">
        Billable time: <span className="font-medium tabular-nums">{billableMinutes} min</span>{" "}
        (non-voided entries marked billable). Amount = minutes/60 × rate, or the fixed amount.
      </p>
      <SubmitButton>Save billing</SubmitButton>
    </form>
  );
}

/* ------------------------------------------------------------ side panel */

export function SidePanelForm({
  ticketId,
  defaults,
  companies,
  contacts,
  users,
  priorities,
  categoryOptions,
}: {
  ticketId: number;
  defaults: {
    title: string;
    description: string | null;
    companyId: number | null;
    contactId: number | null;
    assigneeId: number | null;
    priorityId: number;
    category: string | null;
    subcategory: string | null;
    channel: string | null;
    modality: string | null;
    contact: string | null;
    /** "Fecha agendada" — independent of the SLA target, never affects it. */
    dueDate: string | null;
  };
  companies: Option[];
  contacts: { id: number; name: string; companyId: number }[];
  users: Option[];
  priorities: Option[];
  /** Active names from the org's ticket-category catalog — the only selectable values (Settings → Tickets). */
  categoryOptions: string[];
}) {
  const [detailsState, detailsAction] = useForm(updateTicketDetails);
  const [assignState, assignAction] = useForm(assignTicket);
  const [priorityState, priorityAction] = useForm(setTicketPriority);
  const [companyId, setCompanyId] = useState(defaults.companyId ? String(defaults.companyId) : "");
  const suggestedContacts = companyId
    ? contacts.filter((c) => c.companyId === Number(companyId))
    : contacts;

  return (
    <div className="space-y-4">
      <form action={assignAction} className="space-y-2">
        <input type="hidden" name="id" value={ticketId} />
        <FormAlert state={assignState} />
        <label className={labelClass}>Assignee</label>
        <div className="flex gap-2">
          <SearchableSelect
            name="assigneeId"
            key={defaults.assigneeId ?? "none"}
            defaultValue={defaults.assigneeId ? String(defaults.assigneeId) : ""}
            options={[{ value: "", label: "Unassigned" }, ...users.map((u) => ({ value: String(u.id), label: u.name }))]}
          />
          <SubmitButton className="h-9 px-3 text-xs">Set</SubmitButton>
        </div>
      </form>

      <form action={priorityAction} className="space-y-2">
        <input type="hidden" name="id" value={ticketId} />
        <FormAlert state={priorityState} />
        <label className={labelClass}>Priority</label>
        <div className="flex gap-2">
          <SearchableSelect
            name="priorityId"
            key={defaults.priorityId}
            defaultValue={String(defaults.priorityId)}
            options={priorities.map((p) => ({ value: String(p.id), label: p.name }))}
          />
          <SubmitButton className="h-9 px-3 text-xs">Set</SubmitButton>
        </div>
      </form>

      <form action={detailsAction} className="space-y-3 border-t border-edge pt-4">
        <input type="hidden" name="id" value={ticketId} />
        <input type="hidden" name="title" value={defaults.title} />
        <FormAlert state={detailsState} />
        <div>
          <label className={labelClass}>Description</label>
          <textarea
            name="description"
            rows={4}
            defaultValue={defaults.description ?? ""}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Client</label>
          <SearchableSelect
            name="companyId"
            value={companyId}
            onValueChange={setCompanyId}
            options={[{ value: "", label: "— None —" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]}
          />
        </div>
        <div>
          <label className={labelClass}>Contact</label>
          <SearchableSelect
            key={companyId}
            name="contactId"
            defaultValue={defaults.contactId ? String(defaults.contactId) : ""}
            options={[{ value: "", label: "— None —" }, ...suggestedContacts.map((c) => ({ value: String(c.id), label: c.name }))]}
          />
        </div>
        <div>
          <label className={labelClass}>Contact note</label>
          <input name="contact" defaultValue={defaults.contact ?? ""} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Fecha agendada</label>
          <input name="dueDate" type="date" defaultValue={defaults.dueDate ?? ""} className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Category</label>
            <SearchableSelect
              name="category"
              defaultValue={defaults.category ?? ""}
              options={[
                { value: "", label: "— None —" },
                ...(defaults.category && !categoryOptions.includes(defaults.category)
                  ? [{ value: defaults.category, label: defaults.category }]
                  : []),
                ...categoryOptions.map((c) => ({ value: c, label: c })),
              ]}
            />
          </div>
          <div>
            <label className={labelClass}>Subcategory</label>
            <input name="subcategory" defaultValue={defaults.subcategory ?? ""} list="ticket-subcategory-options" className={inputClass} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Channel</label>
            <SearchableSelect
              name="channel"
              defaultValue={defaults.channel ?? ""}
              options={[{ value: "", label: "—" }, ...CHANNELS.map((c) => ({ value: c, label: c }))]}
            />
          </div>
          <div>
            <label className={labelClass}>Modality</label>
            <SearchableSelect
              name="modality"
              defaultValue={defaults.modality ?? ""}
              options={[
                { value: "", label: "—" },
                { value: "remote", label: "remote" },
                { value: "onsite", label: "onsite" },
              ]}
            />
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
  activityTypeOptions,
}: {
  ticketId: number;
  users: Option[];
  linkable: Option[];
  /** Active names from the org's activity-type catalog (Settings → Actividades). */
  activityTypeOptions: string[];
}) {
  const [createState, createAction] = useForm(createRelatedActivity);
  const [linkState, linkAction] = useForm(linkActivity);
  const createErrors = createState && !createState.ok ? (createState.fieldErrors ?? {}) : {};
  const { activityTypeMeta } = getLabels(useLocale());
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
          <SearchableSelect
            name="activityType"
            defaultValue="general"
            aria-label="Type"
            options={activityTypeOptions.map((t) => ({ value: t, label: activityTypeMeta[t]?.label ?? t }))}
          />
          <SearchableSelect
            name="priority"
            defaultValue="medium"
            aria-label="Priority"
            options={PRIORITIES.map((p) => ({ value: p, label: p }))}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <SearchableSelect
            name="assigneeId"
            defaultValue=""
            aria-label="Assignee"
            options={[{ value: "", label: "Unassigned" }, ...users.map((u) => ({ value: String(u.id), label: u.name }))]}
          />
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
        <SearchableSelect
          name="activityId"
          required
          defaultValue=""
          options={[
            { value: "", label: linkable.length === 0 ? "No eligible activities" : "Pick an activity…", disabled: true },
            ...linkable.map((a) => ({ value: String(a.id), label: a.name })),
          ]}
        />
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

/**
 * The bare `<input type="file">` used to render with no border/background at
 * all (just `text-sm text-muted`) — its native "Choose File" button and "No
 * file chosen" label were nearly impossible to make out (2026-07-29). Hidden
 * input + a real styled trigger label, same pattern already used for chat
 * attachments in inbox-forms.tsx, instead of relying on the OS's own file
 * input rendering.
 */
export function UploadForm({ ticketId }: { ticketId: number }) {
  const [state, formAction] = useForm(uploadAttachment);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const [fileName, setFileName] = useState<string | null>(null);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={ticketId} />
      <label className={cx(buttonSecondaryClass, "h-9 cursor-pointer")}>
        Choose file
        <input
          type="file"
          name="file"
          required
          className="hidden"
          onChange={(e) => setFileName(e.currentTarget.files?.[0]?.name ?? null)}
        />
      </label>
      <span className="text-sm text-muted">{fileName ?? "No file chosen"}</span>
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
