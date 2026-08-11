"use client";

import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSizingState,
  type OnChangeFn,
  type RowSelectionState,
  type SortingState,
  type VisibilityState,
} from "@tanstack/react-table";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { Card, Table, THead, Td, Th, cx } from "@/components/ui";
import { compareValues } from "./sortable-th";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData, TValue> {
    align?: "left" | "right";
  }
}

/**
 * TanStack Table piloted only in Tickets' Table view (see ticket-views.tsx)
 * — headless engine under the Views Engine, never a second source of truth.
 * The Motor (use-view-config.ts) owns column visibility/order/width via
 * `columnConfig`; this component only ever *reads* it to derive TanStack's
 * controlled state and *writes* back through `onColumnConfigChange`, which
 * the caller wires straight into the module's `setConfig`. Sorting and row
 * selection stay ephemeral local state here — sorting was already
 * client-side/unpersisted before this pilot (see ticket-views.tsx's prior
 * SortState), and row selection has no persistence concept in the Motor's
 * schema; neither competes with `use-view-config.ts`.
 */

export type DataTableColumn<TRow> = {
  label: string;
  render: (row: TRow) => ReactNode;
  /** Omit for a non-sortable column (e.g. a computed/aggregate display value). */
  sortValue?: (row: TRow) => unknown;
  minSize?: number;
  defaultSize?: number;
  /** Right-align header + cell — use for numeric/tabular-nums columns (counts, durations, amounts) so digits stay scannable. Defaults to left. */
  align?: "left" | "right";
};

export type DataTableColumnConfig = { key: string; visible: boolean; width: number | null };

const SELECT_COLUMN_ID = "__select__";
const LEADING_COLUMN_ID = "__leading__";
const ACTIONS_COLUMN_ID = "__actions__";

/** `columnConfig` as saved, or every known key visible/unsized when nothing's been saved yet. */
export function normalizeColumnConfig(current: DataTableColumnConfig[], defaultColumnKeys: string[]): DataTableColumnConfig[] {
  return current.length > 0 ? current : defaultColumnKeys.map((key) => ({ key, visible: true, width: null }));
}

/** Drops stale keys (removed/renamed columns) and reorders the *visible* subsequence by dragging `draggedKey` next to `targetKey` — hidden columns keep their relative slot. */
export function reorderVisibleColumns(current: DataTableColumnConfig[], defaultColumnKeys: string[], knownKeys: Set<string>, draggedKey: string, targetKey: string): DataTableColumnConfig[] {
  const base = normalizeColumnConfig(current, defaultColumnKeys).filter((c) => knownKeys.has(c.key));
  if (draggedKey === targetKey) return base;
  const visibleKeys = base.filter((c) => c.visible).map((c) => c.key);
  const from = visibleKeys.indexOf(draggedKey);
  const to = visibleKeys.indexOf(targetKey);
  if (from === -1 || to === -1) return base;
  const nextVisibleKeys = [...visibleKeys];
  const [moved] = nextVisibleKeys.splice(from, 1);
  nextVisibleKeys.splice(to, 0, moved);
  const byKey = new Map(base.map((c) => [c.key, c]));
  let cursor = 0;
  return base.map((c) => (c.visible ? byKey.get(nextVisibleKeys[cursor++])! : c));
}

/** Commits a TanStack column-sizing map (fired once per drag, `columnResizeMode: "onEnd"`) back into `columnConfig`. */
export function applyColumnResize(current: DataTableColumnConfig[], defaultColumnKeys: string[], knownKeys: Set<string>, sizing: Record<string, number>): DataTableColumnConfig[] {
  const base = normalizeColumnConfig(current, defaultColumnKeys).filter((c) => knownKeys.has(c.key));
  const patched = base.map((c) => (c.key in sizing ? { ...c, width: Math.round(sizing[c.key]) } : c));
  const patchedKeys = new Set(patched.map((c) => c.key));
  const added = Object.entries(sizing)
    .filter(([key]) => knownKeys.has(key) && !patchedKeys.has(key))
    .map(([key, width]) => ({ key, visible: true, width: Math.round(width) }));
  return [...patched, ...added];
}

