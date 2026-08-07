"use client";

import { useMemo } from "react";
import Link from "next/link";
import { fmtDate } from "@/lib/format";
import { activityStatusMeta, activityTypeMeta, ticketPriorityMeta } from "@/lib/labels";
import { Badge, Card, EmptyState, cx } from "@/components/ui";
import { ClipboardCheck, Plus } from "lucide-react";
import { DataTable, type DataTableColumn, type DataTableColumnConfig } from "@/components/views/data-table";
import { ActivityKanban } from "./activity-kanban";

export type ActivityRow = {
  id: number;
  title: string;
  status: string;
  priority: string;
  activityType: string;
  dueDate: string | null;
  companyId: number | null;
  companyName: string | null;
  assigneeId: number | null;
  assigneeName: string | null;
};

export type ColumnDef = { key: string; label: string; render: (r: ActivityRow) => React.ReactNode };

export const COLUMN_REGISTRY: Record<string, ColumnDef> = {
  title: {
    key: "title",
    label: "Actividad",
    render: (r) => (
      <Link href={`/activities/${r.id}`} className="font-medium text-fg transition-colors hover:text-primary">
        {r.title}
      </Link>
    ),
  },
  activityType: { key: "activityType", label: "Tipo", render: (r) => <span className="text-muted">{activityTypeMeta[r.activityType]?.label ?? r.activityType}</span> },
  companyName: { key: "companyName", label: "Cliente", render: (r) => <span className="text-muted">{r.companyName ?? "—"}</span> },
  assigneeName: { key: "assigneeName", label: "Responsable", render: (r) => <span className="text-muted">{r.assigneeName ?? "Sin asignar"}</span> },
  priority: {
    key: "priority",
    label: "Prioridad",
    render: (r) => <Badge tone={ticketPriorityMeta[r.priority]?.tone ?? "slate"}>{ticketPriorityMeta[r.priority]?.label ?? r.priority}</Badge>,
  },
  status: {
    key: "status",
    label: "Estado",
    render: (r) => <Badge tone={activityStatusMeta[r.status]?.tone ?? "slate"}>{activityStatusMeta[r.status]?.label ?? r.status}</Badge>,
  },
  dueDate: {
    key: "dueDate",
    label: "Vence",
    render: (r) => {
      const overdue = r.dueDate && r.dueDate < new Date().toISOString().slice(0, 10) && r.status !== "completed" && r.status !== "cancelled";
      return <span className={cx("tabular-nums", overdue ? "font-medium text-danger" : "text-muted")}>{r.dueDate ? fmtDate(r.dueDate) : "—"}</span>;
    },
  },
};

export const DEFAULT_COLUMNS = ["title", "activityType", "companyName", "assigneeName", "priority", "status", "dueDate"];
export const ACTIVITY_COLUMN_OPTIONS = DEFAULT_COLUMNS.map((key) => ({ key, label: COLUMN_REGISTRY[key]?.label ?? key }));
export const ACTIVITY_KANBAN_GROUP_OPTIONS = [{ key: "status", label: "Estado" }];

function EmptyActivities() {
  return (
    <EmptyState
      icon={<ClipboardCheck />}
      title="Sin actividades"
      action={
        <Link href="/activities/new" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white">
          <Plus className="size-4" /> Nueva actividad
        </Link>
      }
    >
      Nada coincide con esta vista o filtros.
    </EmptyState>
  );
}

/* ------------------------------------------------------------------ table */

/** TanStack Table (see components/views/data-table.tsx) — sorting stays client-side/unpersisted, same as before (see company-views.tsx's doc comment for why). */
export function TableView({
  rows,
  columnConfig,
  onColumnConfigChange,
  density,
}: {
  rows: ActivityRow[];
  columnConfig: DataTableColumnConfig[];
  onColumnConfigChange: (updater: (prev: DataTableColumnConfig[]) => DataTableColumnConfig[]) => void;
  density: "compact" | "comfortable" | "spacious";
}) {
  const dataTableRegistry = useMemo(() => {
    const out: Record<string, DataTableColumn<ActivityRow>> = {};
    for (const key of Object.keys(COLUMN_REGISTRY)) {
      out[key] = {
        label: COLUMN_REGISTRY[key].label,
        render: COLUMN_REGISTRY[key].render,
        sortValue: (r) => r[key as keyof ActivityRow],
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
      emptyState={<EmptyActivities />}
    />
  );
}

/* ------------------------------------------------------------------- list */

export function ListView({ rows }: { rows: ActivityRow[] }) {
  if (rows.length === 0) return <EmptyActivities />;
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-edge">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <Badge tone={activityStatusMeta[r.status]?.tone ?? "slate"}>{activityStatusMeta[r.status]?.label ?? r.status}</Badge>
            <Link href={`/activities/${r.id}`} className="min-w-0 flex-1 truncate font-medium text-fg hover:text-primary">
              {r.title}
            </Link>
            <span className="shrink-0 text-xs text-muted">{r.companyName ?? "—"}</span>
            <Badge tone={ticketPriorityMeta[r.priority]?.tone ?? "slate"}>{ticketPriorityMeta[r.priority]?.label ?? r.priority}</Badge>
            <span className="w-28 shrink-0 truncate text-xs text-muted">{r.assigneeName ?? "Sin asignar"}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------------------------------------------------------------- kanban */

export function KanbanView({ rows }: { rows: ActivityRow[] }) {
  if (rows.length === 0) return <EmptyActivities />;
  return <ActivityKanban rows={rows} />;
}
