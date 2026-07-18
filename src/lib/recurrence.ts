import { z } from "zod";
import {
  recurrenceDefinitions,
  recurrenceExecutions,
} from "@/db/schema";

/**
 * Pure, deterministic recurrence math and template rendering — no
 * dependencies, unit-tested. Occurrence dates are computed as wall-clock
 * dates in the definition's IANA timezone and converted per-date to UTC
 * instants, so DST shifts never duplicate or drop occurrences (the
 * occurrence key is the local date). See docs/features/recurrence-scheduling.md.
 */

export const RECURRENCE_TARGET_TYPES = recurrenceDefinitions.targetType.enumValues;
export const RECURRENCE_STATUSES = recurrenceDefinitions.status.enumValues;
export const RECURRENCE_FREQUENCIES = recurrenceDefinitions.frequency.enumValues;
export const RECURRENCE_EXECUTION_STATUSES = recurrenceExecutions.status.enumValues;
export const RECURRENCE_EXECUTION_SOURCES = recurrenceExecutions.executionSource.enumValues;

/** All four targets are enabled since 2026-07-18: the Reportes feature made
 * report generation real (a recurrence creates the Report in draft with its
 * period resolved; content generation and review stay human-driven — never
 * auto-approved, never auto-sent). See docs/features/reports.md §Recurrentes. */
export const ENABLED_TARGET_TYPES = ["activity", "ticket", "project_activity", "report"] as const;

export const RECURRENCE_MAX_CONSECUTIVE_FAILURES = 3;
export const RECURRENCE_BATCH_LIMIT = 50;
export const RECURRENCE_MAX_BACKFILL = 31;

/* ----------------------------------------------------------- local dates */

export type LocalDate = string; // YYYY-MM-DD

function toParts(d: LocalDate): { y: number; m: number; d: number } {
  const [y, m, day] = d.split("-").map(Number);
  return { y, m, d: day };
}

function fromUTC(ms: number): LocalDate {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Pure calendar-date arithmetic (uses the UTC calendar as a neutral substrate). */
export function addDays(date: LocalDate, days: number): LocalDate {
  const { y, m, d } = toParts(date);
  return fromUTC(Date.UTC(y, m - 1, d + days));
}

export function addMonthsClamped(date: LocalDate, months: number, dayOfMonth: number): LocalDate {
  const { y, m } = toParts(date);
  const targetMonth = m - 1 + months;
  const lastDay = new Date(Date.UTC(y, targetMonth + 1, 0)).getUTCDate();
  const day = dayOfMonth === -1 ? lastDay : Math.min(dayOfMonth, lastDay);
  return fromUTC(Date.UTC(y, targetMonth, day));
}

/** ISO weekday 1 (Mon) … 7 (Sun) of a local calendar date. */
export function isoWeekday(date: LocalDate): number {
  const { y, m, d } = toParts(date);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return wd === 0 ? 7 : wd;
}

function daysBetween(a: LocalDate, b: LocalDate): number {
  const pa = toParts(a);
  const pb = toParts(b);
  return Math.round(
    (Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86_400_000,
  );
}

/** Nth weekday of a month: week 1–4 or -1 = last. Returns a LocalDate. */
export function nthWeekdayOfMonth(
  year: number,
  month: number, // 1–12
  weekday: number, // ISO 1–7
  nth: number, // 1–4 or -1
): LocalDate {
  if (nth === -1) {
    const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let d = lastDay; d >= lastDay - 6; d--) {
      const date = fromUTC(Date.UTC(year, month - 1, d));
      if (isoWeekday(date) === weekday) return date;
    }
  }
  const firstOfMonth = fromUTC(Date.UTC(year, month - 1, 1));
  const firstWd = isoWeekday(firstOfMonth);
  const offset = (weekday - firstWd + 7) % 7;
  return fromUTC(Date.UTC(year, month - 1, 1 + offset + (nth - 1) * 7));
}

/* --------------------------------------------------- timezone conversion */

const tzFmtCache = new Map<string, Intl.DateTimeFormat>();
function tzFormatter(tz: string): Intl.DateTimeFormat {
  let fmt = tzFmtCache.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    tzFmtCache.set(tz, fmt);
  }
  return fmt;
}

