"use client";

import Link from "next/link";
import { KanbanBoard, type KanbanColumn } from "@/components/views/kanban-board";
import { Badge } from "@/components/ui";
import { projectHealthMeta, projectStatusMeta } from "@/lib/labels";
import { PROJECT_HEALTHS, PROJECT_STATUSES } from "@/lib/projects";
import { setProjectHealth, setProjectStatus } from "./actions";
import type { ProjectRow } from "./project-views";

/**
 * Projects' bridge from the generic KanbanBoard to its already-validated
 * transition logic: "Estado" columns call setProjectStatus (Zod-restricted
 * to PROJECT_WORKFLOW_STATUSES + assertOperational — see src/lib/projects.ts
 * and (app)/projects/actions.ts), "Salud" columns call setProjectHealth (no
 * status restriction on the target value, still assertOperational-gated).
 * Every status is shown as a column (including completed/archived) so
 * existing projects are never hidden from the board — dragging into/out of
 * a terminal status simply fails validation and reverts, same as Tickets.
 */
export function ProjectKanban({ rows, groupField }: { rows: ProjectRow[]; groupField: "status" | "healthStatus" }) {
  const values = groupField === "healthStatus" ? PROJECT_HEALTHS : PROJECT_STATUSES;
  const meta = groupField === "healthStatus" ? projectHealthMeta : projectStatusMeta;

  const columns: KanbanColumn<ProjectRow>[] = values.map((value) => ({
    key: value,
    label: meta[value]?.label ?? value,
    tone: meta[value]?.tone ?? "slate",
    items: rows.filter((r) => r[groupField] === value),
  }));

  async function onMove(itemId: number, _from: string, toKey: string) {
    const fd = new FormData();
    fd.set("id", String(itemId));
    if (groupField === "healthStatus") {
      fd.set("healthStatus", toKey);
      const result = await setProjectHealth(null, fd);
      return { ok: result?.ok ?? false, message: result && !result.ok ? result.message : undefined };
    }
    fd.set("status", toKey);
    const result = await setProjectStatus(null, fd);
    return { ok: result?.ok ?? false, message: result && !result.ok ? result.message : undefined };
  }

  return (
    <KanbanBoard
      columns={columns}
      onMove={onMove}
      emptyLabel="Sin proyectos"
      renderCard={(r) => (
        <Link
          href={`/projects/${r.id}`}
          className="block rounded-lg border border-edge bg-surface p-3 text-sm shadow-card transition-colors hover:border-edge-strong"
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-faint">{r.folio}</span>
            {groupField !== "status" ? (
              <Badge tone={projectStatusMeta[r.status]?.tone ?? "slate"}>{projectStatusMeta[r.status]?.label ?? r.status}</Badge>
            ) : null}
          </div>
          <p className="mb-2 line-clamp-2 font-medium text-fg">{r.name}</p>
          <div className="flex items-center justify-between text-xs text-muted">
            <span className="truncate">{r.companyName ?? "Interno"}</span>
            <span className="shrink-0">{r.managerName ?? "Sin PM"}</span>
          </div>
        </Link>
      )}
    />
  );
}
