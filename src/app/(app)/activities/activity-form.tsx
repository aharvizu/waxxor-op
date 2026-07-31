"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { buttonClass, inputClass, labelClass } from "@/components/ui";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { Modal } from "@/components/modal";
import { SearchableSelect } from "@/components/searchable-select";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-result";
import { activityTypeMeta } from "@/lib/labels";
import { createActivity, updateActivityDetails } from "./actions";

type Option = { id: number; name: string };

export type ActivityFormDefaults = {
  id: number;
  title: string;
  description: string | null;
  activityType: string;
  priority: string;
  companyId: number | null;
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
  companies,
  activityTypeOptions,
  submitLabel,
  defaultType,
  defaultCompanyId,
}: {
  activity?: ActivityFormDefaults;
  companies: Option[];
  /** Active names from the org's activity-type catalog (Settings → Actividades). */
  activityTypeOptions: string[];
  submitLabel: string;
  /** Optional preselected type for the create form (e.g. from Today's + Crear). */
  defaultType?: string;
  /** Optional preselected client for the create form (e.g. from Client 360's + Actividad). */
  defaultCompanyId?: number;
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
    (activityTypeOptions.includes(defaultType ?? "") ? (defaultType as string) : "general");

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
          <SearchableSelect
            id="activityType"
            name="activityType"
            required
            defaultValue={value("activityType", typeDefault)}
            options={[
              ...(typeDefault && !activityTypeOptions.includes(typeDefault)
                ? [{ value: typeDefault, label: activityTypeMeta[typeDefault]?.label ?? typeDefault }]
                : []),
              ...activityTypeOptions.map((t) => ({ value: t, label: activityTypeMeta[t]?.label ?? t })),
            ]}
          />
        </div>
        <div>
          <label htmlFor="priority" className={labelClass}>
            Priority
          </label>
          <SearchableSelect
            id="priority"
            name="priority"
            defaultValue={value("priority", activity?.priority ?? "medium")}
            options={priorities.map(([v, label]) => ({ value: v, label }))}
          />
        </div>
        <div>
          <label htmlFor="companyId" className={labelClass}>
            Client
          </label>
          <SearchableSelect
            id="companyId"
            name="companyId"
            defaultValue={value(
              "companyId",
              activity?.companyId
                ? String(activity.companyId)
                : defaultCompanyId
                  ? String(defaultCompanyId)
                  : "",
            )}
            options={[
              { value: "", label: "— None —" },
              ...companies.map((c) => ({ value: String(c.id), label: c.name })),
            ]}
          />
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

/** Trigger + modal for the Activities list header — creation redirects to the new activity on success, which closes this by leaving the route. */
export function NewActivityButton({
  companies,
  activityTypeOptions,
  defaultCompanyId,
}: {
  companies: Option[];
  activityTypeOptions: string[];
  defaultCompanyId?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass}>
        <Plus className="size-4" />
        New activity
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="New activity"
        description="Only the title is required — client, assignee and dates are optional."
        className="max-w-2xl"
      >
        <ActivityForm
          companies={companies}
          activityTypeOptions={activityTypeOptions}
          submitLabel="Create activity"
          defaultCompanyId={defaultCompanyId}
        />
      </Modal>
    </>
  );
}