export function isValidTimezone(tz: string): boolean {
  try {
    tzFormatter(tz).format(0);
    return true;
  } catch {
    return false;
  }
}

/** Wall-clock parts of a UTC instant, seen from `tz`. */
function wallClock(ms: number, tz: string): { date: LocalDate; minute: number } {
  const parts = tzFormatter(tz).formatToParts(ms);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minute: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

/**
 * UTC instant for a wall-clock date+time in `tz`. Two-pass correction handles
 * DST offsets; nonexistent local times (spring-forward gap) resolve to the
 * instant right after the jump — never duplicated, never lost.
 */
export function zonedTimeToUtc(date: LocalDate, timeOfDay: string, tz: string): Date {
  const { y, m, d } = toParts(date);
  const [hh, mm] = timeOfDay.split(":").map(Number);
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 2; i++) {
    const wall = wallClock(guess, tz);
    const deltaDays = daysBetween(wall.date, date);
    const deltaMinutes = deltaDays * 1440 + (hh * 60 + mm - wall.minute);
    if (deltaMinutes === 0) break;
    guess += deltaMinutes * 60_000;
  }
  return new Date(guess);
}

/** Local calendar date of `now` as seen from `tz`. */
export function todayInTz(now: Date, tz: string): LocalDate {
  return wallClock(now.getTime(), tz).date;
}

/* -------------------------------------------------------------- schedule */

export type ScheduleFields = {
  frequency: (typeof RECURRENCE_FREQUENCIES)[number];
  interval: number; // every N periods, >= 1
  daysOfWeek: number[] | null; // ISO 1–7
  dayOfMonth: number | null; // 1–31 | -1 (last)
  monthOfYear: number | null; // 1–12 (annual)
  weekOfMonth: number | null; // 1–4 | -1 (last) — with daysOfWeek[0]
  timeOfDay: string; // HH:MM
  timezone: string;
  startAt: LocalDate;
  endAt: LocalDate | null;
};

const MONTH_STEP: Partial<Record<string, number>> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  annual: 12,
};

/**
 * First occurrence LOCAL date strictly after `afterLocal` (or equal when
 * `inclusive`). Deterministic; bounded iteration. Returns null past endAt.
 */
