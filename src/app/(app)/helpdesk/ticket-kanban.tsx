"use client";

import Link from "next/link";
import { KanbanBoard, type KanbanColumn } from "@/components/views/kanban-board";
import { Badge } from "@/components/ui";
import { ticketPriorityMeta } from "@/lib/labels";
import type { StyledMeta } from "@/lib/catalog-styles";
import { changeTicketStatus, setTicketPriority } from "./actions";
import type { TicketRow } from "./ticket-views";

/**
 * Tickets' bridge from the generic KanbanBoard to its already-validated
 * transition logic: moving a card between "Estado" columns calls
 * changeTicketStatus (canTransition() inside — see src/lib/tickets.ts),
 * between "Prioridad" columns calls setTicketPriority (no transition rule,
 * priority is freely settable). No new business logic here.
 */
export function TicketKanban({
  rows,
  groupField,
  statusStyles,
  priorityStyles,
}: {
  rows: TicketRow[];
  groupField: "status" | "priority";
  statusStyles: Record<string, StyledMeta>;
  priorityStyles: Record<string, StyledMeta>;
}) {
  const styles = groupField === "priority" ? priorityStyles : statusStyles;
  const values = Object.keys(styles).sort((a, b) => styles[a].sortOrder - styles[b].sortOrder);

  const columns: KanbanColumn<TicketRow>[] = values.map((value) => ({
    key: value,
    label: styles[value].label,
    tone: styles[value].tone,
    items: rows.filter((r) => r[groupField] === value),
  }));

  async function onMove(itemId: number, _from: string, toKey: string) {
    const fd = new FormData();
    fd.set("id", String(itemId));
    if (groupField === "priority") {
      fd.set("priority", toKey);
      const result = await setTicketPriority(null, fd);
      return { ok: result?.ok ?? false, message: result && !result.ok ? result.message : undefined };
    }
    fd.set("status", toKey);
    const result = await changeTicketStatus(null, fd);
    return { ok: result?.ok ?? false, message: result && !result.ok ? result.message : undefined };
  }

  return (
    <KanbanBoard
      columns={columns}
      onMove={onMove}
      emptyLabel="Sin tickets"
      renderCard={(r) => (
        <Link
          href={`/helpdesk/${r.id}`}
          className="block rounded-lg border border-edge bg-surface p-3 text-sm shadow-card transition-colors hover:border-edge-strong"
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-faint">{r.folio}</span>
            {groupField !== "priority" ? (
              <Badge tone={ticketPriorityMeta[r.priority]?.tone ?? "slate"}>{ticketPriorityMeta[r.priority]?.label ?? r.priority}</Badge>
            ) : null}
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
