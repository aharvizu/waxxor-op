"use client";

import Link from "next/link";
import { KanbanBoard, type KanbanColumn } from "@/components/views/kanban-board";
import { Badge } from "@/components/ui";
import { activityStatusMeta, ticketPriorityMeta } from "@/lib/labels";
import { ACTIVITY_STATUSES } from "@/lib/activities";
import { updateActivityWorkflow } from "./actions";
import type { ActivityRow } from "./activity-views";

/**
 * Activities' bridge from the generic KanbanBoard to its already-validated
 * transition logic: reuses updateActivityWorkflow (the same setter the
 * detail page uses), always sending the row's current assigneeId along with
 * the new status so a drag never silently unassigns the activity. "archived"
 * is shown as a column (existing archived activities aren't hidden from the
 * board) but is rejected by updateActivityWorkflow's own validation — same
 * pattern as Tickets/Projects: no new transition rules invented here.
 */
export function ActivityKanban({ rows }: { rows: ActivityRow[] }) {
  const columns: KanbanColumn<ActivityRow>[] = ACTIVITY_STATUSES.map((value) => ({
    key: value,
    label: activityStatusMeta[value]?.label ?? value,
    tone: activityStatusMeta[value]?.tone ?? "slate",
    items: rows.filter((r) => r.status === value),
  }));

  async function onMove(itemId: number, _from: string, toKey: string) {
    const row = rows.find((r) => r.id === itemId);
    const fd = new FormData();
    fd.set("id", String(itemId));
    fd.set("status", toKey);
    if (row?.assigneeId) fd.set("assigneeId", String(row.assigneeId));
    const result = await updateActivityWorkflow(null, fd);
    return { ok: result?.ok ?? false, message: result && !result.ok ? result.message : undefined };
  }

  return (
    <KanbanBoard
      columns={columns}
      onMove={onMove}
      emptyLabel="Sin actividades"
      renderCard={(r) => (
        <Link
          href={`/activities/${r.id}`}
          className="block rounded-lg border border-edge bg-surface p-3 text-sm shadow-card transition-colors hover:border-edge-strong"
        >
          <div className="mb-1.5 flex items-center justify-end gap-2">
            <Badge tone={ticketPriorityMeta[r.priority]?.tone ?? "slate"}>{ticketPriorityMeta[r.priority]?.label ?? r.priority}</Badge>
          </div>
          <p className="mb-2 line-clamp-2 font-medium text-fg">{r.title}</p>
          <div className="flex items-center justify-between text-xs text-muted">
            <span className="truncate">{r.companyName ?? "—"}</span>
            <span className="shrink-0">{r.assigneeName ?? "Sin asignar"}</span>
          </div>
        </Link>
      )}
    />
  );
}