export function nextOccurrenceLocal(
  s: ScheduleFields,
  afterLocal: LocalDate,
  inclusive = false,
): LocalDate | null {
  const startCursor = inclusive ? afterLocal : addDays(afterLocal, 1);
  const from = startCursor < s.startAt ? s.startAt : startCursor;
  const monthStep = MONTH_STEP[s.frequency];

  let candidate: LocalDate | null = null;

  if (s.frequency === "daily") {
    const offset = daysBetween(s.startAt, from);
    const step = Math.max(1, s.interval);
    const k = Math.max(0, Math.ceil(offset / step));
    candidate = addDays(s.startAt, k * step);
  } else if (s.frequency === "weekdays") {
    let cursor = from;
    for (let i = 0; i < 8; i++) {
      if (isoWeekday(cursor) <= 5) {
        candidate = cursor;
        break;
      }
      cursor = addDays(cursor, 1);
    }
  } else if (s.frequency === "weekly" || s.frequency === "custom") {
    const days = (s.daysOfWeek ?? [isoWeekday(s.startAt)]).slice().sort((a, b) => a - b);
    const step = Math.max(1, s.interval);
    // anchor weeks on the Monday of startAt's week
    const anchorMonday = addDays(s.startAt, 1 - isoWeekday(s.startAt));
    let cursor = from;
    for (let i = 0; i < 7 * step + 14; i++) {
      const weekIndex = Math.floor(daysBetween(anchorMonday, cursor) / 7);
      if (weekIndex >= 0 && weekIndex % step === 0 && days.includes(isoWeekday(cursor))) {
        candidate = cursor;
        break;
      }
      cursor = addDays(cursor, 1);
    }
  } else if (monthStep) {
    const step = monthStep * Math.max(1, s.interval);
    const start = toParts(s.startAt);
    // month index relative to startAt's month
    const cur = toParts(from);
    const monthsSince = (cur.y - start.y) * 12 + (cur.m - start.m);
    let k = Math.max(0, Math.floor(monthsSince / step));
    for (let i = 0; i < 40; i++, k++) {
      const months = k * step;
      if (s.frequency === "annual" && s.monthOfYear) {
        // align to the requested month of year
        const targetYear = start.y + Math.floor((start.m - 1 + months) / 12);
        const date = occurrenceInMonth(s, targetYear, s.monthOfYear);
        if (date && date >= from && date >= s.startAt) {
          candidate = date;
          break;
        }
        continue;
      }
      const targetMonthIndex = start.m - 1 + months;
      const targetYear = start.y + Math.floor(targetMonthIndex / 12);
      const targetMonth = (targetMonthIndex % 12) + 1;
      const date = occurrenceInMonth(s, targetYear, targetMonth);
      if (date && date >= from && date >= s.startAt) {
        candidate = date;
        break;
      }
    }
  }

  if (!candidate) return null;
  if (s.endAt && candidate > s.endAt) return null;
  return candidate;
}

/** Occurrence date inside a specific month, from dayOfMonth or nth-weekday. */
function occurrenceInMonth(s: ScheduleFields, year: number, month: number): LocalDate | null {
  if (s.weekOfMonth && s.daysOfWeek && s.daysOfWeek.length > 0) {
    return nthWeekdayOfMonth(year, month, s.daysOfWeek[0], s.weekOfMonth);
  }
  const day = s.dayOfMonth ?? toParts(s.startAt).d;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const clamped = day === -1 ? lastDay : Math.min(day, lastDay);
  return fromUTC(Date.UTC(year, month - 1, clamped));
}

/** Next `count` local occurrence dates strictly after `afterLocal`. */
export function nextOccurrencesLocal(
  s: ScheduleFields,
  afterLocal: LocalDate,
  count: number,
): LocalDate[] {
  const out: LocalDate[] = [];
  let cursor = afterLocal;
  let inclusive = false;
  for (let i = 0; i < count; i++) {
    const next = nextOccurrenceLocal(s, cursor, inclusive);
    if (!next) break;
    out.push(next);
    cursor = next;
    inclusive = false;
  }
  return out;
}

/** UTC instant of a local occurrence date at the definition's time. */
export function occurrenceRunAt(s: ScheduleFields, local: LocalDate): Date {
  return zonedTimeToUtc(local, s.timeOfDay, s.timezone);
}

/**
 * Next run strictly after `now` (UTC). Compares actual instants — a same-day
 * occurrence whose time hasn't passed yet is still eligible.
 */
export function computeNextRun(
  s: ScheduleFields,
  now: Date,
): { local: LocalDate; runAt: Date } | null {
  const localToday = todayInTz(now, s.timezone);
  let local = nextOccurrenceLocal(s, localToday, true);
  for (let i = 0; i < 3 && local; i++) {
    const runAt = occurrenceRunAt(s, local);
    if (runAt.getTime() > now.getTime()) return { local, runAt };
    local = nextOccurrenceLocal(s, local, false);
  }
  return local ? { local, runAt: occurrenceRunAt(s, local) } : null;
}

/** Should the definition stop after `occurrenceCount` occurrences / past endAt? */
export function isExhausted(input: {
  occurrenceCount: number;
  maxOccurrences: number | null;
  endAt: LocalDate | null;
  nextLocal: LocalDate | null;
}): boolean {
  if (input.maxOccurrences !== null && input.occurrenceCount >= input.maxOccurrences) return true;
  if (input.nextLocal === null) return true;
  if (input.endAt && input.nextLocal > input.endAt) return true;
  return false;
}

