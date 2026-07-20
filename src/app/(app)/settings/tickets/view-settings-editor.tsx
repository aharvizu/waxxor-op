"use client";

import { useActionState, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { FormAlert } from "@/components/form-feedback";
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
            <select value={sortField} onChange={(e) => setSortField(e.target.value)} className={inputClass}>
              <option value="">Sin ordenamiento</option>
              {fieldOptions.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
            <select value={sortDirection} onChange={(e) => setSortDirection(e.target.value as "asc" | "desc")} className={cx(inputClass, "w-auto")}>
              <option value="asc">Ascendente</option>
              <option value="desc">Descendente</option>
            </select>
          </div>
        </div>
        <div>
          <label className={labelClass}>Vista inicial</label>
          <select name="initialViewType" defaultValue={initial.initialViewType} className={inputClass}>
            <option value="list">Lista</option>
            <option value="table">Tabla</option>
            <option value="kanban">Kanban</option>
            <option value="calendar">Calendario</option>
            <option value="timeline">Timeline</option>
          </select>
        </div>
      </div>

      <div>
        <label className={labelClass}>Agrupación por defecto</label>
        <select name="defaultGroupBy" defaultValue={initial.defaultGroupBy ?? ""} className={inputClass}>
          <option value="">Sin agrupar</option>
          {fieldOptions.map((f) => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>Filtros globales (se aplican como base a todas las vistas nuevas)</label>
        <div className="space-y-2">
          {filters.map((f, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select value={f.field} onChange={(e) => patchFilter(i, { field: e.target.value })} className={cx(inputClass, "w-auto")}>
                {fieldOptions.map((opt) => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </select>
              <select value={f.operator} onChange={(e) => patchFilter(i, { operator: e.target.value })} className={cx(inputClass, "w-auto")}>
                {FILTER_OPERATORS.map((op) => (
                  <option key={op} value={op}>{op}</option>
                ))}
              </select>
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
