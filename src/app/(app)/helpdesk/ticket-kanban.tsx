"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, CalendarDays } from "lucide-react";
import { KanbanBoard, type KanbanColumn } from "@/components/views/kanban-board";
import { cx, type BadgeTone } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { changeTicketStatus, setTicketPriority } from "./actions";
import { CatalogChip, toCatalogMap, type TicketPriorityOption, type TicketRow, type TicketStatusOption } from "./ticket-views";
import { ACTIVE_TICKET_STATUSES } from "@/lib/today-rules";

/** Reference RGB for each Badge tone — used only to pick the closest tone for
 * a Kanban column header, since KanbanBoard (shared across modules) renders
 * headers with the fixed-tone Badge, not arbitrary hex. Ticket cards below
 * render the real org color via CatalogChip. */
const TONE_RGB: Record<BadgeTone, [number, number, number]> = {
  slate: [0x64, 0x74, 0x8b],
  blue: [0x3b, 0x82, 0xf6],
  amber: [0xf5, 0x9e, 0x0b],
  green: [0x10, 0xb9, 0x81],
  red: [0xef, 0x44, 0x44],
  violet: [0x8b, 0x5c, 0xf6],
  purple: [0xa8, 0x55, 0xf7],
};

function hexToRgb(hex: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

function toneFromHex(hex: string | null): BadgeTone {
  const rgb = hex ? hexToRgb(hex) : null;
  if (!rgb) return "slate";
  let best: BadgeTone = "slate";
  let bestDist = Infinity;
  for (const tone of Object.keys(TONE_RGB) as BadgeTone[]) {
    const [r, g, b] = TONE_RGB[tone];
    const dist = (r - rgb[0]) ** 2 + (g - rgb[1]) ** 2 + (b - rgb[2]) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = tone;
    }
  }
  return best;
}

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
  statuses,
  priorities,
}: {
  rows: TicketRow[];
  groupField: "status" | "priority";
  statuses: TicketStatusOption[];
  priorities: TicketPriorityOption[];
}) {
  const router = useRouter();
  const now = new Date();
  const catalog = groupField === "priority" ? priorities : statuses;
  const priorityMap = toCatalogMap(priorities);

  const columns: KanbanColumn<TicketRow>[] = catalog.map((c) => ({
    key: String(c.id),
    label: c.name,
    tone: toneFromHex(c.color),
    items: rows.filter((r) => (groupField === "priority" ? r.priorityId : r.statusId) === c.id),
  }));

  async function onMove(itemId: number, _from: string, toKey: string) {
    const fd = new FormData();
    fd.set("id", String(itemId));
    if (groupField === "priority") {
      fd.set("priorityId", toKey);
      const result = await setTicketPriority(null, fd);
      return { ok: result?.ok ?? false, message: result && !result.ok ? result.message : undefined };
    }
    fd.set("statusId", toKey);
    const result = await changeTicketStatus(null, fd);
    return { ok: result?.ok ?? false, message: result && !result.ok ? result.message : undefined };
  }

  return (
    <KanbanBoard
      columns={columns}
      onMove={onMove}
      emptyLabel="Sin tickets"
      renderCard={(r) => (
        <div
          role="link"
          tabIndex={0}
          onClick={() => router.push(`/helpdesk/${r.id}`)}
          onKeyDown={(e) => {
            if (e.key === "Enter") router.push(`/helpdesk/${r.id}`);
          }}
          className="cursor-pointer rounded-lg border border-edge bg-surface p-3 text-sm shadow-card transition-colors hover:border-edge-strong"
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="font-mono text-[11px] text-faint">{r.folio}</span>
            {groupField !== "priority" ? <CatalogChip entry={priorityMap.get(r.priorityId)} fallback={r.priority} /> : null}
          </div>
          <p className="mb-2 line-clamp-2 font-medium text-fg">{r.title}</p>
          {r.resolutionTargetAt ? (
            <div
              className={cx(
                "mb-2 flex items-center gap-1 text-xs",
                r.resolutionTargetAt.getTime() < now.getTime() &&
                  (ACTIVE_TICKET_STATUSES as readonly string[]).includes(r.status)
                  ? "font-medium text-danger"
                  : "text-muted",
              )}
            >
              <CalendarClock className="size-3.5 shrink-0" />
              {fmtDate(r.resolutionTargetAt)}
            </div>
          ) : null}
          {r.dueDate ? (
            <div
              className={cx(
                "mb-2 flex items-center gap-1 text-xs",
                r.dueDate < now.toISOString().slice(0, 10) &&
                  (ACTIVE_TICKET_STATUSES as readonly string[]).includes(r.status)
                  ? "font-medium text-amber-600 dark:text-amber-400"
                  : "text-amber-600/80 dark:text-amber-400/80",
              )}
            >
              <CalendarDays className="size-3.5 shrink-0" />
              Agendado · {fmtDate(r.dueDate)}
            </div>
          ) : null}
          <div className="flex items-center justify-between text-xs text-muted">
            {r.companyName && r.companyId ? (
              <Link
                href={`/companies/${r.companyId}`}
                onClick={(e) => e.stopPropagation()}
                className="truncate hover:text-primary hover:underline"
              >
                {r.companyName}
              </Link>
            ) : (
              <span className="truncate">—</span>
            )}
            <span className="shrink-0">{r.assigneeName ?? "Sin asignar"}</span>
          </div>
        </div>
      )}
    />
  );
}
