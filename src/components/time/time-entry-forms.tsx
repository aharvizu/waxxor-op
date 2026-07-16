"use client";

import { useState, useActionState } from "react";
import { Ban, Pencil, Trash2 } from "lucide-react";
import {
  Badge,
  buttonSecondaryClass,
  cx,
  inputClass,
  labelClass,
} from "@/components/ui";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-result";
import { fmtDate, fmtMoney } from "@/lib/format";
import {
  BILLING_STATUSES,
  TIME_MODALITIES,
  TIME_TYPES,
  formatMinutes,
} from "@/lib/time-entries";
import {
  createTimeEntry,
  deleteTimeEntry,
  updateTimeEntry,
  voidTimeEntry,
} from "@/app/(app)/time-entries/actions";

type Option = { id: number; name: string };

const typeLabels: Record<string, string> = {
  technical_work: "Technical work",
  remote_support: "Remote support",
  onsite_support: "On-site support",
  travel: "Travel",
  waiting_customer: "Waiting on customer",
  waiting_provider: "Waiting on provider",
  research: "Research",
  documentation: "Documentation",
  meeting: "Meeting",
  training: "Training",
  administration: "Administration",
  commercial: "Commercial",
};

const billingLabels: Record<string, { label: string; tone: "green" | "slate" | "blue" | "amber" }> = {
  billable: { label: "Billable", tone: "green" },
  non_billable: { label: "Non-billable", tone: "slate" },
  included_in_contract: { label: "In contract", tone: "blue" },
  pending_review: { label: "Pending review", tone: "amber" },
};

const modalityLabels: Record<string, string> = {
  remote: "Remote",
  onsite: "On-site",
  not_applicable: "N/A",
};

