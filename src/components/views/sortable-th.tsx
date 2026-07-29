"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { Th, cx } from "@/components/ui";

export type SortState = { key: string; direction: "asc" | "desc" } | null;

/** Click a column header: unsorted → asc → desc → unsorted. Client-side only — see company-views.tsx/contact-views.tsx doc comment for why. */
export function nextSortState(current: SortState, key: string): SortState {
  if (!current || current.key !== key) return { key, direction: "asc" };
  if (current.direction === "asc") return { key, direction: "desc" };
  return null;
}

/** Generic comparator: nulls/undefined last, Dates and numbers compared numerically, everything else as locale-aware text. */
export function compareValues(a: unknown, b: unknown): number {
  if (a === null || a === undefined) return b === null || b === undefined ? 0 : 1;
  if (b === null || b === undefined) return -1;
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), "es", { numeric: true, sensitivity: "base" });
}

/** Th with a click-to-sort affordance — same visual language across every sortable table. */
export function SortableTh({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey: string;
  sort: SortState;
  onSort: (key: string) => void;
}) {
  const active = sort?.key === sortKey;
  return (
    <Th className="p-0">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cx(
          "flex w-full items-center gap-1 px-5 py-3 text-left text-[11px] font-semibold tracking-wider text-muted uppercase transition-colors hover:text-fg",
          active && "text-fg",
        )}
      >
        {label}
        {active ? (
          sort!.direction === "asc" ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />
        ) : null}
      </button>
    </Th>
  );
}
