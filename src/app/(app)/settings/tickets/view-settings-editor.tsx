"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { FormAlert } from "@/components/form-feedback";
import { SearchableSelect } from "@/components/searchable-select";
import { SubmitButton } from "@/components/submit-button";
import { buttonSecondaryClass, cx, inputClass, labelClass } from "@/components/ui";
import type { ActionState } from "@/lib/action-result";
import { FILTER_OPERATORS } from "@/lib/filters";
import { saveOrganizationSetting } from "../actions";

type GlobalFilterCondition = { field: string; operator: string; value: unknown };
type SortConfig = { field: string; direction: "asc" | "desc" } | null;

export type ViewSettingsValue = {
  defaultColumns: string[];
  defaultSort: SortConfig;
  initialViewType: "list" | "table" | "kanban" | "calendar" | "timeline";
  defaultGroupBy: string | null;
  globalFilters: GlobalFilterCondition[];
};

/** Part 6: org-wide view defaults new users start from (still personalizable per user afterward). */
export function ViewSettingsEditor({
  initial,
  fieldOptions,
}: {
  initial: ViewSettingsValue;
  fieldOptions: { key: string; label: string }[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveOrganizationSetting, null);
  const [columns, setColumns] = useState<string[]>(initial.defaultColumns);
  const [sortField, setSortField] = useState(initial.defaultSort?.field ?? "");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">(initial.defaultSort?.direction ?? "desc");
  const [filters, setFilters] = useState<GlobalFilterCondition[]>(initial.globalFilters);

  function toggleColumn(key: string) {
    setColumns((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }
  function addFilter() {
    setFilters((prev) => [...prev, { field: fieldOptions[0]?.key ?? "", operator: "eq", value: "" }]);
  }
  function removeFilter(i: number) {
    setFilters((prev) => prev.filter((_, idx) => idx !== i));
  }
  function patchFilter(i: number, patch: Partial<GlobalFilterCondition>) {
    setFilters((prev) => prev.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  }

  const sortConfig: SortConfig = sortField ? { field: sortField, direction: sortDirection } : null;

  return (
    <form action={formAction} className="space-y-5">
      <FormAlert state={state} />
      <input type="hidden" name="settingKey" value="tickets.viewSettings" />
      <input type="hidden" name="defaultColumns" value={JSON.stringify(columns)} />
      <input type="hidden" name="defaultSort" value={JSON.stringify(sortConfig)} />
      <input type="hidden" name="globalFilters" value={JSON.stringify(filters)} />

      <div>
        <label className={labelClass}>Columnas por defecto</label>
        <div className="flex flex-wrap gap-3">
          {fieldOptions.map((f) => (
            <label key={f.key} className="flex items-center gap-1.5 text-sm text-fg">
              <input type="checkbox" checked={columns.includes(f.key)} onChange={() => toggleColumn(f.key)} />
              {f.label}
            </label>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Orden por defecto</label>
          <div className="flex gap-2">
            <SearchableSelect
              value={sortField}
              onValueChange={setSortField}
              options={[{ value: "", label: "Sin ordenamiento" }, ...fieldOptions.map((f) => ({ value: f.key, label: f.label }))]}
            />
            <SearchableSelect
              value={sortDirection}
              onValueChange={(v) => setSortDirection(v as "asc" | "desc")}
              className="w-auto"
              options={[
                { value: "asc", label: "Ascendente" },
                { value: "desc", label: "Descendente" },
              ]}
            />
          </div>
        </div>
        <div>
          <label className={labelClass}>Vista inicial</label>
          <SearchableSelect
            name="initialViewType"
            defaultValue={initial.initialViewType}
            options={[
              { value: "list", label: "Lista" },
              { value: "table", label: "Tabla" },
              { value: "kanban", label: "Kanban" },
              { value: "calendar", label: "Calendario" },
              { value: "timeline", label: "Timeline" },
            ]}
          />
        </div>
      </div>

      <div>
        <label className={labelClass}>Agrupación por defecto</label>
        <SearchableSelect
          name="defaultGroupBy"
          defaultValue={initial.defaultGroupBy ?? ""}
          options={[{ value: "", label: "Sin agrupar" }, ...fieldOptions.map((f) => ({ value: f.key, label: f.label }))]}
        />
      </div>

      <div>
        <label className={labelClass}>Filtros globales (se aplican como base a todas las vistas nuevas)</label>
        <div className="space-y-2">
          {filters.map((f, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <SearchableSelect
                value={f.field}
                onValueChange={(v) => patchFilter(i, { field: v })}
                className="w-auto"
                options={fieldOptions.map((opt) => ({ value: opt.key, label: opt.label }))}
              />
              <SearchableSelect
                value={f.operator}
                onValueChange={(v) => patchFilter(i, { operator: v })}
                className="w-auto"
                options={FILTER_OPERATORS.map((op) => ({ value: op, label: op }))}
              />
              <input
                value={typeof f.value === "string" ? f.value : ""}
                onChange={(e) => patchFilter(i, { value: e.target.value })}
                placeholder="Valor"
                className={cx(inputClass, "w-auto")}
              />
              <button type="button" onClick={() => removeFilter(i)} className="text-muted hover:text-danger">
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addFilter} className={cx(buttonSecondaryClass, "mt-2 inline-flex items-center gap-1.5 h-8 text-xs")}>
          <Plus className="size-3.5" /> Agregar filtro
        </button>
      </div>

      <SubmitButton>Guardar vistas</SubmitButton>
    </form>
  );
}
