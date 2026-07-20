"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Filter, Plus, Search, Trash2, X } from "lucide-react";
import { buttonSecondaryClass, cx, inputClass } from "@/components/ui";
import { FILTER_OPERATORS, type PublicFieldDefinition, type FilterCondition, type FilterGroup } from "@/lib/filters";

const OPERATOR_LABELS: Record<string, string> = {
  eq: "es",
  ne: "no es",
  gt: "mayor que",
  gte: "mayor o igual",
  lt: "menor que",
  lte: "menor o igual",
  contains: "contiene",
  not_contains: "no contiene",
  in: "en",
  not_in: "no en",
  is_empty: "vacío",
  is_not_empty: "no vacío",
};

function isGroup(c: FilterCondition | FilterGroup): c is FilterGroup {
  return "logic" in c;
}

function emptyGroup(): FilterGroup {
  return { logic: "AND", conditions: [] };
}

/**
 * Shared filter administrator (motor de vistas reutilizable, 2026-07-21) —
 * one component for every module, quick filters injected as data
 * ("configuración por entidad", not per-module copies). Fuera de alcance
 * este sprint: constructor AND/OR avanzado (anidación) — se mantiene el
 * editor de un nivel ya existente, reutilizado tal cual. Quick filters are
 * one click; "Filtros" opens the single-level AND/OR condition builder.
 * Both write into the URL (?quick=, ?filters=) so the server component
 * re-queries; "Guardar en vista" persists the current state via onSaveToView.
 */
