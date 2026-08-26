"use client";

import { useMemo } from "react";
import Link from "next/link";
import { fmtDate } from "@/lib/format";
import { getLabels } from "@/lib/labels";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n";
import { useLocale } from "@/components/locale-provider";
import { Badge, Card, EmptyState, cx } from "@/components/ui";
import { ClipboardCheck, Plus } from "lucide-react";
import { DataTable, type DataTableColumn, type DataTableColumnConfig } from "@/components/views/data-table";
import { ActivityKanban } from "./activity-kanban";

export type ActivityRow = {
  id: number;
  folio: string;
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

/** Locale-aware — column header labels are static UI chrome (unrelated to the
 * es/en meta toggle), only each column's `render` depends on locale-resolved
 * status/type/priority labels. */
export function buildColumnRegistry(locale: Locale): Record<string, ColumnDef> {
  const { activityStatusMeta, activityTypeMeta, ticketPriorityMeta } = getLabels(locale);
  return {
    folio: {
      key: "folio",
      label: "Folio",
      render: (r) => <span className="font-mono text-xs text-faint">{r.folio}</span>,
    },
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
}

export const DEFAULT_COLUMNS = ["folio", "title", "activityType", "companyName", "assigneeName", "priority", "status", "dueDate"];
const STATIC_COLUMN_REGISTRY = buildColumnRegistry(DEFAULT_LOCALE);
export const ACTIVITY_COLUMN_OPTIONS = DEFAULT_COLUMNS.map((key) => ({ key, label: STATIC_COLUMN_REGISTRY[key]?.label ?? key }));
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
  const locale = useLocale();
  const dataTableRegistry = useMemo(() => {
    const registry = buildColumnRegistry(locale);
    const out: Record<string, DataTableColumn<ActivityRow>> = {};
    for (const key of Object.keys(registry)) {
      out[key] = {
        label: registry[key].label,
        render: registry[key].render,
        sortValue: (r) => r[key as keyof ActivityRow],
      };
    }
    return out;
  }, [locale]);

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
  const { activityStatusMeta, ticketPriorityMeta } = getLabels(useLocale());
  if (rows.length === 0) return <EmptyActivities />;
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-edge">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <Badge tone={activityStatusMeta[r.status]?.tone ?? "slate"}>{activityStatusMeta[r.status]?.label ?? r.status}</Badge>
            <Link href={`/activities/${r.id}`} className="min-w-0 flex-1 truncate font-medium text-fg hover:text-primary">
              {r.folio} · {r.title}
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
