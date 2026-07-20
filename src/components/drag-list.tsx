"use client";

import { useState, type ReactNode } from "react";
import { GripVertical } from "lucide-react";
import { cx } from "@/components/ui";

/**
 * Minimal reorderable list using the native HTML5 Drag and Drop API — no new
 * dependency. Used by Views (Part 1), Formularios (Part 5) and the Custom
 * Fields admin list (Part 4) wherever "reordenar mediante drag & drop" is
 * required. Purely client-side reordering + an onReorder callback; callers
 * own persistence (server action) and optimistic state.
 */
export function DragList<T extends { id: number | string }>({
  items,
  onReorder,
  renderItem,
  className,
}: {
  items: T[];
  onReorder: (orderedIds: (number | string)[]) => void;
  renderItem: (item: T, index: number) => ReactNode;
  className?: string;
}) {
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  function handleDrop() {
    if (dragIndex === null || overIndex === null || dragIndex === overIndex) {
      setDragIndex(null);
      setOverIndex(null);
      return;
    }
    const next = [...items];
    const [moved] = next.splice(dragIndex, 1);
    next.splice(overIndex, 0, moved);
    setDragIndex(null);
    setOverIndex(null);
    onReorder(next.map((i) => i.id));
  }

  return (
    <ul className={cx("space-y-1", className)}>
      {items.map((item, index) => (
        <li
          key={item.id}
          draggable
          onDragStart={() => setDragIndex(index)}
          onDragOver={(e) => {
            e.preventDefault();
            if (overIndex !== index) setOverIndex(index);
          }}
          onDrop={handleDrop}
          onDragEnd={() => {
            setDragIndex(null);
            setOverIndex(null);
          }}
          className={cx(
            "flex items-center gap-2 rounded-lg border border-transparent transition-colors",
            dragIndex === index && "opacity-50",
            overIndex === index && dragIndex !== index && "border-primary/50 bg-primary-soft/40",
          )}
        >
          <span className="cursor-grab pl-1 text-faint active:cursor-grabbing" aria-hidden>
            <GripVertical className="size-4" />
          </span>
          <div className="min-w-0 flex-1">{renderItem(item, index)}</div>
        </li>
      ))}
    </ul>
  );
}
