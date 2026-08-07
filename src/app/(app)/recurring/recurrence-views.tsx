"use client";

import { useMemo } from "react";
import Link from "next/link";
import { fmtDate, fmtDateTime } from "@/lib/format";
import {
  recurrenceExecutionStatusMeta,
  recurrenceFrequencyMeta,
  recurrenceStatusMeta,
  recurrenceTargetTypeMeta,
} from "@/lib/labels";
import { describeSchedule, successRate, toSchedule } from "@/lib/recurrence-data";
import { Badge, Card, EmptyState, cx } from "@/components/ui";
import { Repeat } from "lucide-react";
import { FavoriteToggle } from "@/components/views/favorite-toggle";
import { DataTable, type DataTableColumn, type DataTableColumnConfig } from "@/components/views/data-table";
import { RowAction } from "./recurring-forms";
import { RecurrenceKanban } from "./recurrence-kanban";
import type { recurrenceDefinitions } from "@/db/schema";

export type RecurrenceRow = {
  def: typeof recurrenceDefinitions.$inferSelect;
  companyName: string | null;
  projectName: string | null;
  assigneeName: string | null;
  lastResultStatus: string | null;
  isFavorite: boolean;
};

export type ColumnDef = { key: string; label: string; render: (r: RecurrenceRow) => React.ReactNode };

export const COLUMN_REGISTRY: Record<string, ColumnDef> = {
  name: {
    key: "name",
    label: "Nombre",
    render: (r) => (
      <>
        <Link href={`/recurring/${r.def.id}`} className="font-medium text-fg transition-colors group-hover:text-primary">
          {r.def.name}
        </Link>
        <span className="block text-xs text-muted">{describeSchedule(toSchedule(r.def))}</span>
      </>
    ),
  },
  targetType: {
    key: "targetType",
    label: "Tipo",
    render: (r) => <Badge tone={recurrenceTargetTypeMeta[r.def.targetType]?.tone ?? "slate"}>{recurrenceTargetTypeMeta[r.def.targetType]?.label ?? r.def.targetType}</Badge>,
  },
  companyName: { key: "companyName", label: "Empresa", render: (r) => <span className="text-muted">{r.companyName ?? "—"}</span> },
  projectName: { key: "projectName", label: "Proyecto", render: (r) => <span className="text-muted">{r.projectName ?? "—"}</span> },
  assigneeName: { key: "assigneeName", label: "Responsable", render: (r) => <span className="text-muted">{r.assigneeName ?? "—"}</span> },
  frequency: { key: "frequency", label: "Frecuencia", render: (r) => <span className="text-muted">{recurrenceFrequencyMeta[r.def.frequency]?.label ?? r.def.frequency}</span> },
  nextRunAt: { key: "nextRunAt", label: "Próxima ejecución", render: (r) => <span className="text-muted">{r.def.nextRunAt ? fmtDateTime(r.def.nextRunAt) : "—"}</span> },
  lastRunAt: { key: "lastRunAt", label: "Última", render: (r) => <span className="text-muted">{r.def.lastRunAt ? fmtDate(r.def.lastRunAt) : "—"}</span> },
  lastResultStatus: {
    key: "lastResultStatus",
    label: "Resultado",
    render: (r) =>
      r.lastResultStatus ? (
        <Badge tone={recurrenceExecutionStatusMeta[r.lastResultStatus]?.tone ?? "slate"}>
          {recurrenceExecutionStatusMeta[r.lastResultStatus]?.label ?? r.lastResultStatus}
        </Badge>
      ) : (
        "—"
      ),
  },
  status: {
    key: "status",
    label: "Estado",
    render: (r) => <Badge tone={recurrenceStatusMeta[r.def.status]?.tone ?? "slate"}>{recurrenceStatusMeta[r.def.status]?.label ?? r.def.status}</Badge>,
  },
  occurrences: {
    key: "occurrences",
    label: "Ejecuciones",
    render: (r) => {
      const rate = successRate(r.def);
      return (
        <span className="tabular-nums text-muted">
          {r.def.occurrenceCount}
          {rate !== null ? ` (${rate}%)` : ""}
        </span>
      );
    },
  },
  failedCount: {
    key: "failedCount",
    label: "Errores",
    render: (r) => <span className={cx("tabular-nums", r.def.failedCount > 0 ? "text-danger" : "text-muted")}>{r.def.failedCount}</span>,
  },
};

export const DEFAULT_COLUMNS = [
  "name",
  "targetType",
  "companyName",
  "projectName",
  "assigneeName",
  "frequency",
  "nextRunAt",
  "lastRunAt",
  "lastResultStatus",
  "status",
  "occurrences",
  "failedCount",
];
export const RECURRING_COLUMN_OPTIONS = DEFAULT_COLUMNS.map((key) => ({ key, label: COLUMN_REGISTRY[key].label }));

