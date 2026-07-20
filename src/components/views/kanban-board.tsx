"use client";

import { useState, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import { Badge, cx, type BadgeTone } from "@/components/ui";

export type KanbanColumn<T> = {
  key: string;
  label: string;
  tone: BadgeTone;
  items: T[];
};

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
  const [local, setLocal] = useState(columns);
  const [prevColumns, setPrevColumns] = useState(columns);
  const [dragging, setDragging] = useState<{ id: number; from: string } | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      <div className="flex gap-4 overflow-x-auto pb-2">
        {local.map((col) => (
          <div
            key={col.key}
            onDragOver={(e) => {
              e.preventDefault();
              if (overKey !== col.key) setOverKey(col.key);
            }}
            onDragLeave={() => setOverKey((k) => (k === col.key ? null : k))}
            onDrop={() => handleDrop(col.key)}
            className={cx(
              "w-72 shrink-0 rounded-lg border border-transparent p-1 transition-colors",
              overKey === col.key && "border-primary/50 bg-primary-soft/30",
            )}
          >
            <div className="mb-2 flex items-center justify-between px-1">
              <Badge tone={col.tone}>{col.label}</Badge>
              <span className="text-xs text-faint">{col.items.length}</span>
            </div>
            <div className="space-y-2">
              {col.items.map((item) => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => setDragging({ id: item.id, from: col.key })}
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