/* ------------------------------------------------------ template rendering */

export type TemplateContext = {
  client?: { name: string } | null;
  contact?: { name: string } | null;
  project?: { name: string } | null;
  assignee?: { name: string } | null;
  recurrence: { name: string };
  occurrence: { date: LocalDate };
};

const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/** Whitelisted variables only — no code execution, no arbitrary object access. */
export const TEMPLATE_VARIABLES = [
  "client.name",
  "contact.name",
  "project.name",
  "recurrence.name",
  "occurrence.date",
  "occurrence.month",
  "occurrence.year",
  "period.start",
  "period.end",
  "assignee.name",
] as const;

function resolveVariable(variable: string, ctx: TemplateContext): string | null {
  const { y, m } = toParts(ctx.occurrence.date);
  switch (variable) {
    case "client.name":
      return ctx.client?.name ?? null;
    case "contact.name":
      return ctx.contact?.name ?? null;
    case "project.name":
      return ctx.project?.name ?? null;
    case "assignee.name":
      return ctx.assignee?.name ?? null;
    case "recurrence.name":
      return ctx.recurrence.name;
    case "occurrence.date":
      return ctx.occurrence.date;
    case "occurrence.month":
      return MONTHS_ES[m - 1];
    case "occurrence.year":
      return String(y);
    case "period.start":
      return fromUTC(Date.UTC(y, m - 1, 1));
    case "period.end":
      return fromUTC(Date.UTC(y, m, 0));
    default:
      return null;
  }
}

export class TemplateRenderError extends Error {
  constructor(public readonly variable: string, public readonly reason: "unknown" | "unresolved") {
    super(
      reason === "unknown"
        ? `Variable no permitida: {{${variable}}}`
        : `Variable sin valor en este contexto: {{${variable}}}`,
    );
  }
}

/**
 * Renders {{variable}} placeholders. Unknown variables and variables that
 * resolve to nothing in the current context throw a visible error (no silent
 * empty strings, no injection: only the whitelist is ever evaluated).
 */
export function renderTemplate(text: string, ctx: TemplateContext): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, variable: string) => {
    if (!(TEMPLATE_VARIABLES as readonly string[]).includes(variable)) {
      throw new TemplateRenderError(variable, "unknown");
    }
    const value = resolveVariable(variable, ctx);
    if (value === null) throw new TemplateRenderError(variable, "unresolved");
    return value;
  });
}

/** Lists template variables used in a text (for validation before saving). */
export function usedVariables(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) out.add(m[1]);
  return [...out];
}

/* ------------------------------------------------------------ templates */

const offsetDays = z.coerce.number().int().min(-365).max(365);

/** Relative dates use NATURAL days — business-day offsets are not simulated
 * (the work calendar exists only for SLA math; documented limitation). */
export const activityTemplateSchema = z.object({
  targetType: z.literal("activity"),
  title: z.string().trim().min(1, "Título de plantilla requerido."),
  description: z.string().optional().default(""),
  activityType: z.string().default("general"),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  dueOffsetDays: offsetDays.nullable().default(null),
  startOffsetDays: offsetDays.nullable().default(null),
  estimatedMinutes: z.coerce.number().int().positive().nullable().default(null),
});

export const projectActivityTemplateSchema = activityTemplateSchema.extend({
  targetType: z.literal("project_activity"),
});

export const ticketTemplateSchema = z.object({
  targetType: z.literal("ticket"),
  title: z.string().trim().min(1, "Título de plantilla requerido."),
  description: z.string().optional().default(""),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  category: z.string().trim().min(1, "Categoría requerida."),
  subcategory: z.string().optional().default(""),
  channel: z.enum(["email", "phone", "whatsapp", "portal", "in_person", "internal"]).default("internal"),
  modality: z.enum(["remote", "onsite"]).default("remote"),
  slaDefinitionId: z.coerce.number().int().positive().nullable().default(null),
  contactId: z.coerce.number().int().positive().nullable().default(null),
  dueOffsetDays: offsetDays.nullable().default(null),
});