export function FilterBar({
  fields,
  quickFilters = [],
  activeQuick,
  activeFilters,
  activeSearch,
  onSaveToView,
}: {
  fields: Record<string, PublicFieldDefinition>;
  /** Module-specific quick filter chips — empty array renders none. */
  quickFilters?: { key: string; label: string }[];
  activeQuick: string | null;
  activeFilters: FilterGroup | null;
  activeSearch: string;
  onSaveToView?: (filters: FilterGroup | null) => void | Promise<void>;
}) {
  const router = useRouter();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [draft, setDraft] = useState<FilterGroup>(activeFilters ?? emptyGroup());
  const [search, setSearch] = useState(activeSearch);

  function setUrlParam(key: string, value: string | null) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    router.push(`${url.pathname}?${url.searchParams.toString()}`);
  }

  function selectQuick(key: string) {
    setUrlParam("quick", activeQuick === key ? null : key);
  }

  function applyFilters() {
    setUrlParam("filters", draft.conditions.length > 0 ? JSON.stringify(draft) : null);
    setBuilderOpen(false);
  }

  function clearFilters() {
    setDraft(emptyGroup());
    setUrlParam("filters", null);
  }

  function addCondition() {
    const firstField = Object.keys(fields)[0];
    setDraft((prev) => ({ ...prev, conditions: [...prev.conditions, { field: firstField, operator: "eq", value: "" }] }));
  }
  function removeCondition(index: number) {
    setDraft((prev) => ({ ...prev, conditions: prev.conditions.filter((_, i) => i !== index) }));
  }
  function patchCondition(index: number, patch: Partial<FilterCondition>) {
    setDraft((prev) => ({
      ...prev,
      conditions: prev.conditions.map((c, i) => (i === index && !isGroup(c) ? { ...c, ...patch } : c)),
    }));
  }

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setUrlParam("q", search.trim() || null);
  }

  return (
    <div className="mb-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <form onSubmit={handleSearchSubmit} className="flex h-9 items-center gap-1.5 rounded-lg border border-edge bg-surface px-2.5">
          <Search className="size-4 shrink-0 text-faint" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar…"
            className="w-40 bg-transparent text-sm outline-none placeholder:text-faint"
          />
        </form>

        {quickFilters.map((qf) => (
          <button
            key={qf.key}
            type="button"
            onClick={() => selectQuick(qf.key)}
            className={cx(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              activeQuick === qf.key ? "bg-primary-soft text-primary" : "border border-edge text-muted hover:bg-subtle hover:text-fg",
            )}
          >
            {qf.label}
          </button>
        ))}

        <div className="relative">
          <button
            type="button"
            onClick={() => setBuilderOpen((o) => !o)}
            className={cx(buttonSecondaryClass, "h-9 gap-1.5", activeFilters && activeFilters.conditions.length > 0 && "border-primary text-primary")}
          >
            <Filter className="size-4" />
            Filtros
            {activeFilters && activeFilters.conditions.length > 0 ? (
              <span className="rounded-full bg-primary px-1.5 text-[10px] text-white">{activeFilters.conditions.length}</span>
            ) : null}
          </button>

          {builderOpen ? (
            <div className="absolute top-11 left-0 z-20 w-[28rem] rounded-xl border border-edge bg-surface p-4 shadow-overlay">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-medium text-fg">
                  Coincidir
                  <select
                    value={draft.logic}
                    onChange={(e) => setDraft((prev) => ({ ...prev, logic: e.target.value as "AND" | "OR" }))}
                    className={cx(inputClass, "h-7 w-auto text-xs")}
                  >
                    <option value="AND">Todas (AND)</option>
                    <option value="OR">Cualquiera (OR)</option>
                  </select>
                </div>
                <button type="button" onClick={() => setBuilderOpen(false)} className="text-muted hover:text-fg">
                  <X className="size-4" />
                </button>
              </div>

              <div className="max-h-72 space-y-2 overflow-y-auto">
                {draft.conditions.map((c, i) => {
                  if (isGroup(c)) return null; // nested groups: builder UI kept to one level (fuera de alcance el constructor avanzado)
                  const field = fields[c.field];
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-1.5">
                      <select
                        value={c.field}
                        onChange={(e) => patchCondition(i, { field: e.target.value })}
                        className={cx(inputClass, "h-8 w-auto min-w-28 text-xs")}
                      >
                        {Object.values(fields).map((f) => (
                          <option key={f.key} value={f.key}>{f.label}</option>
                        ))}
                      </select>
                      <select
                        value={c.operator}
                        onChange={(e) => patchCondition(i, { operator: e.target.value as FilterCondition["operator"] })}
                        className={cx(inputClass, "h-8 w-auto text-xs")}
                      >
                        {FILTER_OPERATORS.map((op) => (
                          <option key={op} value={op}>{OPERATOR_LABELS[op] ?? op}</option>
                        ))}
                      </select>
                      {c.operator !== "is_empty" && c.operator !== "is_not_empty" ? (
                        field?.type === "select" && field.options ? (
                          <select
                            value={typeof c.value === "string" ? c.value : ""}
                            onChange={(e) => patchCondition(i, { value: e.target.value })}
                            className={cx(inputClass, "h-8 w-auto text-xs")}
                          >
                            <option value="">—</option>
                            {field.options.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            value={typeof c.value === "string" || typeof c.value === "number" ? String(c.value) : ""}
                            onChange={(e) => patchCondition(i, { value: e.target.value })}
                            className={cx(inputClass, "h-8 w-24 text-xs")}
                          />
                        )
                      ) : null}
                      <button type="button" onClick={() => removeCondition(i)} className="text-muted hover:text-danger">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              <button type="button" onClick={addCondition} className={cx(buttonSecondaryClass, "mt-3 inline-flex h-7 items-center gap-1 text-xs")}>
                <Plus className="size-3.5" /> Agregar condición
              </button>

              <div className="mt-4 flex items-center justify-between gap-2 border-t border-edge pt-3">
                <button type="button" onClick={clearFilters} className="text-xs text-muted hover:text-danger">
                  Limpiar
                </button>
                <div className="flex gap-2">
                  {onSaveToView ? (
                    <button
                      type="button"
                      onClick={() => onSaveToView(draft.conditions.length > 0 ? draft : null)}
                      className={cx(buttonSecondaryClass, "h-8 text-xs")}
                    >
                      Guardar en vista
                    </button>
                  ) : null}
                  <button type="button" onClick={applyFilters} className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white hover:bg-primary-hover">
                    Aplicar
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