export function DataTable<TRow>({
  rows,
  registry,
  defaultColumnKeys,
  columnConfig,
  onColumnConfigChange,
  density,
  leadingColumn,
  rowActions,
  rowClassName,
  getRowId = (row) => String((row as { id: number | string }).id),
  enableRowSelection = false,
  emptyState,
}: {
  rows: TRow[];
  /** The full column universe — every key here gets a real TanStack column, so a saved config can turn on any of them, not just the defaults. */
  registry: Record<string, DataTableColumn<TRow>>;
  /** Columns (and order) to fall back to when `columnConfig` is empty — may be a curated subset of `registry` (e.g. Companies' picker default vs. its superset of optional columns). */
  defaultColumnKeys: string[];
  /** The Motor's `SavedViewConfig.columns` — single source of truth for visibility/order/width. */
  columnConfig: DataTableColumnConfig[];
  onColumnConfigChange: (updater: (prev: DataTableColumnConfig[]) => DataTableColumnConfig[]) => void;
  density: "compact" | "comfortable" | "spacious";
  /** Leading, pinned, non-sortable/non-hideable/non-resizable column rendered right after the selection checkbox (e.g. Projects'/Recurring's favorite star) — headerless, symmetric to `rowActions`. */
  leadingColumn?: (row: TRow) => ReactNode;
  /** Trailing, pinned, non-sortable/non-hideable/non-resizable column. */
  rowActions?: (row: TRow) => ReactNode;
  /** Extra classes for a row beyond selection highlighting (e.g. Contacts' dimmed inactive rows). */
  rowClassName?: (row: TRow) => string | undefined;
  /** Row identity for TanStack + React keys. Defaults to `row.id` — pass this when the row has no top-level `id` (e.g. Recurring's `row.def.id`). */
  getRowId?: (row: TRow) => string;
  enableRowSelection?: boolean;
  emptyState: ReactNode;
}) {
  const [sorting, setSorting] = useState<SortingState>([]);
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [armedKey, setArmedKey] = useState<string | null>(null);
  /** Keyboard reorder ("grab" a column, then ArrowLeft/ArrowRight, Escape to release) — the mouse-drag path above has no keyboard equivalent otherwise. */
  const [grabbedKey, setGrabbedKey] = useState<string | null>(null);

  const knownKeySet = useMemo(() => new Set(Object.keys(registry)), [registry]);
  const knownColumns = useMemo(
    () => normalizeColumnConfig(columnConfig, defaultColumnKeys).filter((c) => knownKeySet.has(c.key)),
    [columnConfig, defaultColumnKeys, knownKeySet],
  );

  const columnOrder = useMemo(() => {
    const order = knownColumns.map((c) => c.key);
    if (leadingColumn) order.unshift(LEADING_COLUMN_ID);
    if (enableRowSelection) order.unshift(SELECT_COLUMN_ID);
    if (rowActions) order.push(ACTIONS_COLUMN_ID);
    return order;
  }, [knownColumns, enableRowSelection, leadingColumn, rowActions]);

  // Explicit true/false for every known registry key — TanStack treats an
  // *absent* key as visible, so a superset column (in `registry` but not in
  // `knownColumns` because it was never turned on) must be listed as false,
  // not simply omitted, or it renders unconditionally (caught migrating
  // Companies, whose registry is a strict superset of its default columns).
  const columnVisibility = useMemo<VisibilityState>(() => {
    const visibleKeys = new Set(knownColumns.filter((c) => c.visible).map((c) => c.key));
    const out: VisibilityState = {};
    for (const key of knownKeySet) out[key] = visibleKeys.has(key);
    return out;
  }, [knownColumns, knownKeySet]);

  const columnSizing = useMemo<ColumnSizingState>(() => {
    const out: ColumnSizingState = {};
    for (const c of knownColumns) if (c.width != null) out[c.key] = c.width;
    return out;
  }, [knownColumns]);

  const handleColumnSizingChange: OnChangeFn<ColumnSizingState> = useCallback(
    (updater) => {
      const next = typeof updater === "function" ? updater(columnSizing) : updater;
      onColumnConfigChange((prev) => applyColumnResize(prev, defaultColumnKeys, knownKeySet, next));
    },
    [columnSizing, onColumnConfigChange, defaultColumnKeys, knownKeySet],
  );

  function commitReorder(draggedKey: string, targetKey: string) {
    onColumnConfigChange((prev) => reorderVisibleColumns(prev, defaultColumnKeys, knownKeySet, draggedKey, targetKey));
  }

  const visibleOrderedKeys = useMemo(() => knownColumns.filter((c) => c.visible).map((c) => c.key), [knownColumns]);

  /** Keyboard equivalent of dragging a header one slot left/right — no-op at either end (no wraparound). */
  function moveColumn(key: string, direction: -1 | 1) {
    const index = visibleOrderedKeys.indexOf(key);
    const targetIndex = index + direction;
    if (index === -1 || targetIndex < 0 || targetIndex >= visibleOrderedKeys.length) return;
    commitReorder(key, visibleOrderedKeys[targetIndex]);
  }

  /** Keyboard equivalent of dragging the resize handle — bypasses TanStack's mouse-drag `columnSizingInfo` and commits straight through the same path `handleColumnSizingChange` uses. */
  function resizeColumnBy(columnId: string, currentSize: number, minSize: number, delta: number) {
    const nextSize = Math.max(minSize, Math.round(currentSize + delta));
    onColumnConfigChange((prev) => applyColumnResize(prev, defaultColumnKeys, knownKeySet, { [columnId]: nextSize }));
  }

  const tanstackColumns = useMemo<ColumnDef<TRow, unknown>[]>(() => {
    const cols: ColumnDef<TRow, unknown>[] = [];
    if (enableRowSelection) {
      cols.push({
        id: SELECT_COLUMN_ID,
        header: ({ table }) => (
          <label className="flex size-6 cursor-pointer items-center justify-center rounded hover:bg-subtle focus-within:ring-2 focus-within:ring-primary/60">
            <input
              type="checkbox"
              aria-label="Seleccionar todas las filas"
              checked={table.getIsAllPageRowsSelected()}
              ref={(el) => {
                if (el) el.indeterminate = !table.getIsAllPageRowsSelected() && table.getIsSomePageRowsSelected();
              }}
              onChange={table.getToggleAllPageRowsSelectedHandler()}
              className="cursor-pointer"
            />
          </label>
        ),
        cell: ({ row }) => (
          <label className="flex size-6 cursor-pointer items-center justify-center rounded hover:bg-subtle focus-within:ring-2 focus-within:ring-primary/60">
            <input
              type="checkbox"
              aria-label="Seleccionar fila"
              checked={row.getIsSelected()}
              onChange={row.getToggleSelectedHandler()}
              className="cursor-pointer"
            />
          </label>
        ),
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
        size: 36,
      });
    }
    if (leadingColumn) {
      cols.push({
        id: LEADING_COLUMN_ID,
        header: "",
        cell: ({ row }) => leadingColumn(row.original),
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
        size: 36,
      });
    }
    for (const key of Object.keys(registry)) {
      const def = registry[key];
      cols.push({
        id: key,
        accessorFn: def.sortValue ?? (() => undefined),
        header: def.label,
        cell: ({ row }) => def.render(row.original),
        enableSorting: Boolean(def.sortValue),
        sortingFn: (rowA, rowB, columnId) => compareValues(rowA.getValue(columnId), rowB.getValue(columnId)),
        size: def.defaultSize ?? 170,
        minSize: def.minSize ?? 80,
        meta: { align: def.align ?? "left" },
      });
    }
    if (rowActions) {
      cols.push({
        id: ACTIONS_COLUMN_ID,
        header: "Acciones",
        cell: ({ row }) => rowActions(row.original),
        enableSorting: false,
        enableHiding: false,
        enableResizing: false,
        size: 140,
      });
    }
    return cols;
  }, [registry, leadingColumn, rowActions, enableRowSelection]);

  const table = useReactTable({
    data: rows,
    columns: tanstackColumns,
    state: { sorting, columnVisibility, columnOrder, columnSizing, rowSelection },
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnSizingChange: handleColumnSizingChange,
    columnResizeMode: "onEnd",
    enableMultiSort: true,
    enableColumnResizing: true,
    enableRowSelection,
    getRowId: (row) => getRowId(row),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const selectedCount = Object.keys(rowSelection).length;

  if (rows.length === 0) return <>{emptyState}</>;

  return (
    <div className="space-y-2">
      {enableRowSelection && selectedCount > 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-edge bg-surface px-3 py-1.5 text-xs text-muted">
          <span className="font-medium text-fg">{selectedCount}</span> seleccionado{selectedCount === 1 ? "" : "s"}
          <button type="button" onClick={() => setRowSelection({})} className="ml-auto text-primary hover:underline">
            Deseleccionar todo
          </button>
        </div>
      ) : null}
      <Card className="overflow-visible border-edge-strong shadow-table">
        <Table density={density} style={{ width: table.getTotalSize() }}>
          <THead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  const pinned = header.column.id === SELECT_COLUMN_ID || header.column.id === LEADING_COLUMN_ID || header.column.id === ACTIONS_COLUMN_ID;
                  const sorted = header.column.getIsSorted();
                  const sortIndex = header.column.getSortIndex();
                  const alignRight = header.column.columnDef.meta?.align === "right";
                  const headerLabel = typeof header.column.columnDef.header === "string" ? header.column.columnDef.header : header.column.id;
                  const grabbed = grabbedKey === header.column.id;
                  return (
                    <Th
                      key={header.id}
                      className="relative p-0 select-none"
                      style={{ width: header.getSize() }}
                      aria-sort={header.column.getCanSort() ? (sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none") : undefined}
                    >
                      <div
                        className={cx("flex items-center gap-1", pinned ? "px-3 py-3" : "px-2 py-0")}
                        onDragOver={(e) => {
                          if (!dragKey || pinned) return;
                          e.preventDefault();
                          if (overKey !== header.column.id) setOverKey(header.column.id);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragKey && overKey) commitReorder(dragKey, overKey);
                          setDragKey(null);
                          setOverKey(null);
                        }}
                      >
                        {!pinned ? (
                          <button
                            type="button"
                            draggable={armedKey === header.column.id}
                            onMouseDown={() => setArmedKey(header.column.id)}
                            onMouseUp={() => setArmedKey(null)}
                            onDragStart={(e) => {
                              e.dataTransfer.effectAllowed = "move";
                              setDragKey(header.column.id);
                            }}
                            onDragEnd={() => {
                              setArmedKey(null);
                              setDragKey(null);
                              setOverKey(null);
                            }}
                            onClick={() => setGrabbedKey((prev) => (prev === header.column.id ? null : header.column.id))}
                            onKeyDown={(e) => {
                              if (!grabbed) return;
                              if (e.key === "ArrowLeft") {
                                e.preventDefault();
                                moveColumn(header.column.id, -1);
                              } else if (e.key === "ArrowRight") {
                                e.preventDefault();
                                moveColumn(header.column.id, 1);
                              } else if (e.key === "Escape") {
                                e.preventDefault();
                                setGrabbedKey(null);
                              }
                            }}
                            aria-pressed={grabbed}
                            aria-label={
                              grabbed
                                ? `Moviendo columna ${headerLabel} — flecha izquierda o derecha para reordenar, Escape para terminar`
                                : `Reordenar columna ${headerLabel} — Enter para mover con el teclado o arrastra con el mouse`
                            }
                            title="Arrastra, o presiona Enter para mover con el teclado"
                            className={cx(
                              "flex size-5 shrink-0 cursor-grab items-center justify-center rounded text-faint transition-colors hover:text-muted active:cursor-grabbing",
                              "focus-visible:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                              grabbed && "bg-primary-soft text-primary ring-2 ring-primary/40",
                            )}
                          >
                            <GripVertical className="size-3.5" />
                          </button>
                        ) : null}
                        {header.isPlaceholder ? null : header.column.getCanSort() ? (
                          <button
                            type="button"
                            onClick={header.column.getToggleSortingHandler()}
                            className={cx(
                              "flex flex-1 items-center gap-1 rounded py-3 text-[11px] font-semibold tracking-wider text-muted uppercase transition-colors hover:text-fg",
                              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60",
                              alignRight ? "justify-end text-right" : "text-left",
                              sorted && "text-fg",
                            )}
                          >
                            {alignRight && sorted ? (
                              sorted === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
                            ) : null}
                            {flexRender(header.column.columnDef.header, header.getContext())}
                            {!alignRight && sorted ? (
                              sorted === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
                            ) : null}
                            {sorting.length > 1 && sorted ? <span className="text-[9px] text-faint">{sortIndex + 1}</span> : null}
                          </button>
                        ) : (
                          <span className={cx("flex-1 py-3 text-[11px] font-semibold tracking-wider text-muted uppercase", alignRight ? "text-right" : "text-left")}>
                            {flexRender(header.column.columnDef.header, header.getContext())}
                          </span>
                        )}
                      </div>
                      {header.column.getCanResize() ? (
                        <div
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`Redimensionar columna ${headerLabel}`}
                          aria-valuenow={Math.round(header.getSize())}
                          aria-valuemin={header.column.columnDef.minSize}
                          tabIndex={0}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            header.getResizeHandler()(e);
                          }}
                          onTouchStart={(e) => {
                            e.stopPropagation();
                            header.getResizeHandler()(e);
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
                            e.preventDefault();
                            resizeColumnBy(header.column.id, header.getSize(), header.column.columnDef.minSize ?? 80, e.key === "ArrowRight" ? 16 : -16);
                          }}
                          className={cx(
                            "absolute top-0 right-0 h-full w-1 cursor-col-resize touch-none select-none hover:bg-primary/40",
                            "focus-visible:bg-primary/60 focus-visible:outline-none",
                            header.column.getIsResizing() && "bg-primary/60",
                          )}
                        />
                      ) : null}
                    </Th>
                  );
                })}
              </tr>
            ))}
          </THead>
          <tbody className="divide-y divide-edge-strong">
            {table.getRowModel().rows.map((row, i) => (
              <tr
                key={row.id}
                className={cx(
                  "group transition-colors hover:bg-row-hover",
                  i % 2 === 1 && "bg-row-stripe",
                  row.getIsSelected() && "bg-primary-soft/40",
                  rowClassName?.(row.original),
                )}
              >
                {row.getVisibleCells().map((cell) => (
                  <Td key={cell.id} style={{ width: cell.column.getSize() }} className={cx(cell.column.columnDef.meta?.align === "right" && "text-right")}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </Td>
                ))}
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