/** Report recurrences create the Report in draft with the resolved period. */
export const reportTemplateSchema = z.object({
  targetType: z.literal("report"),
  title: z.string().trim().min(1, "Título de plantilla requerido."),
  templateId: z.coerce.number().int().positive().nullable().default(null),
  periodRule: z
    .enum(["previous_week", "previous_month", "previous_quarter", "current_month"])
    .default("previous_month"),
  dueOffsetDays: offsetDays.nullable().default(null),
});

export const templateDataSchema = z.discriminatedUnion("targetType", [
  activityTemplateSchema,
  projectActivityTemplateSchema,
  ticketTemplateSchema,
  reportTemplateSchema,
]);
export type TemplateData = z.infer<typeof templateDataSchema>;

/* ------------------------------------------------------- error taxonomy */

export type RecurrenceErrorKind = "temporary" | "configuration" | "permanent";

export const RECURRENCE_ERROR_CODES: Record<string, RecurrenceErrorKind> = {
  timeout: "temporary",
  db_connection: "temporary",
  lock_conflict: "temporary",
  client_archived: "configuration",
  client_missing: "configuration",
  assignee_inactive: "configuration",
  project_not_operational: "configuration",
  list_archived: "configuration",
  list_missing: "configuration",
  sla_missing: "configuration",
  contact_missing: "configuration",
  template_invalid: "configuration",
  variable_unresolved: "configuration",
  target_unsupported: "permanent",
  definition_corrupt: "permanent",
};

export function classifyError(code: string): RecurrenceErrorKind {
  return RECURRENCE_ERROR_CODES[code] ?? "temporary";
}

/** Structured, retry-safe failure raised by the engine's validation steps. */
export class GenerationError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
  }
}

/* ------------------------------------------------------- human description */

const WEEKDAY_ES = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

export function describeSchedule(s: ScheduleFields): string {
  const time = `a las ${s.timeOfDay} (${s.timezone})`;
  const every = (unit: string, plural: string) =>
    s.interval > 1 ? `cada ${s.interval} ${plural}` : `cada ${unit}`;
  switch (s.frequency) {
    case "daily":
      return `${every("día", "días")} ${time}`;
    case "weekdays":
      return `días laborales (lun–vie) ${time}`;
    case "weekly":
    case "custom": {
      const days = (s.daysOfWeek ?? [isoWeekday(s.startAt)])
        .map((d) => WEEKDAY_ES[d])
        .join(", ");
      return `${every("semana", "semanas")} los ${days} ${time}`;
    }
    case "monthly":
    case "quarterly":
    case "semiannual": {
      const step = { monthly: 1, quarterly: 3, semiannual: 6 }[s.frequency]! * s.interval;
      const period = step === 1 ? "mes" : `${step} meses`;
      if (s.weekOfMonth && s.daysOfWeek?.length) {
        const nth = s.weekOfMonth === -1 ? "último" : ["", "primer", "segundo", "tercer", "cuarto"][s.weekOfMonth];
        return `el ${nth} ${WEEKDAY_ES[s.daysOfWeek[0]]} de cada ${period} ${time}`;
      }
      const day = (s.dayOfMonth ?? toParts(s.startAt).d) === -1 ? "último día" : `día ${s.dayOfMonth ?? toParts(s.startAt).d}`;
      return `el ${day} de cada ${period} ${time}`;
    }
    case "annual": {
      const month = MONTHS_ES[(s.monthOfYear ?? toParts(s.startAt).m) - 1];
      const day = s.dayOfMonth === -1 ? "último día" : `día ${s.dayOfMonth ?? toParts(s.startAt).d}`;
      return `cada año, ${day} de ${month} ${time}`;
    }
  }
}
