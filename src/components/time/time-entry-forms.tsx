"use client";

import { useState, useActionState } from "react";
import { Ban, Coins, Pencil, Trash2 } from "lucide-react";
import {
  Badge,
  buttonSecondaryClass,
  cx,
  inputClass,
  labelClass,
} from "@/components/ui";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SearchableSelect, type SelectOption } from "@/components/searchable-select";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-result";
import { fmtDate, fmtMoney } from "@/lib/format";
import {
  BILLING_STATUSES,
  TIME_MODALITIES,
  formatMinutes,
} from "@/lib/time-entries";
import {
  createTimeEntry,
  deleteTimeEntry,
  updateTimeEntry,
  updateTimeEntryBilling,
  voidTimeEntry,
} from "@/app/(app)/time-entries/actions";
import type { TimeEntryAccess } from "@/lib/time-entry-access";

type Option = { id: number; name: string };

/**
 * Presence of this prop puts SessionFields in Ticket mode (2026-09-14 Billing
 * redesign — Activities keeps the original, unrestricted fields): Modality
 * drops "N/A" (only Remote/On-Site), Billing drops "Pending review" (only
 * Billable/Non-billable/In contract), Billing defaults to "In contract" for
 * clients on a policy service, and the hourly rate auto-suggests from the
 * client's contracted rate for whichever modality gets picked.
 */
export type TicketBillingDefaults = {
  isGlobalPolicyIncluded: boolean;
  remoteRate: string | null;
  onsiteRate: string | null;
};

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
  timeTypeOptions,
  ticketBilling,
  billingOnly = false,
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
  /** Active names from the org's time-entry-type catalog (Settings → Actividades). */
  timeTypeOptions: string[];
  /** Ticket context (see TicketBillingDefaults) — omit for Activities. */
  ticketBilling?: TicketBillingDefaults;
  /** Closed-ticket mode: only the fields that decide the charge (TimeEntryAccess "billing"). */
  billingOnly?: boolean;
}) {
  const today = new Date().toISOString().slice(0, 10);

  const modalityOptions: SelectOption[] = (
    ticketBilling ? TIME_MODALITIES.filter((m) => m !== "not_applicable") : TIME_MODALITIES
  ).map((m) => ({ value: m, label: modalityLabels[m] ?? m }));
  if (defaults?.modality && !modalityOptions.some((o) => o.value === defaults.modality)) {
    modalityOptions.push({ value: defaults.modality, label: modalityLabels[defaults.modality] ?? defaults.modality });
  }
  const billingOptions: SelectOption[] = (
    ticketBilling ? BILLING_STATUSES.filter((b) => b !== "pending_review") : BILLING_STATUSES
  ).map((b) => ({ value: b, label: billingLabels[b]?.label ?? b }));
  if (defaults?.billingStatus && !billingOptions.some((o) => o.value === defaults.billingStatus)) {
    billingOptions.push({ value: defaults.billingStatus, label: billingLabels[defaults.billingStatus]?.label ?? defaults.billingStatus });
  }
  const defaultBillingStatus =
    defaults?.billingStatus ??
    (ticketBilling ? (ticketBilling.isGlobalPolicyIncluded ? "included_in_contract" : "billable") : "pending_review");

  const [modality, setModality] = useState(defaults?.modality ?? (ticketBilling ? "" : "not_applicable"));
  const [hourlyRate, setHourlyRate] = useState(defaults?.hourlyRate ?? "");
  const [rateIsAutoSuggested, setRateIsAutoSuggested] = useState(false);

  // Only auto-suggest a rate on a brand-new entry (no `defaults`) — editing
  // an existing one never silently overwrites its already-captured rate.
  function handleModalityChange(next: string) {
    setModality(next);
    if (!ticketBilling || defaults) return;
    if (hourlyRate !== "" && !rateIsAutoSuggested) return;
    const suggestion = next === "remote" ? ticketBilling.remoteRate : next === "onsite" ? ticketBilling.onsiteRate : null;
    setHourlyRate(suggestion ?? "");
    setRateIsAutoSuggested(suggestion !== null);
  }

  // Declared once, laid out twice: the full form spreads them across its two
  // grids, the closed-ticket form gathers the four billing ones into a single
  // row (see `billingOnly`).
  const billingField = (
    <div>
      <label className={labelClass}>Billing</label>
      <SearchableSelect
        name="billingStatus"
        defaultValue={defaultBillingStatus}
        options={billingOptions}
      />
    </div>
  );
  const modalityField = (
    <div>
      <label className={labelClass}>Modality</label>
      <SearchableSelect
        name="modality"
        value={modality}
        onValueChange={handleModalityChange}
        required={!!ticketBilling}
        placeholder={ticketBilling ? "Choose…" : "Seleccionar…"}
        options={modalityOptions}
      />
    </div>
  );
  const hourlyRateField = (
    <div>
      <label className={labelClass}>Hourly rate (optional)</label>
      <input
        name="hourlyRate"
        type="number"
        step="0.01"
        min="0"
        value={hourlyRate}
        onChange={(e) => {
          setHourlyRate(e.target.value);
          setRateIsAutoSuggested(false);
        }}
        aria-invalid={errors.hourlyRate ? true : undefined}
        className={inputClass}
      />
      <FieldError errors={errors.hourlyRate} />
    </div>
  );
  const internalCostField = (
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
  );

  if (billingOnly) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {billingField}
        {modalityField}
        {hourlyRateField}
        {internalCostField}
      </div>
    );
  }

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
        {ticketBilling ? (
          // Redundant with Modality below for Tickets (same Remote/On-Site
          // question, asked twice) — kept only as a hidden field, derived
          // from Modality, so the still-NOT-NULL timeType column stays
          // satisfied without showing the tech a duplicate control.
          <input type="hidden" name="timeType" value={modality === "onsite" ? "onsite_support" : "remote_support"} />
        ) : (
          <div>
            <label className={labelClass}>Type</label>
            <SearchableSelect
              name="timeType"
              required
              defaultValue={defaults?.timeType ?? "technical_work"}
              options={[
                ...(defaults?.timeType && !timeTypeOptions.includes(defaults.timeType)
                  ? [{ value: defaults.timeType, label: typeLabels[defaults.timeType] ?? defaults.timeType }]
                  : []),
                ...timeTypeOptions.map((t) => ({ value: t, label: typeLabels[t] ?? t })),
              ]}
            />
          </div>
        )}
        {billingField}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {modalityField}
        {hourlyRateField}
        {internalCostField}
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
  timeTypeOptions,
  ticketBilling,
}: {
  workItemId: number;
  technicians: Option[];
  currentUserId: number;
  /** Active names from the org's time-entry-type catalog (Settings → Actividades). */
  timeTypeOptions: string[];
  /** Ticket context (see TicketBillingDefaults) — omit for Activities. */
  ticketBilling?: TicketBillingDefaults;
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
      <SessionFields errors={errors} timeTypeOptions={timeTypeOptions} ticketBilling={ticketBilling} />
      <SubmitButton>Log time</SubmitButton>
    </form>
  );
}

