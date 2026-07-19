"use client";

import { useState, useActionState } from "react";
import { Pencil, Power } from "lucide-react";
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
import { ticketPriorityMeta } from "@/lib/labels";
import { formatMinutes } from "@/lib/time-entries";
import {
  createSlaDefinition,
  saveCalendar,
  toggleSlaDefinition,
  updateSlaDefinition,
} from "./actions";

const PRIORITIES = ["low", "medium", "high", "critical"] as const;

function DefinitionFields({
  errors,
  defaults,
}: {
  errors: Record<string, string[]>;
  defaults?: {
    name: string;
    description: string | null;
    priority: string;
    firstResponseMinutes: number;
    resolutionMinutes: number;
    businessHoursOnly: boolean;
    isDefault: boolean;
  };
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Name</label>
          <input
            name="name"
            required
            placeholder="e.g. Critical 24/7"
            defaultValue={defaults?.name ?? ""}
            aria-invalid={errors.name ? true : undefined}
            className={inputClass}
          />
          <FieldError errors={errors.name} />
        </div>
        <div>
          <label className={labelClass}>Priority it applies to</label>
          <select name="priority" defaultValue={defaults?.priority ?? "medium"} className={inputClass}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {ticketPriorityMeta[p]?.label ?? p}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>First response (minutes)</label>
          <input
            name="firstResponseMinutes"
            type="number"
            min="1"
            required
            defaultValue={defaults?.firstResponseMinutes ?? ""}
            aria-invalid={errors.firstResponseMinutes ? true : undefined}
            className={inputClass}
          />
          <FieldError errors={errors.firstResponseMinutes} />
        </div>
        <div>
          <label className={labelClass}>Resolution (minutes)</label>
          <input
            name="resolutionMinutes"
            type="number"
            min="1"
            required
            defaultValue={defaults?.resolutionMinutes ?? ""}
            aria-invalid={errors.resolutionMinutes ? true : undefined}
            className={inputClass}
          />
          <FieldError errors={errors.resolutionMinutes} />
        </div>
      </div>
      <div>
        <label className={labelClass}>Description (optional)</label>
        <input name="description" defaultValue={defaults?.description ?? ""} className={inputClass} />
      </div>
      <div className="flex flex-wrap gap-5 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="businessHoursOnly"
            defaultChecked={defaults?.businessHoursOnly ?? false}
          />
          Business hours only (uses the work calendar below)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isDefault" defaultChecked={defaults?.isDefault ?? false} />
          Default for this priority
        </label>
      </div>
    </>
  );
}

export function CreateDefinitionForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(
    createSlaDefinition,
    null,
  );
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={formAction} className="space-y-4">
      <FormAlert state={state} />
      <DefinitionFields errors={errors} />
      <SubmitButton>Create SLA</SubmitButton>
    </form>
  );
}

