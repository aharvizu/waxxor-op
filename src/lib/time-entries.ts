import { z } from "zod";
import { timeEntries } from "@/db/schema";

/** Domain constants and pure rules for Time Entries — see docs/features/time-entries.md. */

export const TIME_TYPES = timeEntries.timeType.enumValues;
export const BILLING_STATUSES = timeEntries.billingStatus.enumValues;
export const TIME_MODALITIES = timeEntries.modality.enumValues;

export const timeTypeSchema = z.enum(TIME_TYPES);
export const billingStatusSchema = z.enum(BILLING_STATUSES);
export const timeModalitySchema = z.enum(TIME_MODALITIES);

export const durationMinutesSchema = z.coerce
  .number("Duration is required.")
  .int("Duration must be whole minutes.")
  .min(1, "Duration must be at least 1 minute.");

/** Postgres numeric columns travel as strings; rates are "123.45" or null. */
export const optionalMoneySchema = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : String(v)),
  z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/, "Enter a valid amount (e.g. 750 or 750.50).")
    .nullable(),
);

/**
 * amount = durationMinutes / 60 × rate, rounded to cents.
 * Returns null when there is no rate. Same formula for internal cost.
 */
export function calculateAmount(
  durationMinutes: number,
  rate: string | null,
): string | null {
  if (rate === null) return null;
  return ((durationMinutes / 60) * Number(rate)).toFixed(2);
}

/** "95" → "1h 35m"; "45" → "45m". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** Per-technician rollup of non-voided entries. */
export function summarizeByUser(
  entries: { userId: number; userName: string | null; durationMinutes: number; voidedAt: Date | null }[],
): { userId: number; userName: string; minutes: number }[] {
  const map = new Map<number, { userId: number; userName: string; minutes: number }>();
  for (const e of entries) {
    if (e.voidedAt) continue;
    const row = map.get(e.userId) ?? {
      userId: e.userId,
      userName: e.userName ?? "Unknown",
      minutes: 0,
    };
    row.minutes += e.durationMinutes;
    map.set(e.userId, row);
  }
  return [...map.values()].sort((a, b) => b.minutes - a.minutes);
}
