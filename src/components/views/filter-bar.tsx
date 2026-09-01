"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { Filter, Plus, Search, Trash2, X } from "lucide-react";
import { SearchableSelect } from "@/components/searchable-select";
import { buttonSecondaryClass, cx, inputClass } from "@/components/ui";
import {
  DATE_RANGE_PRESETS,
  FILTER_OPERATORS,
  type DateRangeFilter,
  type DateRangePreset,
  type PublicFieldDefinition,
  type FilterCondition,
  type FilterGroup,
} from "@/lib/filters";
import { useLocale } from "@/components/locale-provider";
import { t } from "@/lib/i18n";

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
  enableDateRange = false,
  activeDateRange = null,
  onSaveDateRange,
}: {
  fields: Record<string, PublicFieldDefinition>;
  /** Module-specific quick filter chips — empty array renders none. */
  quickFilters?: { key: string; label: string }[];
  activeQuick: string | null;
  activeFilters: FilterGroup | null;
  activeSearch: string;
  onSaveToView?: (filters: FilterGroup | null) => void | Promise<void>;
  /** Opt-in: renders the "Fecha" range/preset picker (Tickets, Actividades
   * for now) — off by default so modules that haven't adopted it render
   * exactly as before. */
  enableDateRange?: boolean;
  activeDateRange?: DateRangeFilter | null;
  onSaveDateRange?: (range: DateRangeFilter | null) => void | Promise<void>;
}) {
  const router = useRouter();
  const locale = useLocale();
  const [builderOpen, setBuilderOpen] = useState(false);
  const [draft, setDraft] = useState<FilterGroup>(activeFilters ?? emptyGroup());
  const [dateDraft, setDateDraft] = useState<DateRangeFilter | null>(activeDateRange);
  const [search, setSearch] = useState(activeSearch);
  const dateFields = Object.values(fields).filter((f) => f.type === "date");
  const activeCount = (activeQuick ? 1 : 0) + (activeFilters?.conditions.length ?? 0) + (activeDateRange ? 1 : 0);

  const DATE_PRESET_LABELS: Record<DateRangePreset, string> = {
    current_week: t("Esta semana", "This week", locale),
    previous_week: t("Semana pasada", "Last week", locale),
    current_month: t("Este mes", "This month", locale),
    previous_month: t("Mes pasado", "Last month", locale),
    current_quarter: t("Este trimestre", "This quarter", locale),
    previous_quarter: t("Trimestre pasado", "Last quarter", locale),
    current_year: t("Este año", "This year", locale),
    custom: t("Rango personalizado", "Custom range", locale),
  };

  function applyParams(entries: [string, string | null][]) {
    const url = new URL(window.location.href);
    for (const [key, value] of entries) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }
    // A new filter/quick-filter/search/date-range term can easily leave the
    // current page number past the end of the (now smaller) result set — go
    // back to page 1 rather than show a confusing empty page.
    url.searchParams.delete("page");
    router.push(`${url.pathname}?${url.searchParams.toString()}`);
  }

  function setUrlParam(key: string, value: string | null) {
    applyParams([[key, value]]);
  }

  function selectQuick(key: string) {
    setUrlParam("quick", activeQuick === key ? null : key);
  }

  function applyFilters() {
    applyParams([
      ["filters", draft.conditions.length > 0 ? JSON.stringify(draft) : null],
      ...(enableDateRange ? ([["dateRange", dateDraft ? JSON.stringify(dateDraft) : null]] as [string, string | null][]) : []),
    ]);
    setBuilderOpen(false);
  }

  function clearFilters() {
    setDraft(emptyGroup());
    setDateDraft(null);
    applyParams([
      ["filters", null],
      ...(enableDateRange ? ([["dateRange", null]] as [string, string | null][]) : []),
    ]);
  }

  function patchDateDraft(patch: Partial<DateRangeFilter>) {
    setDateDraft((prev) => ({
      field: prev?.field ?? dateFields[0]?.key ?? "",
      preset: prev?.preset ?? "current_month",
      from: prev?.from ?? null,
      to: prev?.to ?? null,
      ...patch,
    }));
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

  function clearSearch() {
    setSearch("");
    setUrlParam("q", null);
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">
      <form onSubmit={handleSearchSubmit} className="flex h-9 items-center gap-1.5 rounded-lg border border-edge bg-surface px-2.5">
        <Search className="size-4 shrink-0 text-faint" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar…"
          className="w-40 bg-transparent text-sm outline-none placeholder:text-faint"
        />
        {search ? (
          <button type="button" onClick={clearSearch} aria-label="Limpiar búsqueda" className="shrink-0 text-faint hover:text-fg">
            <X className="size-3.5" />
          </button>
        ) : null}
      </form>

      <Popover.Root open={builderOpen} onOpenChange={setBuilderOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            className={cx(buttonSecondaryClass, "h-9 gap-1.5", activeCount > 0 && "border-primary text-primary")}
          >
            <Filter className="size-4" />
            Filtros
            {activeCount > 0 ? <span className="rounded-full bg-primary px-1.5 text-[10px] text-white">{activeCount}</span> : null}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={8}
            avoidCollisions
            className="z-20 w-[28rem] max-w-[calc(100vw-2rem)] max-h-[min(34rem,80vh)] overflow-y-auto rounded-xl border border-edge bg-surface p-4 shadow-overlay outline-none"
          >
            {/* Quick filters — one-click presets, concentrated here instead of their own always-visible row (ClickUp-style single "Filtros" entry point). */}
            {quickFilters.length > 0 ? (
              <div className="mb-3 border-b border-edge pb-3">
                <div className="mb-1.5 text-[11px] font-medium text-faint">Filtros rápidos</div>
                <div className="flex flex-wrap gap-1.5">
                  {quickFilters.map((qf) => (
                    <button
                      key={qf.key}
                      type="button"
                      onClick={() => selectQuick(qf.key)}
                      className={cx(
                        "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                        activeQuick === qf.key ? "bg-primary-soft text-primary" : "border border-edge text-muted hover:bg-subtle hover:text-fg",
                      )}
                    >
                      {qf.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {enableDateRange && dateFields.length > 0 ? (
              <div className="mb-3 border-b border-edge pb-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <div className="text-[11px] font-medium text-faint">{t("Fecha", "Date", locale)}</div>
                  {dateDraft ? (
                    <button type="button" onClick={() => setDateDraft(null)} className="text-[11px] text-muted hover:text-danger">
                      {t("Quitar", "Remove", locale)}
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <SearchableSelect
                    value={dateDraft?.field ?? dateFields[0].key}
                    onValueChange={(v) => patchDateDraft({ field: v })}
                    className="h-8 w-auto min-w-28 text-xs"
                    options={dateFields.map((f) => ({ value: f.key, label: f.label }))}
                  />
                  <SearchableSelect
                    value={dateDraft?.preset ?? "current_month"}
                    onValueChange={(v) => patchDateDraft({ preset: v as DateRangePreset })}
                    className="h-8 w-auto text-xs"
                    options={DATE_RANGE_PRESETS.map((p) => ({ value: p, label: DATE_PRESET_LABELS[p] }))}
                  />
                  {dateDraft?.preset === "custom" ? (
                    <>
                      <input
                        type="date"
                        value={dateDraft.from ?? ""}
                        onChange={(e) => patchDateDraft({ from: e.target.value || null })}
                        className={cx(inputClass, "h-8 w-auto text-xs")}
                      />
                      <span className="text-xs text-faint">–</span>
                      <input
                        type="date"
                        value={dateDraft.to ?? ""}
                        onChange={(e) => patchDateDraft({ to: e.target.value || null })}
                        className={cx(inputClass, "h-8 w-auto text-xs")}
                      />
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-fg">
                Coincidir
                <SearchableSelect
                  value={draft.logic}
                  onValueChange={(v) => setDraft((prev) => ({ ...prev, logic: v as "AND" | "OR" }))}
                  className="h-7 w-auto text-xs"
                  options={[
                    { value: "AND", label: "Todas (AND)" },
                    { value: "OR", label: "Cualquiera (OR)" },
                  ]}
                />
              </div>
            </div>

            <div className="max-h-72 space-y-2 overflow-y-auto">
              {draft.conditions.map((c, i) => {
                if (isGroup(c)) return null; // nested groups: builder UI kept to one level (fuera de alcance el constructor avanzado)
                const field = fields[c.field];
                return (
                  <div key={i} className="flex flex-wrap items-center gap-1.5">
                    <SearchableSelect
                      value={c.field}
                      onValueChange={(v) => patchCondition(i, { field: v })}
                      className="h-8 w-auto min-w-28 text-xs"
                      options={Object.values(fields).map((f) => ({ value: f.key, label: f.label }))}
                    />
                    <SearchableSelect
                      value={c.operator}
                      onValueChange={(v) => patchCondition(i, { operator: v as FilterCondition["operator"] })}
                      className="h-8 w-auto text-xs"
                      options={FILTER_OPERATORS.map((op) => ({ value: op, label: OPERATOR_LABELS[op] ?? op }))}
                    />
                    {c.operator !== "is_empty" && c.operator !== "is_not_empty" ? (
                      field?.options && field.options.length > 0 ? (
                        <SearchableSelect
                          value={typeof c.value === "string" ? c.value : ""}
                          onValueChange={(v) => patchCondition(i, { value: v })}
                          className="h-8 w-auto text-xs"
                          options={[{ value: "", label: "—" }, ...field.options]}
                        />
                      ) : (
                        <input
                          type={field?.type === "date" ? "date" : "text"}
                          value={typeof c.value === "string" || typeof c.value === "number" ? String(c.value) : ""}
                          onChange={(e) => patchCondition(i, { value: e.target.value })}
                          className={cx(inputClass, "h-8 text-xs", field?.type === "date" ? "w-auto" : "w-24")}
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
                    onClick={() => {
                      onSaveToView(draft.conditions.length > 0 ? draft : null);
                      if (enableDateRange) onSaveDateRange?.(dateDraft);
                    }}
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
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}
