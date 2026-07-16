/**
 * Pure business-time math for SLA calculations. No dependencies: timezone
 * conversion uses Intl.DateTimeFormat.
 *
 * MVP simplifications (documented in docs/features/sla.md):
 * - Advancing time adds wall-clock minutes as UTC milliseconds, so a DST jump
 *   inside the advanced span can shift results by the DST offset. Mexico (the
 *   default timezone) has no DST since 2022, so calculations are exact there.
 * - Holidays are not evaluated yet (the calendar stores them for the future).
 */

export type WorkCalendar = {
  timezone: string;
  /** ISO weekday numbers, 1 = Monday … 7 = Sunday. */
  workDays: number[];
  /** Minutes from midnight in `timezone`. */
  startMinute: number;
  endMinute: number;
};

const WEEKDAYS: Record<string, number> = {
  Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7,
};

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function formatter(tz: string): Intl.DateTimeFormat {
  let fmt = fmtCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    fmtCache.set(tz, fmt);
  }
  return fmt;
}

/** Weekday (1–7) and minute-of-day of a UTC instant, seen from `tz`. */
export function zonedParts(date: Date, tz: string): { weekday: number; minuteOfDay: number } {
  const parts = formatter(tz).formatToParts(date);
  let weekday = 0;
  let hour = 0;
  let minute = 0;
  for (const p of parts) {
    if (p.type === "weekday") weekday = WEEKDAYS[p.value] ?? 0;
    if (p.type === "hour") hour = Number(p.value);
    if (p.type === "minute") minute = Number(p.value);
  }
  return { weekday, minuteOfDay: hour * 60 + minute };
}

const MAX_ITERATIONS = 40000; // > 100 years of day-jumps; guards infinite loops

function assertUsable(cal: WorkCalendar) {
  if (cal.workDays.length === 0 || cal.endMinute <= cal.startMinute) {
    throw new Error("Work calendar has no working time");
  }
}

/**
 * The instant `minutes` of working time after `start`.
 * With cal = null the SLA is 24/7: plain wall-clock addition.
 */
export function addWorkingMinutes(
  start: Date,
  minutes: number,
  cal: WorkCalendar | null,
): Date {
  if (!cal) return new Date(start.getTime() + minutes * 60_000);
  assertUsable(cal);

  let current = new Date(start);
  let remaining = minutes;
  for (let i = 0; i < MAX_ITERATIONS && remaining > 0; i++) {
    const { weekday, minuteOfDay } = zonedParts(current, cal.timezone);
    const working = cal.workDays.includes(weekday);
    if (working && minuteOfDay >= cal.startMinute && minuteOfDay < cal.endMinute) {
      const available = cal.endMinute - minuteOfDay;
      const consume = Math.min(available, remaining);
      current = new Date(current.getTime() + consume * 60_000);
      remaining -= consume;
    } else {
      const jump =
        working && minuteOfDay < cal.startMinute
          ? cal.startMinute - minuteOfDay
          : 1440 - minuteOfDay; // to local midnight, then re-evaluate
      current = new Date(current.getTime() + jump * 60_000);
    }
  }
  return current;
}

/**
 * Working minutes elapsed between two instants (0 when b <= a).
 * With cal = null: plain wall-clock difference.
 */
export function workingMinutesBetween(
  a: Date,
  b: Date,
  cal: WorkCalendar | null,
): number {
  if (b.getTime() <= a.getTime()) return 0;
  if (!cal) return Math.round((b.getTime() - a.getTime()) / 60_000);
  assertUsable(cal);

  let total = 0;
  let current = new Date(a);
  for (let i = 0; i < MAX_ITERATIONS && current.getTime() < b.getTime(); i++) {
    const { weekday, minuteOfDay } = zonedParts(current, cal.timezone);
    const working = cal.workDays.includes(weekday);
    if (working && minuteOfDay >= cal.startMinute && minuteOfDay < cal.endMinute) {
      const windowEnd = new Date(
        current.getTime() + (cal.endMinute - minuteOfDay) * 60_000,
      );
      const chunkEnd = windowEnd.getTime() < b.getTime() ? windowEnd : b;
      total += (chunkEnd.getTime() - current.getTime()) / 60_000;
      current = new Date(chunkEnd);
    } else {
      const jump =
        working && minuteOfDay < cal.startMinute
          ? cal.startMinute - minuteOfDay
          : 1440 - minuteOfDay;
      current = new Date(current.getTime() + jump * 60_000);
    }
  }
  return Math.round(total);
}

/**
 * Signed remaining working minutes from `now` until `target`
 * (negative when the target is already in the past).
 */
export function remainingWorkingMinutes(
  now: Date,
  target: Date,
  cal: WorkCalendar | null,
): number {
  if (target.getTime() >= now.getTime()) {
    return workingMinutesBetween(now, target, cal);
  }
  return -workingMinutesBetween(target, now, cal);
}
