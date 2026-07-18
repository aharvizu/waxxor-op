"use client";

import { useActionState } from "react";
import { inputClass, labelClass } from "@/components/ui";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-result";
import { ACTIVITY_TYPES } from "@/lib/activities";
import { activityTypeMeta } from "@/lib/labels";
import { createActivity, updateActivityDetails } from "./actions";

type Option = { id: number; name: string };

export type ActivityFormDefaults = {
  id: number;
  title: string;
  description: string | null;
  activityType: string;
  priority: string;
  clientId: number | null;
  startDate: string | null;
  dueDate: string | null;
  estimatedMinutes: number | null;
};

const priorities = [
  ["low", "Low"],
  ["medium", "Medium"],
  ["high", "High"],
  ["critical", "Critical"],
] as const;

/** Create form when `activity` is omitted; edit form when provided. */
export function ActivityForm({
  activity,
  clients,
  submitLabel,
  defaultType,
  defaultClientId,
}: {
  activity?: ActivityFormDefaults;
  clients: Option[];
  submitLabel: string;
  /** Optional preselected type for the create form (e.g. from Today's + Crear). */
  defaultType?: string;
  /** Optional preselected client for the create form (e.g. from Client 360's + Actividad). */
  defaultClientId?: number;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    activity ? updateActivityDetails : createActivity,
    null,
  );
  const failed = state && !state.ok ? state : null;
  const errors = failed?.fieldErrors ?? {};
  const value = (name: string, saved: string) => failed?.values?.[name] ?? saved;
  const typeDefault =
    activity?.activityType ??
    ((ACTIVITY_TYPES as readonly string[]).includes(defaultType ?? "")
      ? (defaultType as string)
      : "general");

  return (
    <form action={formAction} className="space-y-4">
      {activity ? <input type="hidden" name="id" value={activity.id} /> : null}
      <FormAlert state={state} />
      <div>
        <label htmlFor="title" className={labelClass}>
          Title
        </label>
        <input
          id="title"
          name="title"
          required
          defaultValue={value("title", activity?.title ?? "")}
          aria-invalid={errors.title ? true : undefined}
          aria-describedby={errors.title ? "title-error" : undefined}
          className={inputClass}
        />
        <FieldError id="title-error" errors={errors.title} />
      </div>
      <div>
        <label htmlFor="description" className={labelClass}>
          Description
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={value("description", activity?.description ?? "")}
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="activityType" className={labelClass}>
            Type
          </label>
          <select
            id="activityType"
            name="activityType"
            defaultValue={value("activityType", typeDefault)}
            className={inputClass}
          >
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {activityTypeMeta[t]?.label ?? t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="priority" className={labelClass}>
            Priority
          </label>
          <select
            id="priority"
            name="priority"
            defaultValue={value("priority", activity?.priority ?? "medium")}
            className={inputClass}
          >
            {priorities.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="clientId" className={labelClass}>
            Client
          </label>
          <select
            id="clientId"
            name="clientId"
            defaultValue={value(
              "clientId",
              activity?.clientId
                ? String(activity.clientId)
                : defaultClientId
                  ? String(defaultClientId)
                  : "",
            )}
            className={inputClass}
          >
            <option value="">— None —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="startDate" className={labelClass}>
            Start date
          </label>
          <input
            id="startDate"
            name="startDate"
            type="date"
            defaultValue={value("startDate", activity?.startDate ?? "")}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="dueDate" className={labelClass}>
            Due date
          </label>
          <input
            id="dueDate"
            name="dueDate"
            type="date"
            defaultValue={value("dueDate", activity?.dueDate ?? "")}
            className={inputClass}
          />
        </div>
        <div>
          <label htmlFor="estimatedMinutes" className={labelClass}>
            Estimate (minutes)
          </label>
          <input
            id="estimatedMinutes"
            name="estimatedMinutes"
            type="number"
            min="1"
            defaultValue={value(
              "estimatedMinutes",
              activity?.estimatedMinutes ? String(activity.estimatedMinutes) : "",
            )}
            aria-invalid={errors.estimatedMinutes ? true : undefined}
            aria-describedby={
              errors.estimatedMinutes ? "estimatedMinutes-error" : undefined
            }
            className={inputClass}
          />
          <FieldError id="estimatedMinutes-error" errors={errors.estimatedMinutes} />
        </div>
      </div>
      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}
