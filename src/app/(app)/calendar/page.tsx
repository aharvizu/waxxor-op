import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { addDays, addMonths, monthGridDays, weekDays, MONTH_LABELS_ES, WEEKDAY_LABELS_ES } from "@/lib/calendar";
import { getCalendarItems } from "@/lib/calendar-data";
import { ORG_TIMEZONE } from "@/lib/reports";
import { todayInTz } from "@/lib/recurrence";
import { requireUser } from "@/lib/session";
import { PageHeader, buttonSecondaryClass, cx } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import { CalendarGrid } from "./calendar-grid";

export const metadata: Metadata = { title: "Calendario" };

type Search = { view?: string; date?: string; userId?: string; kind?: string };

export default async function CalendarPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const params = await searchParams;

  const viewType = params.view === "week" ? "week" : "month";
  const today = todayInTz(new Date(), ORG_TIMEZONE);
  const anchor = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  const [anchorYear, anchorMonth] = anchor.split("-").map(Number);

  // No explicit ?userId= yet → default to "just me", same spirit as Today's
  // "mine" default for technicians — anyone can still switch to another
  // person or "Todos" via the filter below, nothing is role-gated.
  const userId = params.userId === undefined ? Number(user.id) : params.userId === "" ? null : Number(params.userId);
  const kind = params.kind === "ticket" || params.kind === "activity" ? params.kind : null;

  const days = viewType === "month" ? monthGridDays(anchorYear, anchorMonth) : weekDays(anchor);
  const from = days[0];
  const to = days[days.length - 1];

  const [items, orgUsers] = await Promise.all([
    getCalendarItems(user.organizationId, from, to, userId, kind),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.organizationId, user.organizationId), ne(users.role, "client")))
      .orderBy(asc(users.name)),
  ]);

  const byDate = new Map<string, typeof items>();
  for (const item of items) {
    const list = byDate.get(item.date) ?? [];
    list.push(item);
    byDate.set(item.date, list);
  }

  const buildHref = (patch: Record<string, string | undefined>) => {
    const next = { view: viewType, date: anchor, userId: params.userId, kind: params.kind, ...patch };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v !== undefined) qs.set(k, v);
    const s = qs.toString();
    return s ? `/calendar?${s}` : "/calendar";
  };

  const periodLabel =
    viewType === "month"
      ? `${MONTH_LABELS_ES[anchorMonth - 1]} ${anchorYear}`
      : `${days[0]} – ${days[6]}`;

  const prevDate = viewType === "month" ? `${addMonths(anchorYear, anchorMonth, -1).year}-${String(addMonths(anchorYear, anchorMonth, -1).month).padStart(2, "0")}-01` : addDays(anchor, -7);
  const nextDate = viewType === "month" ? `${addMonths(anchorYear, anchorMonth, 1).year}-${String(addMonths(anchorYear, anchorMonth, 1).month).padStart(2, "0")}-01` : addDays(anchor, 7);

  return (
    <div>
      <PageHeader
        title="Calendario"
        subtitle="Tickets por fecha objetivo de SLA (azul) y fecha agendada (ámbar), actividades por fecha de vencimiento — solo trabajo abierto."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={buildHref({ date: prevDate })} className={buttonSecondaryClass} aria-label="Anterior">
            ←
          </Link>
          <Link href={buildHref({ date: today })} className={buttonSecondaryClass}>
            Hoy
          </Link>
          <Link href={buildHref({ date: nextDate })} className={buttonSecondaryClass} aria-label="Siguiente">
            →
          </Link>
          <span className="ml-2 text-sm font-semibold text-fg capitalize">{periodLabel}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg border border-edge p-0.5">
            {(["month", "week"] as const).map((v) => (
              <Link
                key={v}
                href={buildHref({ view: v })}
                className={cx(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  viewType === v ? "bg-primary-soft text-primary" : "text-muted hover:bg-subtle hover:text-fg",
                )}
              >
                {v === "month" ? "Mes" : "Semana"}
              </Link>
            ))}
          </div>
          <form method="get" className="flex items-center gap-2">
            <input type="hidden" name="view" value={viewType} />
            <input type="hidden" name="date" value={anchor} />
            <SearchableSelect
              name="kind"
              defaultValue={kind ?? ""}
              className="w-auto"
              options={[
                { value: "", label: "Tickets y actividades" },
                { value: "ticket", label: "Solo tickets" },
                { value: "activity", label: "Solo actividades" },
              ]}
            />
            <SearchableSelect
              name="userId"
              defaultValue={userId !== null ? String(userId) : ""}
              className="w-auto"
              options={[
                { value: "", label: "Todos" },
                ...orgUsers.map((u) => ({ value: String(u.id), label: u.id === Number(user.id) ? `${u.name} (yo)` : u.name })),
              ]}
            />
            <button type="submit" className={buttonSecondaryClass}>
              Aplicar
            </button>
          </form>
        </div>
      </div>

      <CalendarGrid
        days={days}
        today={today}
        currentMonth={viewType === "month" ? anchorMonth : null}
        byDate={byDate}
        weekdayLabels={WEEKDAY_LABELS_ES}
        viewType={viewType}
      />
    </div>
  );
}
