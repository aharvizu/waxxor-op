"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Badge, cx, type BadgeTone } from "@/components/ui";

export type KanbanColumn<T> = {
  key: string;
  label: string;
  tone: BadgeTone;
  items: T[];
};

/**
 * Trello-style lane backgrounds — same hue-per-tone the column's header
 * Badge already uses (status/priority/health meta, see each module's
 * *-kanban.tsx), just washed across the whole lane instead of a small pill,
 * so color keeps meaning "which state" rather than becoming decoration. Kept
 * light enough that a card (bg-surface — white in light mode) still visibly
 * lifts off the lane underneath it.
 */
const COLUMN_TONES: Record<BadgeTone, string> = {
  slate: "bg-slate-100/70 dark:bg-slate-400/10",
  blue: "bg-blue-50 dark:bg-blue-400/10",
  amber: "bg-amber-50 dark:bg-amber-400/10",
  green: "bg-emerald-50 dark:bg-emerald-400/10",
  red: "bg-red-50 dark:bg-red-400/10",
  violet: "bg-violet-50 dark:bg-violet-400/10",
  purple: "bg-purple-50 dark:bg-purple-400/10",
};

/** Shortest a lane may get before the board starts scrolling the page instead. */
const MIN_LANE_PX = 256; // 16rem, matching the min-h-[16rem] fallback below
/** Breathing room under the board so the last card is not flush with the window edge. */
const BOARD_GUTTER_PX = 24;

/**
 * Generic drag-and-drop Kanban board — one component for every module
 * (motor de vistas reutilizable, 2026-07-21). `onMove` is the caller's
 * bridge to whatever *already-validated* status/health transition action
 * the module uses (changeTicketStatus, setProjectStatus, setProjectHealth,
 * setTicketPriority…) — this component never decides what's a valid move,
 * it only asks and reverts optimistically if the answer is "no". That's
 * the "el cambio de columna solo actualiza cuando la transición es válida"
 * requirement, satisfied by reusing existing business logic instead of
 * reimplementing transition rules here.
 */
export function KanbanBoard<T extends { id: number }>({
  columns,
  renderCard,
  onMove,
  emptyLabel = "Sin elementos",
}: {
  columns: KanbanColumn<T>[];
  renderCard: (item: T) => ReactNode;
  onMove: (itemId: number, fromColumnKey: string, toColumnKey: string) => Promise<{ ok: boolean; message?: string }>;
  emptyLabel?: string;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  /** null until measured — the first paint falls back to the CSS estimate below. */
  const [laneHeight, setLaneHeight] = useState<number | null>(null);
  const [local, setLocal] = useState(columns);
  const [prevColumns, setPrevColumns] = useState(columns);
  const [dragging, setDragging] = useState<{ id: number; from: string } | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /**
   * The lanes fill from wherever the board starts down to the bottom of the
   * window. This used to be a hardcoded `calc(100vh-19rem)`, which only ever
   * fit one page: 19rem is the chrome of a Views Engine screen (view tabs +
   * FilterBar + ViewToolbar), so leaner screens like Trabajo — two rows, not
   * three — stopped ~6rem short of the bottom and left a dead strip under the
   * board (reported 2026-11-08). Measuring costs one read per layout change
   * and makes every board, present and future, end flush with the window
   * regardless of what sits above it.
   *
   * `scrollY` is added so the offset is the document's, not the viewport's,
   * and the measurement therefore survives being taken mid-scroll. The
   * observer watches `body` because the chrome above grows and shrinks on its
   * own (filter chips wrapping, the error banner appearing).
   */
  useEffect(() => {
    function measure() {
      const el = boardRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      setLaneHeight(Math.max(MIN_LANE_PX, window.innerHeight - top - BOARD_GUTTER_PX));
    }
    measure();
    window.addEventListener("resize", measure);
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => {
      window.removeEventListener("resize", measure);
      observer.disconnect();
    };
  }, []);

  // Resync when the server re-fetches (filters/search/quick changed, or
  // another tab moved something) — adjusted during render, not in an
  // effect, so it never causes a stale-frame flash or a cascading effect.
  if (columns !== prevColumns) {
    setPrevColumns(columns);
    setLocal(columns);
  }

  async function handleDrop(toKey: string) {
    setOverKey(null);
    if (!dragging || dragging.from === toKey) {
      setDragging(null);
      return;
    }
    const { id, from } = dragging;
    setDragging(null);

    // optimistic move
    const moved = local.find((c) => c.key === from)?.items.find((i) => i.id === id);
    if (!moved) return;
    setLocal((prev) =>
      prev.map((c) => {
        if (c.key === from) return { ...c, items: c.items.filter((i) => i.id !== id) };
        if (c.key === toKey) return { ...c, items: [...c.items, moved] };
        return c;
      }),
    );

    const result = await onMove(id, from, toKey);
    if (!result.ok) {
      setLocal(columns); // revert to the last known-good server state
      setError(result.message ?? "No se pudo mover — transición no válida.");
      setTimeout(() => setError(null), 4000);
    }
  }

  return (
    <div className="space-y-2">
      {error ? (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-sm text-danger">
          <AlertCircle className="size-4 shrink-0" /> {error}
        </div>
      ) : null}
      {/* Each lane is a fixed-height flex column (Trello-style): the header
          stays put and only the card list scrolls internally — a lane with
          many cards no longer grows the whole board and pushes the other
          lanes' headers out of view. min-h-0 is required here: without it a
          flex child refuses to shrink below its content size, so
          overflow-y-auto would never actually kick in. */}
      <div ref={boardRef} className="flex gap-4 overflow-x-auto pb-2">
        {local.map((col) => (
          <div
            key={col.key}
            onDragOver={(e) => {
              e.preventDefault();
              if (overKey !== col.key) setOverKey(col.key);
            }}
            onDragLeave={() => setOverKey((k) => (k === col.key ? null : k))}
            onDrop={() => handleDrop(col.key)}
            style={laneHeight === null ? undefined : { height: laneHeight }}
            className={cx(
              "flex min-h-[16rem] w-72 shrink-0 flex-col rounded-lg border border-transparent p-1 transition-colors",
              // Pre-measurement estimate only, so the server render and the
              // first paint already show a full-height board instead of
              // collapsing to min-h and jumping.
              laneHeight === null && "h-[calc(100vh-19rem)]",
              COLUMN_TONES[col.tone],
              overKey === col.key && "border-primary/50 bg-primary-soft/30",
            )}
          >
            <div className="mb-2 flex shrink-0 items-center justify-between px-1">
              <Badge tone={col.tone}>{col.label}</Badge>
              <span className="text-xs text-faint">{col.items.length}</span>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-0.5 pb-1">
              {col.items.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={(e) => {
                    // Firefox (and some Safari versions) refuse to fire a
                    // drop event unless dataTransfer carries data — Chrome
                    // is lenient here, which is why this was easy to miss.
                    e.dataTransfer.setData("text/plain", String(item.id));
                    e.dataTransfer.effectAllowed = "move";
                    setDragging({ id: item.id, from: col.key });
                  }}
                  onDragEnd={() => setDragging(null)}
                  className={cx("cursor-grab active:cursor-grabbing", dragging?.id === item.id && "opacity-50")}
                >
                  {renderCard(item)}
                </div>
              ))}
              {col.items.length === 0 ? <p className="px-1 text-xs text-faint">{emptyLabel}</p> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