function SessionFields({
  errors,
  defaults,
}: {
  errors: Record<string, string[]>;
  defaults?: {
    date: string;
    durationMinutes: number;
    timeType: string;
    billingStatus: string;
    modality: string;
    description: string;
    result: string | null;
    hourlyRate: string | null;
    internalHourlyCost: string | null;
  };
}) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className={labelClass}>Date</label>
          <input
            name="date"
            type="date"
            required
            defaultValue={defaults?.date ?? today}
            className={inputClass}
          />
        </div>
        <div>
          <label className={labelClass}>Minutes</label>
          <input
            name="durationMinutes"
            type="number"
            min="1"
            required
            defaultValue={defaults?.durationMinutes ?? ""}
            aria-invalid={errors.durationMinutes ? true : undefined}
            className={inputClass}
          />
          <FieldError errors={errors.durationMinutes} />
        </div>
        <div>
          <label className={labelClass}>Type</label>
          <select
            name="timeType"
            defaultValue={defaults?.timeType ?? "technical_work"}
            className={inputClass}
          >
            {TIME_TYPES.map((t) => (
              <option key={t} value={t}>
                {typeLabels[t] ?? t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Billing</label>
          <select
            name="billingStatus"
            defaultValue={defaults?.billingStatus ?? "pending_review"}
            className={inputClass}
          >
            {BILLING_STATUSES.map((b) => (
              <option key={b} value={b}>
                {billingLabels[b]?.label ?? b}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className={labelClass}>Modality</label>
          <select
            name="modality"
            defaultValue={defaults?.modality ?? "not_applicable"}
            className={inputClass}
          >
            {TIME_MODALITIES.map((m) => (
              <option key={m} value={m}>
                {modalityLabels[m] ?? m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Hourly rate (optional)</label>
          <input
            name="hourlyRate"
            type="number"
            step="0.01"
            min="0"
            defaultValue={defaults?.hourlyRate ?? ""}
            aria-invalid={errors.hourlyRate ? true : undefined}
            className={inputClass}
          />
          <FieldError errors={errors.hourlyRate} />
        </div>
        <div>
          <label className={labelClass}>Internal cost/h (optional)</label>
          <input
            name="internalHourlyCost"
            type="number"
            step="0.01"
            min="0"
            defaultValue={defaults?.internalHourlyCost ?? ""}
            aria-invalid={errors.internalHourlyCost ? true : undefined}
            className={inputClass}
          />
          <FieldError errors={errors.internalHourlyCost} />
        </div>
        <div>
          <label className={labelClass}>Result (optional)</label>
          <input name="result" defaultValue={defaults?.result ?? ""} className={inputClass} />
        </div>
      </div>
      <div>
        <label className={labelClass}>Description</label>
        <textarea
          name="description"
          rows={2}
          required
          defaultValue={defaults?.description ?? ""}
          aria-invalid={errors.description ? true : undefined}
          className={inputClass}
        />
        <FieldError errors={errors.description} />
      </div>
    </>
  );
}

export function AddTimeEntryForm({
  workItemId,
  technicians,
  currentUserId,
}: {
  workItemId: number;
  technicians: Option[];
  currentUserId: number;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    createTimeEntry,
    null,
  );
  const failed = state && !state.ok ? state : null;
  const errors = failed?.fieldErrors ?? {};

  return (
    <form
      action={formAction}
      className="space-y-3 rounded-lg border border-dashed border-edge-strong p-4"
    >
      <input type="hidden" name="workItemId" value={workItemId} />
      <FormAlert state={state} />
      <div>
        <label htmlFor="userIds" className={labelClass}>
          Technician(s) — hold Ctrl/Cmd to select several
        </label>
        <select
          id="userIds"
          name="userIds"
          multiple
          size={Math.min(4, technicians.length)}
          defaultValue={[String(currentUserId)]}
          aria-invalid={errors.userIds ? true : undefined}
          className={cx(inputClass, "h-auto py-1")}
        >
          {technicians.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <FieldError errors={errors.userIds} />
      </div>
      <SessionFields errors={errors} />
      <SubmitButton>Log time</SubmitButton>
    </form>
  );
}

export function TimeEntryRow({
  entry,
  technicians,
  canDelete,
  readOnly,
}: {
  entry: {
    id: number;
    userId: number;
    userName: string;
    date: string;
    durationMinutes: number;
    timeType: string;
    billingStatus: string;
    modality: string;
    description: string;
    result: string | null;
    hourlyRate: string | null;
    internalHourlyCost: string | null;
    calculatedAmount: string | null;
    voided: boolean;
  };
  technicians: Option[];
  canDelete: boolean;
  readOnly: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [editState, editAction] = useActionState<ActionState, FormData>(
    updateTimeEntry,
    null,
  );
  const [voidState, voidAction] = useActionState<ActionState, FormData>(
    voidTimeEntry,
    null,
  );
  const [deleteState, deleteAction] = useActionState<ActionState, FormData>(
    deleteTimeEntry,
    null,
  );
  const billing = billingLabels[entry.billingStatus] ?? {
    label: entry.billingStatus,
    tone: "slate" as const,
  };
  const errors = editState && !editState.ok ? (editState.fieldErrors ?? {}) : {};

  return (
    <li
      className={cx(
        "rounded-lg border border-edge bg-subtle px-4 py-3",
        entry.voided && "opacity-55",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <span className="tabular-nums text-muted">{fmtDate(entry.date)}</span>
          <span className="font-medium text-fg">{entry.userName}</span>
          <span className="text-muted">{typeLabels[entry.timeType] ?? entry.timeType}</span>
          <span className="font-semibold tabular-nums">
            {formatMinutes(entry.durationMinutes)}
          </span>
          <Badge tone={billing.tone}>{billing.label}</Badge>
          {entry.calculatedAmount ? (
            <span className="tabular-nums text-muted">
              {fmtMoney(entry.calculatedAmount)}
            </span>
          ) : null}
          {entry.voided ? <Badge tone="red">Voided</Badge> : null}
        </div>
        {!readOnly && !entry.voided ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label="Edit entry"
              onClick={() => setEditing((v) => !v)}
              className="flex size-7 items-center justify-center rounded-md text-faint transition-colors hover:bg-primary-soft hover:text-primary"
            >
              <Pencil className="size-3.5" />
            </button>
            <form action={voidAction}>
              <input type="hidden" name="id" value={entry.id} />
              <button
                type="submit"
                aria-label="Void entry"
                title="Void (keeps the record, excluded from totals)"
                className="flex size-7 items-center justify-center rounded-md text-faint transition-colors hover:bg-danger/10 hover:text-danger"
              >
                <Ban className="size-3.5" />
              </button>
            </form>
          </div>
        ) : null}
        {canDelete && entry.voided ? (
          <form action={deleteAction}>
            <input type="hidden" name="id" value={entry.id} />
            <button
              type="submit"
              aria-label="Delete permanently"
              title="Delete permanently (SuperAdmin only)"
              className="flex size-7 items-center justify-center rounded-md text-faint transition-colors hover:bg-danger/10 hover:text-danger"
            >
              <Trash2 className="size-3.5" />
            </button>
          </form>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted">{entry.description}</p>
      {entry.result ? (
        <p className="mt-0.5 text-xs text-faint">Result: {entry.result}</p>
      ) : null}
      {voidState && !voidState.ok ? <FormAlert state={voidState} className="mt-2" /> : null}
      {deleteState && !deleteState.ok ? (
        <FormAlert state={deleteState} className="mt-2" />
      ) : null}

      {editing && !entry.voided ? (
        <form action={editAction} className="mt-3 space-y-3 border-t border-edge pt-3">
          <input type="hidden" name="id" value={entry.id} />
          <FormAlert state={editState} />
          <div>
            <label className={labelClass}>Technician</label>
            <select name="userId" defaultValue={entry.userId} className={inputClass}>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <SessionFields
            errors={errors}
            defaults={{
              date: entry.date,
              durationMinutes: entry.durationMinutes,
              timeType: entry.timeType,
              billingStatus: entry.billingStatus,
              modality: entry.modality,
              description: entry.description,
              result: entry.result,
              hourlyRate: entry.hourlyRate,
              internalHourlyCost: entry.internalHourlyCost,
            }}
          />
          <div className="flex items-center gap-2">
            <SubmitButton>Save entry</SubmitButton>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className={buttonSecondaryClass}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </li>
  );
}