export function DefinitionRow({
  definition,
}: {
  definition: {
    id: number;
    name: string;
    description: string | null;
    priority: string;
    firstResponseMinutes: number;
    resolutionMinutes: number;
    businessHoursOnly: boolean;
    isDefault: boolean;
    status: string;
  };
}) {
  const [editing, setEditing] = useState(false);
  const [editState, editAction] = useActionState<ActionState, FormData>(
    updateSlaDefinition,
    null,
  );
  const [toggleState, toggleAction] = useActionState<ActionState, FormData>(
    toggleSlaDefinition,
    null,
  );
  const errors = editState && !editState.ok ? (editState.fieldErrors ?? {}) : {};
  const d = definition;

  return (
    <li
      className={cx(
        "rounded-lg border border-edge bg-subtle px-4 py-3",
        d.status === "inactive" && "opacity-55",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-fg">{d.name}</span>
          <Badge tone={ticketPriorityMeta[d.priority]?.tone ?? "slate"}>
            {ticketPriorityMeta[d.priority]?.label ?? d.priority}
          </Badge>
          <span className="text-muted tabular-nums">
            FR {formatMinutes(d.firstResponseMinutes)} · Res {formatMinutes(d.resolutionMinutes)}
          </span>
          <Badge tone="slate">{d.businessHoursOnly ? "Business hours" : "24/7"}</Badge>
          {d.isDefault ? <Badge tone="purple">Default</Badge> : null}
          {d.status === "inactive" ? <Badge tone="red">Inactive</Badge> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label="Edit definition"
            onClick={() => setEditing((v) => !v)}
            className="flex size-7 items-center justify-center rounded-md text-faint transition-colors hover:bg-primary-soft hover:text-primary"
          >
            <Pencil className="size-3.5" />
          </button>
          <form action={toggleAction}>
            <input type="hidden" name="id" value={d.id} />
            <button
              type="submit"
              aria-label={d.status === "active" ? "Deactivate" : "Activate"}
              title={d.status === "active" ? "Deactivate" : "Activate"}
              className="flex size-7 items-center justify-center rounded-md text-faint transition-colors hover:bg-subtle hover:text-fg"
            >
              <Power className="size-3.5" />
            </button>
          </form>
        </div>
      </div>
      {d.description ? <p className="mt-1 text-sm text-muted">{d.description}</p> : null}
      {toggleState && !toggleState.ok ? (
        <FormAlert state={toggleState} className="mt-2" />
      ) : null}

      {editing ? (
        <form action={editAction} className="mt-3 space-y-3 border-t border-edge pt-3">
          <input type="hidden" name="id" value={d.id} />
          <FormAlert state={editState} />
          <DefinitionFields errors={errors} defaults={d} />
          <div className="flex items-center gap-2">
            <SubmitButton>Save</SubmitButton>
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

const DAY_LABELS: [number, string][] = [
  [1, "Mon"], [2, "Tue"], [3, "Wed"], [4, "Thu"], [5, "Fri"], [6, "Sat"], [7, "Sun"],
];

function toTime(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export function CalendarForm({
  calendar,
}: {
  calendar: {
    timezone: string;
    workDays: number[];
    workStartMinute: number;
    workEndMinute: number;
  };
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveCalendar, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className="space-y-4">
      <FormAlert state={state} />
      <div>
        <label className={labelClass}>Timezone (IANA)</label>
        <input
          name="timezone"
          required
          defaultValue={calendar.timezone}
          aria-invalid={errors.timezone ? true : undefined}
          className={inputClass}
        />
        <FieldError errors={errors.timezone} />
      </div>
      <div>
        <span className={labelClass}>Working days</span>
        <div className="flex flex-wrap gap-3 text-sm">
          {DAY_LABELS.map(([n, label]) => (
            <label key={n} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                name="workDays"
                value={n}
                defaultChecked={calendar.workDays.includes(n)}
              />
              {label}
            </label>
          ))}
        </div>
        <FieldError errors={errors.workDays} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Day starts</label>
          <input
            name="workStartTime"
            type="time"
            defaultValue={toTime(calendar.workStartMinute)}
            className={inputClass}
            onChange={(e) => {
              const hidden = e.currentTarget.form?.elements.namedItem(
                "workStartMinute",
              ) as HTMLInputElement | null;
              if (hidden) {
                const [h, m] = e.currentTarget.value.split(":").map(Number);
                hidden.value = String(h * 60 + m);
              }
            }}
          />
          <input type="hidden" name="workStartMinute" defaultValue={calendar.workStartMinute} />
        </div>
        <div>
          <label className={labelClass}>Day ends</label>
          <input
            name="workEndTime"
            type="time"
            defaultValue={toTime(calendar.workEndMinute)}
            className={inputClass}
            onChange={(e) => {
              const hidden = e.currentTarget.form?.elements.namedItem(
                "workEndMinute",
              ) as HTMLInputElement | null;
              if (hidden) {
                const [h, m] = e.currentTarget.value.split(":").map(Number);
                hidden.value = String(h * 60 + m);
              }
            }}
          />
          <input type="hidden" name="workEndMinute" defaultValue={calendar.workEndMinute} />
          <FieldError errors={errors.workEndMinute} />
        </div>
      </div>
      <SubmitButton>Save calendar</SubmitButton>
    </form>
  );
}
