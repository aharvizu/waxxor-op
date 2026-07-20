"use client";

import Link from "next/link";
import { KanbanBoard, type KanbanColumn } from "@/components/views/kanban-board";
import { Badge } from "@/components/ui";
import { recurrenceStatusMeta, recurrenceTargetTypeMeta } from "@/lib/labels";
import { RECURRENCE_STATUSES } from "@/lib/recurrence";
import type { ActionState } from "@/lib/action-result";
import { activateRecurrence, archiveRecurrence, finishRecurrence, pauseRecurrence, reactivateRecurrence } from "./actions";
import type { RecurrenceRow } from "./recurrence-views";

type MoveAction = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Recurring's bridge from the generic KanbanBoard to its already-validated
 * lifecycle actions. Unlike Tickets/Projects, Recurring has no single
 * "setStatus" setter — activate/pause/reactivate/finish/archive are
 * distinct, precondition-gated actions (see (app)/recurring/actions.ts).
 * This only dispatches to whichever of those *already exists* for a given
 * (from, to) pair; any pairing without a matching action is rejected
 * client-side with no server call — no new transition is invented.
 */
function pickAction(from: string, to: string): MoveAction | null {
  if (to === "active" && (from === "draft" || from === "paused")) return activateRecurrence;
  if (to === "active" && from === "error") return reactivateRecurrence;
  if (to === "paused" && from === "active") return pauseRecurrence;
  if (to === "completed" && from !== "completed" && from !== "expired" && from !== "archived") return finishRecurrence;
  if (to === "archived" && from !== "archived") return archiveRecurrence;
  return null;
}

export function RecurrenceKanban({ rows }: { rows: RecurrenceRow[] }) {
  const columns: KanbanColumn<RecurrenceRow & { id: number }>[] = RECURRENCE_STATUSES.map((value) => ({
    key: value,
    label: recurrenceStatusMeta[value]?.label ?? value,
    tone: recurrenceStatusMeta[value]?.tone ?? "slate",
    items: rows.filter((r) => r.def.status === value).map((r) => ({ ...r, id: r.def.id })),
  }));

  async function onMove(itemId: number, from: string, toKey: string) {
    const action = pickAction(from, toKey);
    if (!action) {
      return { ok: false, message: "Esa transición no está disponible desde el tablero — usa las acciones de la fila." };
    }
    const fd = new FormData();
    fd.set("id", String(itemId));
    const result = await action(null, fd);
    return { ok: result?.ok ?? false, message: result && !result.ok ? result.message : undefined };
  }

  return (
    <KanbanBoard
      columns={columns}
      onMove={onMove}
      emptyLabel="Sin recurrencias"
      renderCard={(r) => (
        <Link
          href={`/recurring/${r.def.id}`}
          className="block rounded-lg border border-edge bg-surface p-3 text-sm shadow-card transition-colors hover:border-edge-strong"
        >
          <div className="mb-1.5 flex items-center justify-end gap-2">
            <Badge tone={recurrenceTargetTypeMeta[r.def.targetType]?.tone ?? "slate"}>
              {recurrenceTargetTypeMeta[r.def.targetType]?.label ?? r.def.targetType}
            </Badge>
          </div>
          <p className="mb-2 line-clamp-2 font-medium text-fg">{r.def.name}</p>
          <div className="flex items-center justify-between text-xs text-muted">
            <span className="truncate">{r.companyName ?? "—"}</span>
            <span className="shrink-0">{r.assigneeName ?? "—"}</span>
          </div>
        </Link>
      )}
    />
  );
}
