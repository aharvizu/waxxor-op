"use client";

import Link from "next/link";
import { getLabels } from "@/lib/labels";
import { useLocale } from "@/components/locale-provider";
import { Badge, Card, EmptyState, cx } from "@/components/ui";
import { FolderKanban, Plus } from "lucide-react";
import { FavoriteToggle } from "@/components/views/favorite-toggle";
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

export const PROJECT_KANBAN_GROUP_OPTIONS = [
  { key: "status", label: "Estado" },
  { key: "healthStatus", label: "Salud" },
];

export function EmptyProjects() {
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

/* ------------------------------------------------------------------- list */

export function ListView({ rows, basePath }: { rows: ProjectRow[]; basePath: string }) {
  const { projectStatusMeta, projectHealthMeta } = getLabels(useLocale());
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
