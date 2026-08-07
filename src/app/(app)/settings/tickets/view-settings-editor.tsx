"use client";

import { useActionState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Trash2 } from "lucide-react";
import { FormAlert } from "@/components/form-feedback";
import { SearchableSelect } from "@/components/searchable-select";
import { SubmitButton } from "@/components/submit-button";
import { buttonSecondaryClass, cx, inputClass, labelClass } from "@/components/ui";
import type { ActionState } from "@/lib/action-result";
import { FILTER_OPERATORS } from "@/lib/filters";
import type { ViewSettings } from "@/lib/settings";
import { saveOrganizationSetting } from "../actions";

/**
 * Same shape/rules as `viewSettingsSchema` (src/lib/settings.ts) restated
 * without its `jsonField` JSON-string preprocessing or `.default()`s — see
 * form-config-editor.tsx's identical note on why zodResolver needs a plain
 * (non-preprocessed, non-defaulted) variant to type-check against a form
 * whose `defaultValues` already supply every field. `defaultSort` is kept as
 * two flat fields (sortField/sortDirection) here and recombined into the
 * nullable `{field,direction}` object only at submit time — simpler than
 * modeling a nullable nested object as one reactive RHF field.
 */
const clientViewSettingsSchema = z.object({
  defaultColumns: z.array(z.string()),
  sortField: z.string(),
  sortDirection: z.enum(["asc", "desc"]),
  initialViewType: z.enum(["list", "table", "kanban", "calendar", "timeline"]),
  defaultGroupBy: z.string(),
  globalFilters: z.array(z.object({ field: z.string().min(1, "Requerido"), operator: z.string().min(1, "Requerido"), value: z.string() })),
});
type FormValues = z.infer<typeof clientViewSettingsSchema>;

/** Part 6: org-wide view defaults new users start from (still personalizable per user afterward). Migrated to React Hook Form (`useFieldArray` for the global filter rows) — the submit path is unchanged: `onValid` builds the same FormData shape and calls the existing `saveOrganizationSetting` Server Action through the same `useActionState` (settingKey "tickets.viewSettings"). */
export function ViewSettingsEditor({
  initial,
  fieldOptions,
}: {
  initial: ViewSettings;
  fieldOptions: { key: string; label: string }[];
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(saveOrganizationSetting, null);
  const { control, register, handleSubmit } = useForm<FormValues>({
    resolver: zodResolver(clientViewSettingsSchema),
    defaultValues: {
      defaultColumns: initial.defaultColumns,
      sortField: initial.defaultSort?.field ?? "",
      sortDirection: initial.defaultSort?.direction ?? "desc",
      initialViewType: initial.initialViewType,
      defaultGroupBy: initial.defaultGroupBy ?? "",
      globalFilters: initial.globalFilters.map((f) => ({ field: f.field, operator: f.operator, value: typeof f.value === "string" ? f.value : "" })),
    },
  });
  const { fields: filterFields, append, remove } = useFieldArray({ control, name: "globalFilters" });

  function onValid(values: FormValues) {
    const fd = new FormData();
    fd.set("settingKey", "tickets.viewSettings");
    fd.set("defaultColumns", JSON.stringify(values.defaultColumns));
    fd.set("defaultSort", JSON.stringify(values.sortField ? { field: values.sortField, direction: values.sortDirection } : null));
    fd.set("initialViewType", values.initialViewType);
    fd.set("defaultGroupBy", values.defaultGroupBy);
    fd.set("globalFilters", JSON.stringify(values.globalFilters));
    formAction(fd);
  }

  return (
    <form onSubmit={handleSubmit(onValid)} className="space-y-5">
      <FormAlert state={state} />

      <div>
        <label className={labelClass}>Columnas por defecto</label>
        <Controller
          control={control}
          name="defaultColumns"
          render={({ field }) => (
            <div className="flex flex-wrap gap-3">
              {fieldOptions.map((f) => (
                <label key={f.key} className="flex items-center gap-1.5 text-sm text-fg">
                  <input
                    type="checkbox"
                    checked={field.value.includes(f.key)}
                    onChange={() => field.onChange(field.value.includes(f.key) ? field.value.filter((k) => k !== f.key) : [...field.value, f.key])}
                  />
                  {f.label}
                </label>
              ))}
            </div>
          )}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Orden por defecto</label>
          <div className="flex gap-2">
            <Controller
              control={control}
              name="sortField"
              render={({ field }) => (
                <SearchableSelect
                  value={field.value}
                  onValueChange={field.onChange}
                  options={[{ value: "", label: "Sin ordenamiento" }, ...fieldOptions.map((f) => ({ value: f.key, label: f.label }))]}
                />
              )}
            />
            <Controller
              control={control}
              name="sortDirection"
              render={({ field }) => (
                <SearchableSelect
                  value={field.value}
                  onValueChange={(v) => field.onChange(v)}
                  className="w-auto"
                  options={[
                    { value: "asc", label: "Ascendente" },
                    { value: "desc", label: "Descendente" },
                  ]}
                />
              )}
            />
          </div>
        </div>
        <div>
          <label className={labelClass}>Vista inicial</label>
          <Controller
            control={control}
            name="initialViewType"
            render={({ field }) => (
              <SearchableSelect
                value={field.value}
                onValueChange={(v) => field.onChange(v)}
                options={[
                  { value: "list", label: "Lista" },
                  { value: "table", label: "Tabla" },
                  { value: "kanban", label: "Kanban" },
                  { value: "calendar", label: "Calendario" },
                  { value: "timeline", label: "Timeline" },
                ]}
              />
            )}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Agrupación por defecto</label>
        <Controller
          control={control}
          name="defaultGroupBy"
          render={({ field }) => (
            <SearchableSelect
              value={field.value}
              onValueChange={field.onChange}
              options={[{ value: "", label: "Sin agrupar" }, ...fieldOptions.map((f) => ({ value: f.key, label: f.label }))]}
            />
          )}
        />
      </div>

      <div>
        <label className={labelClass}>Filtros globales (se aplican como base a todas las vistas nuevas)</label>
        <div className="space-y-2">
          {filterFields.map((f, i) => (
            <div key={f.id} className="flex flex-wrap items-center gap-2">
              <Controller
                control={control}
                name={`globalFilters.${i}.field`}
                render={({ field }) => (
                  <SearchableSelect value={field.value} onValueChange={field.onChange} className="w-auto" options={fieldOptions.map((opt) => ({ value: opt.key, label: opt.label }))} />
                )}
              />
              <Controller
                control={control}
                name={`globalFilters.${i}.operator`}
                render={({ field }) => (
                  <SearchableSelect value={field.value} onValueChange={field.onChange} className="w-auto" options={FILTER_OPERATORS.map((op) => ({ value: op, label: op }))} />
                )}
              />
              <input {...register(`globalFilters.${i}.value`)} placeholder="Valor" className={cx(inputClass, "w-auto")} />
              <button type="button" onClick={() => remove(i)} className="text-muted hover:text-danger">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => append({ field: fieldOptions[0]?.key ?? "", operator: "eq", value: "" })}
          className={cx(buttonSecondaryClass, "mt-2 inline-flex items-center gap-1.5 h-8 text-xs")}
        >
          <Plus className="size-3.5" /> Agregar filtro
        </button>
      </div>

      <SubmitButton pending={pending}>Guardar vistas</SubmitButton>
    </form>
  );
}
