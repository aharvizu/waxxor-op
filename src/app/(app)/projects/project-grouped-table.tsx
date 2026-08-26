"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { fmtDate } from "@/lib/format";
import { formatMinutes } from "@/lib/time-entries";
import { getLabels } from "@/lib/labels";
import { useLocale } from "@/components/locale-provider";
import { t } from "@/lib/i18n";
import { Badge, Card, Progress, cx } from "@/components/ui";
import { FavoriteToggle } from "@/components/views/favorite-toggle";
import type { ProjectGroupActivity } from "@/lib/project-data";
import { EmptyProjects, type ProjectRow } from "./project-views";

/**
 * Monday-style grouped table for the Projects "Table" view: each project is
 * a collapsible group bar, its activities (activities.projectId) listed
 * underneath. Read-only — clicking a row navigates to the project/activity,
 * same interaction model as every other view in Watson (no inline editing
 * or drag-to-reorder, unlike Monday's actual grid).
 */
export function GroupedProjectsTable({
  projects,
  activities,
  basePath,
}: {
  projects: ProjectRow[];
  activities: ProjectGroupActivity[];
  basePath: string;
}) {
  const locale = useLocale();
  const { projectStatusMeta, projectHealthMeta, projectPriorityMeta, activityStatusMeta, ticketPriorityMeta } = getLabels(locale);
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const activitiesByProject = useMemo(() => {
    const map = new Map<number, ProjectGroupActivity[]>();
    for (const a of activities) {
      const list = map.get(a.projectId);
      if (list) list.push(a);
      else map.set(a.projectId, [a]);
    }
    return map;
  }, [activities]);

  if (projects.length === 0) return <EmptyProjects />;

  function toggle(id: number) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      {projects.map((p) => {
        const items = activitiesByProject.get(p.id) ?? [];
        const isOpen = !collapsed.has(p.id);
        return (
          <Card key={p.id} className="overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 border-b border-edge bg-subtle/60 px-4 py-3">
              <button
                type="button"
                onClick={() => toggle(p.id)}
                aria-expanded={isOpen}
                aria-label={isOpen ? t("Contraer", "Collapse", locale) : t("Expandir", "Expand", locale)}
                className="text-faint hover:text-fg"
              >
                <ChevronRight className={cx("size-4 transition-transform", isOpen && "rotate-90")} />
              </button>
              <FavoriteToggle module="projects" entityId={p.id} isFavorite={p.isFavorite} basePath={basePath} />
              <Link href={`/projects/${p.id}`} className="font-semibold text-fg transition-colors hover:text-primary">
                {p.name}
              </Link>
              <Badge tone={projectStatusMeta[p.status]?.tone ?? "slate"}>{projectStatusMeta[p.status]?.label ?? p.status}</Badge>
              <Badge tone={projectHealthMeta[p.healthStatus]?.tone ?? "slate"}>{projectHealthMeta[p.healthStatus]?.label ?? p.healthStatus}</Badge>
              <Badge tone={projectPriorityMeta[p.priority]?.tone ?? "slate"}>{projectPriorityMeta[p.priority]?.label ?? p.priority}</Badge>
              <span className="text-xs text-muted">{p.companyName ?? t("Interno", "Internal", locale)}</span>
              <span className="text-xs text-muted">{p.managerName ?? "—"}</span>
              <div className="flex items-center gap-2">
                <Progress value={p.percent} className="w-16" />
                <span className="text-xs text-muted tabular-nums">{p.percent}%</span>
              </div>
              <span className="w-full basis-full" aria-hidden />
              <span className="font-mono text-xs text-faint">{p.folio}</span>
              {p.targetDate ? <span className="text-xs text-muted tabular-nums">{t("Objetivo", "Target", locale)} {fmtDate(p.targetDate)}</span> : null}
              {p.loggedMinutes > 0 ? <span className="text-xs text-muted tabular-nums">{formatMinutes(p.loggedMinutes)}</span> : null}
              <span className="ml-auto text-xs text-faint tabular-nums">
                {items.length === 1
                  ? t("1 actividad", "1 activity", locale)
                  : t(`${items.length} actividades`, `${items.length} activities`, locale)}
                {p.overdue > 0 ? <span className="ml-1.5 text-danger">{t(`${p.overdue} vencida${p.overdue === 1 ? "" : "s"}`, `${p.overdue} overdue`, locale)}</span> : null}
              </span>
            </div>

            {isOpen ? (
              items.length === 0 ? (
                <p className="px-4 py-4 text-sm text-muted">{t("Sin actividades en este proyecto.", "No activities in this project.", locale)}</p>
              ) : (
                <ul className="divide-y divide-edge">
                  {items.map((a) => {
                    const isOverdue = a.dueDate && a.dueDate < today && a.status !== "completed";
                    return (
                      <li key={a.activityId} className="flex flex-wrap items-center gap-3 px-4 py-2 pl-11 text-sm">
                        <Link
                          href={`/activities/${a.activityId}`}
                          className={cx(
                            "min-w-0 flex-1 truncate font-medium hover:text-primary",
                            a.status === "completed" ? "text-muted line-through" : "text-fg",
                          )}
                        >
                          {a.parentActivityId ? "↳ " : ""}
                          {a.title}
                        </Link>
                        <Badge tone={activityStatusMeta[a.status]?.tone ?? "slate"}>{activityStatusMeta[a.status]?.label ?? a.status}</Badge>
                        <Badge tone={ticketPriorityMeta[a.priority]?.tone ?? "slate"}>{ticketPriorityMeta[a.priority]?.label ?? a.priority}</Badge>
                        <span className="w-28 shrink-0 truncate text-xs text-faint">{a.assigneeName ?? t("Sin responsable", "Unassigned", locale)}</span>
                        <span className={cx("w-20 shrink-0 text-xs tabular-nums", isOverdue ? "text-danger" : "text-faint")}>
                          {a.dueDate ? fmtDate(a.dueDate) : "—"}
                        </span>
                        <span className="w-16 shrink-0 text-right text-xs tabular-nums text-faint">
                          {a.minutes > 0 ? formatMinutes(a.minutes) : "—"}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )
            ) : null}
          </Card>
        );
      })}
    </div>
  );
}
