"use client";

import { useMemo } from "react";
import Link from "next/link";
import { fmtDate } from "@/lib/format";
import { projectHealthMeta, projectPriorityMeta, projectStatusMeta } from "@/lib/labels";
import { formatMinutes } from "@/lib/time-entries";
import { Badge, Card, EmptyState, Progress, cx } from "@/components/ui";
import { FolderKanban, Plus } from "lucide-react";
import { FavoriteToggle } from "@/components/views/favorite-toggle";
import { DataTable, type DataTableColumn, type DataTableColumnConfig } from "@/components/views/data-table";
import { ProjectKanban } from "./project-kanban";

export type ProjectRow = {
  id: number;
  folio: string;
  name: string;
  status: string;
  healthStatus: string;
  priority: string;
  companyId: number | null;
  companyName: string | null;
  managerId: number | null;
  managerName: string | null;
  targetDate: string | null;
  percent: number;
  pending: number;
  overdue: number;
  nextMilestone: string | null;
  loggedMinutes: number;
  isFavorite: boolean;
};

export type ColumnDef = { key: string; label: string; render: (r: ProjectRow) => React.ReactNode };

export const COLUMN_REGISTRY: Record<string, ColumnDef> = {
  folio: { key: "folio", label: "Folio", render: (r) => <span className="font-mono text-xs text-faint">{r.folio}</span> },
  name: {
    key: "name",
    label: "Proyecto",
    render: (r) => (
      <Link href={`/projects/${r.id}`} className="font-medium text-fg transition-colors hover:text-primary">
        {r.name}
      </Link>
    ),
  },
  companyName: { key: "companyName", label: "Empresa", render: (r) => <span className="text-muted">{r.companyName ?? "Interno"}</span> },
  managerName: { key: "managerName", label: "PM", render: (r) => <span className="text-muted">{r.managerName ?? "—"}</span> },
  status: {
    key: "status",
    label: "Estado",
    render: (r) => <Badge tone={projectStatusMeta[r.status]?.tone ?? "slate"}>{projectStatusMeta[r.status]?.label ?? r.status}</Badge>,
  },
  healthStatus: {
    key: "healthStatus",
    label: "Salud",
    render: (r) => <Badge tone={projectHealthMeta[r.healthStatus]?.tone ?? "slate"}>{projectHealthMeta[r.healthStatus]?.label ?? r.healthStatus}</Badge>,
  },
  priority: {
    key: "priority",
    label: "Prioridad",
    render: (r) => <Badge tone={projectPriorityMeta[r.priority]?.tone ?? "slate"}>{projectPriorityMeta[r.priority]?.label ?? r.priority}</Badge>,
  },
  percent: {
    key: "percent",
    label: "Avance",
    render: (r) => (
      <div className="flex items-center gap-2">
        <Progress value={r.percent} className="w-16" />
        <span className="text-xs text-muted tabular-nums">{r.percent}%</span>
      </div>
    ),
  },
  pendingOverdue: {
    key: "pendingOverdue",
    label: "Pend. / Venc.",
    render: (r) => (
      <span className="tabular-nums">
        <span className="text-muted">{r.pending}</span>
        {r.overdue > 0 ? <span className="ml-1 text-danger">/ {r.overdue}</span> : null}
      </span>
    ),
  },
  nextMilestone: { key: "nextMilestone", label: "Próximo hito", render: (r) => <span className="max-w-40 truncate text-xs text-muted">{r.nextMilestone ?? "—"}</span> },
  targetDate: { key: "targetDate", label: "Objetivo", render: (r) => <span className="text-muted">{r.targetDate ? fmtDate(r.targetDate) : "—"}</span> },
  loggedMinutes: { key: "loggedMinutes", label: "Tiempo", render: (r) => <span className="tabular-nums text-muted">{formatMinutes(r.loggedMinutes)}</span> },
};

export const DEFAULT_COLUMNS = [
  "folio",
  "name",
  "companyName",
  "managerName",
  "status",
  "healthStatus",
  "priority",
  "percent",
  "pendingOverdue",
  "nextMilestone",
  "targetDate",
  "loggedMinutes",
];
export const PROJECT_COLUMN_OPTIONS = DEFAULT_COLUMNS.map((key) => ({ key, label: COLUMN_REGISTRY[key]?.label ?? key }));
export const PROJECT_KANBAN_GROUP_OPTIONS = [
  { key: "status", label: "Estado" },
  { key: "healthStatus", label: "Salud" },
];

function EmptyProjects() {
  return (
    <EmptyState
      icon={<FolderKanban />}
      title="Sin proyectos"
      action={
        <Link href="/projects/new" className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white">
          <Plus className="size-4" /> Nuevo proyecto
        </Link>
      }
    >
      Nada coincide con esta vista o filtros.
    </EmptyState>
  );
}

/* ------------------------------------------------------------------ table */

/** TanStack Table (see components/views/data-table.tsx) — Projects never had click-to-sort before this; enabling it (incl. multi-column) is this migration's job, not a business-rule change. */
export function TableView({
  rows,
  columnConfig,
  onColumnConfigChange,
  basePath,
  density,
}: {
  rows: ProjectRow[];
  columnConfig: DataTableColumnConfig[];
  onColumnConfigChange: (updater: (prev: DataTableColumnConfig[]) => DataTableColumnConfig[]) => void;
  basePath: string;
  density: "compact" | "comfortable" | "spacious";
}) {
  const dataTableRegistry = useMemo(() => {
    const out: Record<string, DataTableColumn<ProjectRow>> = {};
    for (const key of Object.keys(COLUMN_REGISTRY)) {
      out[key] = {
        label: COLUMN_REGISTRY[key].label,
        render: COLUMN_REGISTRY[key].render,
        sortValue: key === "pendingOverdue" ? (r) => r.pending : (r) => r[key as keyof ProjectRow],
        align: key === "pendingOverdue" || key === "loggedMinutes" ? "right" : undefined,
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
      emptyState={<EmptyProjects />}
      leadingColumn={(r) => <FavoriteToggle module="projects" entityId={r.id} isFavorite={r.isFavorite} basePath={basePath} />}
    />
  );
}

/* ------------------------------------------------------------------- list */

export function ListView({ rows, basePath }: { rows: ProjectRow[]; basePath: string }) {
  if (rows.length === 0) return <EmptyProjects />;
  return (
    <Card className="overflow-hidden">
      <ul className="divide-y divide-edge">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <FavoriteToggle module="projects" entityId={r.id} isFavorite={r.isFavorite} basePath={basePath} />
            <Badge tone={projectStatusMeta[r.status]?.tone ?? "slate"}>{projectStatusMeta[r.status]?.label ?? r.status}</Badge>
            <Link href={`/projects/${r.id}`} className="min-w-0 flex-1 truncate font-medium text-fg hover:text-primary">
              {r.folio} · {r.name}
            </Link>
            <span className={cx("shrink-0 text-xs text-muted")}>{r.companyName ?? "Interno"}</span>
            <Badge tone={projectHealthMeta[r.healthStatus]?.tone ?? "slate"}>{projectHealthMeta[r.healthStatus]?.label ?? r.healthStatus}</Badge>
            <span className="w-28 shrink-0 truncate text-xs text-muted">{r.managerName ?? "—"}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ---------------------------------------------------------------- kanban */

export function KanbanView({ rows, groupField }: { rows: ProjectRow[]; groupField: "status" | "healthStatus" }) {
  if (rows.length === 0) return <EmptyProjects />;
  return <ProjectKanban rows={rows} groupField={groupField} />;
}