/** Most columns read `r.def.*`; a few (companyName/projectName/assigneeName/lastResultStatus) are flat, already-joined fields on RecurrenceRow itself. */
function recurrenceSortValue(r: RecurrenceRow, key: string): unknown {
  if (key === "occurrences") return r.def.occurrenceCount;
  if (key === "companyName" || key === "projectName" || key === "assigneeName" || key === "lastResultStatus") return r[key];
  return r.def[key as keyof typeof r.def];
}

function RowActions({ r }: { r: RecurrenceRow }) {
  return (
    <div className="flex items-center gap-1">
      {r.def.status === "active" ? (
        <>
          <RowAction action="runRecurrenceNow" fields={{ id: r.def.id }} label="Ejecutar" />
          <RowAction action="pauseRecurrence" fields={{ id: r.def.id }} label="Pausar" />
        </>
      ) : null}
      {r.def.status === "paused" || r.def.status === "error" ? (
        <RowAction action="reactivateRecurrence" fields={{ id: r.def.id }} label="Reactivar" />
      ) : null}
      {!r.def.archivedAt && r.def.status !== "archived" ? (
        <RowAction action="archiveRecurrence" fields={{ id: r.def.id }} label="Archivar" confirm={`¿Archivar "${r.def.name}"?`} />
      ) : null}
    </div>
  );
}

function EmptyRecurring() {
  return (
    <EmptyState icon={<Repeat />} title="Sin recurrencias">
      Nada coincide con esta vista o filtros.
    </EmptyState>
  );
}

/* ------------------------------------------------------------------ table */

/** TanStack Table (see components/views/data-table.tsx) — Recurring never had a column picker before this (fixed columns, `columnOptions={[]}` in recurring-view-content.tsx); enabling visibility/order/sizing is this migration's job, not a business-rule change. Rows key off `def.id` (no top-level `id`), hence the explicit `getRowId`. */
export function TableView({
  rows,
  columnConfig,
  onColumnConfigChange,
  basePath,
  density,
}: {
  rows: RecurrenceRow[];
  columnConfig: DataTableColumnConfig[];
  onColumnConfigChange: (updater: (prev: DataTableColumnConfig[]) => DataTableColumnConfig[]) => void;
  basePath: string;
  density: "compact" | "comfortable" | "spacious";
}) {
  const dataTableRegistry = useMemo(() => {
    const out: Record<string, DataTableColumn<RecurrenceRow>> = {};
    for (const key of Object.keys(COLUMN_REGISTRY)) {
      out[key] = {
        label: COLUMN_REGISTRY[key].label,
        render: COLUMN_REGISTRY[key].render,
        sortValue: (r) => recurrenceSortValue(r, key),
        align: key === "occurrences" || key === "failedCount" ? "right" : undefined,
      };
    }
    return out;
  }, []);

  return (
    <DataTable
      rows={rows}
      registry={dataTableRegistry}
      defaultColumnKeys={DEFAULT_COLUMNS}
      columnConfig={columnConfig}
      onColumnConfigChange={onColumnConfigChange}
      density={density}
      enableRowSelection
      getRowId={(r) => String(r.def.id)}
      emptyState={<EmptyRecurring />}
      leadingColumn={(r) => <FavoriteToggle module="recurring" entityId={r.def.id} isFavorite={r.isFavorite} basePath={basePath} />}
      rowActions={(r) => <RowActions r={r} />}
    />
  );
}

/* ------------------------------------------------------------------- list */

export function ListView({ rows, basePath }: { rows: RecurrenceRow[]; basePath: string }) {
  if (rows.length === 0) return <EmptyRecurring />;
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-edge">
        {rows.map((r) => (
          <li key={r.def.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <FavoriteToggle module="recurring" entityId={r.def.id} isFavorite={r.isFavorite} basePath={basePath} />
            <Badge tone={recurrenceStatusMeta[r.def.status]?.tone ?? "slate"}>{recurrenceStatusMeta[r.def.status]?.label ?? r.def.status}</Badge>
            <Link href={`/recurring/${r.def.id}`} className="min-w-0 flex-1 truncate font-medium text-fg hover:text-primary">
              {r.def.name}
            </Link>
            <span className="shrink-0 text-xs text-muted">{r.companyName ?? "—"}</span>
            <Badge tone={recurrenceTargetTypeMeta[r.def.targetType]?.tone ?? "slate"}>{recurrenceTargetTypeMeta[r.def.targetType]?.label ?? r.def.targetType}</Badge>
            <span className="w-28 shrink-0 truncate text-xs text-muted">{r.assigneeName ?? "—"}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------------------------------------------------------------- kanban */

export function KanbanView({ rows }: { rows: RecurrenceRow[] }) {
  if (rows.length === 0) return <EmptyRecurring />;
  return <RecurrenceKanban rows={rows} />;
}