export function TimeEntryRow({
  entry,
  technicians,
  canDelete,
  access,
  timeTypeOptions,
  ticketBilling,
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
  /** How far this entry may still be edited — see TimeEntryAccess. */
  access: TimeEntryAccess;
  /** Active names from the org's time-entry-type catalog (Settings → Actividades). */
  timeTypeOptions: string[];
  /** Ticket context (see TicketBillingDefaults) — omit for Activities. */
  ticketBilling?: TicketBillingDefaults;
}) {
  const [editing, setEditing] = useState(false);
  // "billing" keeps the charge editable on a closed ticket while the record
  // of the work stays frozen, so it posts to a narrower action.
  const billingOnly = access === "billing";
  const canEditAll = access === "full";
  const canEditBilling = access !== "read";
  const [editState, editAction] = useActionState<ActionState, FormData>(
    billingOnly ? updateTimeEntryBilling : updateTimeEntry,
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
          ) : ticketBilling && entry.billingStatus === "billable" && !entry.voided && canEditBilling ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-medium text-amber-600 hover:underline dark:text-amber-300"
            >
              Sin monto — agregar
            </button>
          ) : null}
          {entry.voided ? <Badge tone="red">Voided</Badge> : null}
        </div>
        {canEditBilling && !entry.voided ? (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              aria-label={billingOnly ? "Edit billing" : "Edit entry"}
              title={billingOnly ? "Ajustar cobro (ticket cerrado)" : undefined}
              onClick={() => setEditing((v) => !v)}
              className="flex size-7 items-center justify-center rounded-md text-faint transition-colors hover:bg-primary-soft hover:text-primary"
            >
              {billingOnly ? <Coins className="size-3.5" /> : <Pencil className="size-3.5" />}
            </button>
            {canEditAll ? (
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
            ) : null}
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
          {billingOnly ? (
            <p className="text-xs text-muted">
              Ticket cerrado — solo se puede ajustar el cobro. El monto se recalcula sobre{" "}
              {formatMinutes(entry.durationMinutes)} ya registrados.
            </p>
          ) : (
            <div>
              <label className={labelClass}>Technician</label>
              <SearchableSelect
                name="userId"
                defaultValue={String(entry.userId)}
                options={technicians.map((t) => ({ value: String(t.id), label: t.name }))}
              />
            </div>
          )}
          <SessionFields
            errors={errors}
            timeTypeOptions={timeTypeOptions}
            ticketBilling={ticketBilling}
            billingOnly={billingOnly}
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
            <SubmitButton>{billingOnly ? "Guardar cobro" : "Save entry"}</SubmitButton>
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
