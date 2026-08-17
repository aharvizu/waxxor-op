import type { LocalDate } from "@/lib/recurrence";

/**
 * Pure date-grid math for /calendar — month/week views. ISO weeks (Monday
 * start), same weekday convention resolvePeriod() already uses for
 * current_week/previous_week (src/lib/reports.ts) — not a second one.
 */

function iso(y: number, m0: number, d: number): LocalDate {
  return new Date(Date.UTC(y, m0, d)).toISOString().slice(0, 10);
}

function parts(d: LocalDate): { y: number; m: number; day: number } {
  const [y, m, day] = d.split("-").map(Number);
  return { y, m, day };
}

/** 0 = Monday … 6 = Sunday. */
function isoWeekday(y: number, m0: number, d: number): number {
  return (new Date(Date.UTC(y, m0, d)).getUTCDay() + 6) % 7;
}

/** Full weeks (35 or 42 cells) covering the given month, including lead/trail days from neighboring months. */
export function monthGridDays(year: number, month: number): LocalDate[] {
  const firstWeekday = isoWeekday(year, month - 1, 1);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const totalCells = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  const gridStartDay = 1 - firstWeekday;
  return Array.from({ length: totalCells }, (_, i) => iso(year, month - 1, gridStartDay + i));
}

/** The 7 days (Mon–Sun) of the ISO week containing `anchor`. */
export function weekDays(anchor: LocalDate): LocalDate[] {
  const { y, m, day } = parts(anchor);
  const weekday = isoWeekday(y, m - 1, day);
  return Array.from({ length: 7 }, (_, i) => iso(y, m - 1, day - weekday + i));
}

export function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (((total % 12) + 12) % 12) + 1 };
}

export function addDays(date: LocalDate, delta: number): LocalDate {
  const { y, m, day } = parts(date);
  return iso(y, m - 1, day + delta);
}

/** Whole days from `a` to `b` (negative if `b` is before `a`) — used to place a date on a pixel timeline. */
export function daysBetween(a: LocalDate, b: LocalDate): number {
  const pa = parts(a);
  const pb = parts(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.day) - Date.UTC(pa.y, pa.m - 1, pa.day)) / 86_400_000);
}

export const MONTH_LABELS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
] as const;

export const WEEKDAY_LABELS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"] as const;
