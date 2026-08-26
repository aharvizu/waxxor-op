"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { buttonClass, inputClass, labelClass } from "@/components/ui";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { Modal } from "@/components/modal";
import { SearchableSelect } from "@/components/searchable-select";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-result";
import { getLabels } from "@/lib/labels";
import { useLocale } from "@/components/locale-provider";
import { t } from "@/lib/i18n";
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
  ["low", "Baja", "Low"],
  ["medium", "Media", "Medium"],
  ["high", "Alta", "High"],
  ["critical", "Crítica", "Critical"],
] as const;

/** Create form when `activity` is omitted; edit form when provided. Assignee only shows on create — editing an existing activity's assignee already happens in WorkflowCard on its detail page, so this form doesn't duplicate that control. */
export function ActivityForm({
  activity,
  companies,
  activityTypeOptions,
  users = [],
  submitLabel,
  defaultType,
  defaultCompanyId,
}: {
  activity?: ActivityFormDefaults;
  companies: Option[];
  /** Active names from the org's activity-type catalog (Settings → Actividades). */
  activityTypeOptions: string[];
  /** Assignable (non-client) org users — only rendered/used on the create form. */
  users?: Option[];
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
  const locale = useLocale();
  const { activityTypeMeta } = getLabels(locale);
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
          {t("Título", "Title", locale)}
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
          {t("Descripción", "Description", locale)}
        </label>
        <textarea
          id="description"
          name="description"
          rows={4}
          defaultValue={value("description", activity?.description ?? "")}
          className={inputClass}
        />
      </div>
      <div className={activity ? "grid grid-cols-1 gap-4 sm:grid-cols-3" : "grid grid-cols-1 gap-4 sm:grid-cols-4"}>
        <div>
          <label htmlFor="activityType" className={labelClass}>
            {t("Tipo", "Type", locale)}
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
            {t("Prioridad", "Priority", locale)}
          </label>
          <SearchableSelect
            id="priority"
            name="priority"
            defaultValue={value("priority", activity?.priority ?? "medium")}
            options={priorities.map(([v, esLabel, enLabel]) => ({ value: v, label: t(esLabel, enLabel, locale) }))}
          />
        </div>
        <div>
          <label htmlFor="companyId" className={labelClass}>
            {t("Cliente", "Client", locale)}
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
              { value: "", label: t("— Ninguno —", "— None —", locale) },
              ...companies.map((c) => ({ value: String(c.id), label: c.name })),
            ]}
          />
        </div>
        {!activity ? (
          <div>
            <label htmlFor="assigneeId" className={labelClass}>
              {t("Responsable", "Assignee", locale)}
            </label>
            <SearchableSelect
              id="assigneeId"
              name="assigneeId"
              defaultValue={value("assigneeId", "")}
              options={[
                { value: "", label: t("Sin asignar", "Unassigned", locale) },
                ...users.map((u) => ({ value: String(u.id), label: u.name })),
              ]}
            />
          </div>
        ) : null}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="startDate" className={labelClass}>
            {t("Fecha de inicio", "Start date", locale)}
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
            {t("Fecha de vencimiento", "Due date", locale)}
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
            {t("Estimado (minutos)", "Estimate (minutes)", locale)}
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
  users,
  defaultCompanyId,
}: {
  companies: Option[];
  activityTypeOptions: string[];
  users?: Option[];
  defaultCompanyId?: number;
}) {
  const [open, setOpen] = useState(false);
  const locale = useLocale();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass}>
        <Plus className="size-4" />
        {t("Nueva actividad", "New activity", locale)}
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={t("Nueva actividad", "New activity", locale)}
        description={t(
          "Solo el título es obligatorio — cliente, responsable y fechas son opcionales.",
          "Only the title is required — client, assignee and dates are optional.",
          locale,
        )}
        className="max-w-2xl"
      >
        <ActivityForm
          companies={companies}
          activityTypeOptions={activityTypeOptions}
          users={users}
          submitLabel={t("Crear actividad", "Create activity", locale)}
          defaultCompanyId={defaultCompanyId}
        />
      </Modal>
    </>
  );
}
