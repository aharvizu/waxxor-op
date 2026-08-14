import Link from "next/link";
import { ClipboardCheck, LifeBuoy } from "lucide-react";
import type { CalendarItem } from "@/lib/calendar-data";
import { Card, cx } from "@/components/ui";

const VISIBLE_PER_DAY = { month: 3, week: 20 } as const;

function ItemChip({ item, viewType }: { item: CalendarItem; viewType: "month" | "week" }) {
  const href = item.kind === "ticket" ? `/helpdesk/${item.id}` : `/activities/${item.id}`;
  const Icon = item.kind === "ticket" ? LifeBuoy : ClipboardCheck;
  return (
    <Link
      href={href}
      title={`${item.folio ? `${item.folio} · ` : ""}${item.title}${item.assigneeName ? ` · ${item.assigneeName}` : ""}`}
      className={cx(
        "flex items-center gap-1.5 truncate rounded-md font-medium transition-colors",
        viewType === "week" ? "px-2 py-1 text-xs" : "px-1.5 py-0.5 text-[11px]",
        item.kind === "ticket"
          ? "bg-blue-50 text-blue-700 hover:bg-blue-100 dark:bg-blue-400/10 dark:text-blue-300"
          : "bg-violet-50 text-violet-700 hover:bg-violet-100 dark:bg-violet-400/10 dark:text-violet-300",
      )}
    >
      <Icon className={cx("shrink-0", viewType === "week" ? "size-3.5" : "size-3")} />
      <span className="truncate">
        {item.folio ? `${item.folio} ` : ""}
        {item.title}
        {viewType === "week" && item.assigneeName ? <span className="ml-1 opacity-70">· {item.assigneeName}</span> : null}
      </span>
    </Link>
  );
}

export function CalendarGrid({
  days,
  today,
  currentMonth,
  byDate,
  weekdayLabels,
  viewType,
}: {
  days: string[];
  today: string;
  /** null in week view (nothing to dim); the 1-12 month number in month view — days outside it render dimmed. */
  currentMonth: number | null;
  byDate: Map<string, CalendarItem[]>;
  weekdayLabels: readonly string[];
  viewType: "month" | "week";
}) {
  const visibleLimit = VISIBLE_PER_DAY[viewType];
  return (
    <Card className="overflow-hidden">
      <div className="grid grid-cols-7 border-b border-edge bg-table-head">
        {weekdayLabels.map((label) => (
          <div key={label} className="px-2 py-2 text-center text-[11px] font-semibold tracking-wider text-muted uppercase">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day) => {
          const items = byDate.get(day) ?? [];
          const dayNum = Number(day.slice(8, 10));
          const isCurrentMonth = currentMonth === null || Number(day.slice(5, 7)) === currentMonth;
          const isToday = day === today;
          const visible = items.slice(0, visibleLimit);
          const overflow = items.length - visible.length;
          return (
            <div
              key={day}
              className={cx(
                "flex flex-col gap-1 border-b border-r border-edge p-1.5 last:border-r-0",
                viewType === "week" ? "min-h-[32rem]" : "min-h-28",
                !isCurrentMonth && "bg-subtle/40",
              )}
            >
              <span
                className={cx(
                  "self-start rounded-full px-1.5 text-xs tabular-nums",
                  isToday ? "bg-primary font-semibold text-white" : isCurrentMonth ? "text-fg" : "text-faint",
                )}
              >
                {dayNum}
              </span>
              <div className="flex flex-1 flex-col gap-0.5 overflow-hidden">
                {visible.map((item) => (
                  <ItemChip key={`${item.kind}-${item.id}`} item={item} viewType={viewType} />
                ))}
                {overflow > 0 ? <span className="px-1.5 text-[11px] text-faint">+{overflow} más</span> : null}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
