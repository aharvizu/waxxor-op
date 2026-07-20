"use client";

import { AlertCircle, Check, Copy, Loader2, RotateCcw } from "lucide-react";
import { cx, inputClass } from "@/components/ui";
import type { SavedViewConfig, ViewType } from "@/lib/views";
import type { ViewSaveStatus } from "./use-view-config";

/**
 * Shared toolbar: column visibility (Table), grouping field (Kanban),
 * density and page size — always paired with the Motor's save-state
 * machine (clean/dirty/saving/error, see use-view-config.ts). One
 * component for every module/view type; which controls render depends on
 * `viewType` and the options the caller passes in. `canEditDirectly` comes
 * from the caller (owner, or admin on organization/team scope) — System
 * views and editors without write access only ever see "Guardar como
 * nueva vista personal", never "Guardar cambios" (never mutate a
 * protected/shared row the caller can't write to).
 */
export function ViewToolbar({
  viewType,
  config,
  setConfig,
  status,
  errorMessage,
  canEditDirectly,
  save,
  retry,
  discard,
  saveAsNewPersonal,
  columnOptions = [],
  groupByOptions = [],
}: {
  viewType: ViewType;
  config: SavedViewConfig;
  setConfig: (updater: (prev: SavedViewConfig) => SavedViewConfig) => void;
  status: ViewSaveStatus;
  errorMessage: string | null;
  canEditDirectly: boolean;
  save: () => void;
  retry: () => void;
  discard: () => void;
  saveAsNewPersonal: (name: string) => void;
  columnOptions?: { key: string; label: string }[];
  groupByOptions?: { key: string; label: string }[];
}) {
  const visibleColumnKeys = new Set(
    config.columns.length > 0 ? config.columns.filter((c) => c.visible).map((c) => c.key) : columnOptions.map((c) => c.key),
  );

  function toggleColumn(key: string) {
    setConfig((prev) => {
      const base = prev.columns.length > 0 ? prev.columns : columnOptions.map((c) => ({ key: c.key, visible: true, width: null }));
      const exists = base.some((c) => c.key === key);
      const columns = exists
        ? base.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c))
        : [...base, { key, visible: true, width: null }];
      return { ...prev, columns };
    });
  }

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-edge bg-surface px-3 py-2 text-xs">
      {viewType === "table" && columnOptions.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-faint">Columnas:</span>
          {columnOptions.map((c) => (
            <label key={c.key} className="flex items-center gap-1 text-muted">
              <input type="checkbox" checked={visibleColumnKeys.has(c.key)} onChange={() => toggleColumn(c.key)} />
              {c.label}
            </label>
          ))}
        </div>
      ) : null}

      {viewType === "kanban" && groupByOptions.length > 0 ? (
        <div className="flex items-center gap-1.5">
          <span className="text-faint">Agrupar por:</span>
          <select
            value={config.kanban.groupField ?? groupByOptions[0]?.key ?? ""}
            onChange={(e) => setConfig((prev) => ({ ...prev, kanban: { ...prev.kanban, groupField: e.target.value } }))}
            className={cx(inputClass, "h-7 w-auto text-xs")}
          >
            {groupByOptions.map((g) => (
              <option key={g.key} value={g.key}>{g.label}</option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="flex items-center gap-1.5">
        <span className="text-faint">Densidad:</span>
        <select
          value={config.density}
          onChange={(e) => setConfig((prev) => ({ ...prev, density: e.target.value as SavedViewConfig["density"] }))}
          className={cx(inputClass, "h-7 w-auto text-xs")}
        >
          <option value="compact">Compacta</option>
          <option value="comfortable">Cómoda</option>
          <option value="spacious">Amplia</option>
        </select>
      </div>

      <div className="flex items-center gap-1.5">
        <span className="text-faint">Por página:</span>
        <select
          value={config.pageSize}
          onChange={(e) => setConfig((prev) => ({ ...prev, pageSize: Number(e.target.value) }))}
          className={cx(inputClass, "h-7 w-auto text-xs")}
        >
          {[25, 50, 100, 200].map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </div>

      {status !== "clean" ? (
        <div className="ml-auto flex items-center gap-2">
          {status === "error" ? (
            <span className="flex items-center gap-1 text-danger" title={errorMessage ?? undefined}>
              <AlertCircle className="size-3.5" /> Error al guardar
            </span>
          ) : (
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <AlertCircle className="size-3.5" /> Cambios sin guardar
            </span>
          )}
          <button
            type="button"
            onClick={discard}
            disabled={status === "saving"}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-muted hover:bg-subtle hover:text-fg disabled:opacity-60"
          >
            <RotateCcw className="size-3.5" /> Descartar
          </button>
          <button
            type="button"
            onClick={() => saveAsNewPersonal(`Vista personal`)}
            disabled={status === "saving"}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-muted hover:bg-subtle hover:text-fg disabled:opacity-60"
          >
            <Copy className="size-3.5" /> Guardar como nueva
          </button>
          {canEditDirectly ? (
            <button
              type="button"
              onClick={status === "error" ? retry : save}
              disabled={status === "saving"}
              className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 font-medium text-white hover:bg-primary-hover disabled:opacity-60"
            >
              {status === "saving" ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
              {status === "error" ? "Reintentar" : "Guardar"}
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
