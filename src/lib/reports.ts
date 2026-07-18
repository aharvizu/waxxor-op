import { z } from "zod";
import { reportTemplates, reports } from "@/db/schema";
import { todayInTz, type LocalDate } from "@/lib/recurrence";

/**
 * Pure domain rules for Reports — types, workflow, periods, deterministic
 * narrative and CSV safety. No queries here. See docs/features/reports.md.
 */

export const REPORT_TYPES = reports.reportType.enumValues;
export const REPORT_STATUSES = reports.status.enumValues;
export const REPORT_TEMPLATE_STATUSES = reportTemplates.status.enumValues;
export const reportTypeSchema = z.enum(REPORT_TYPES);

/** Client is mandatory for client-facing types; custom_internal may be org-only. */
export const CLIENT_REQUIRED_TYPES = [
  "monthly_service",
  "operational_summary",
  "executive_summary",
  "sla_report",
  "billing_support",
] as const;

export function clientRequiredFor(type: (typeof REPORT_TYPES)[number]): boolean {
  return (CLIENT_REQUIRED_TYPES as readonly string[]).includes(type);
}

/* ---------------------------------------------------------------- workflow */

export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** draft → generating → ready_for_review → approved → sent, with the spec's side paths. */
const TRANSITIONS: Record<ReportStatus, ReportStatus[]> = {
  draft: ["generating", "archived"],
  generating: ["ready_for_review", "failed"],
  ready_for_review: ["changes_requested", "approved", "generating", "archived"],
  changes_requested: ["draft", "generating", "archived"],
  approved: ["sent", "draft", "generating", "archived"],
  sent: ["archived", "generating"],
  failed: ["draft", "generating", "archived"],
  archived: ["draft"],
};

export function canTransitionReport(from: ReportStatus, to: ReportStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/* ----------------------------------------------------------------- periods */

export const PERIOD_RULES = [
  "current_week",
  "previous_week",
  "current_month",
  "previous_month",
  "current_quarter",
  "previous_quarter",
  "current_year",
  "custom",
] as const;
export type PeriodRule = (typeof PERIOD_RULES)[number];

function parts(d: LocalDate): { y: number; m: number; day: number } {
  const [y, m, day] = d.split("-").map(Number);
  return { y, m, day };
}
function iso(y: number, m0: number, d: number): LocalDate {
  return new Date(Date.UTC(y, m0, d)).toISOString().slice(0, 10);
}

/**
 * Resolves a period rule to normalized [start, end] LOCAL dates in the org's
 * timezone (weeks are ISO Mon–Sun). Deterministic given `now`; documented per
 * rule in docs/features/reports.md §Periodos.
 */
export function resolvePeriod(
  rule: Exclude<PeriodRule, "custom">,
  timezone: string,
  now: Date,
): { start: LocalDate; end: LocalDate } {
  const today = todayInTz(now, timezone);
  const { y, m, day } = parts(today);
  const weekday = ((new Date(Date.UTC(y, m - 1, day)).getUTCDay() + 6) % 7); // 0 = Monday
  switch (rule) {
    case "current_week":
      return { start: iso(y, m - 1, day - weekday), end: iso(y, m - 1, day - weekday + 6) };
    case "previous_week":
      return { start: iso(y, m - 1, day - weekday - 7), end: iso(y, m - 1, day - weekday - 1) };
    case "current_month":
      return { start: iso(y, m - 1, 1), end: iso(y, m, 0) };
    case "previous_month":
      return { start: iso(y, m - 2, 1), end: iso(y, m - 1, 0) };
    case "current_quarter": {
      const q0 = Math.floor((m - 1) / 3) * 3;
      return { start: iso(y, q0, 1), end: iso(y, q0 + 3, 0) };
    }
    case "previous_quarter": {
      const q0 = Math.floor((m - 1) / 3) * 3 - 3;
      return { start: iso(y, q0, 1), end: iso(y, q0 + 3, 0) };
    }
    case "current_year":
      return { start: iso(y, 0, 1), end: iso(y, 11, 31) };
  }
}

/** The org timezone: single-org MVP uses the recurrence default (documented). */
export const ORG_TIMEZONE = "America/Mexico_City";

/* ---------------------------------------------------------------- sections */

export const REPORT_SECTIONS = [
  ["cover", "Portada"],
  ["executive_summary", "Resumen ejecutivo"],
  ["period_summary", "Resumen del periodo"],
  ["tickets", "Tickets"],
  ["sla", "SLA"],
  ["activities", "Actividades"],
  ["projects", "Proyectos"],
  ["time", "Tiempo"],
  ["conversations", "Conversaciones"],
  ["billing", "Cobro operativo"],
  ["recurring", "Recurrentes"],
  ["risks", "Riesgos"],
  ["conclusions", "Conclusiones"],
  ["recommendations", "Recomendaciones"],
  ["annexes", "Anexos"],
] as const;
export type SectionKey = (typeof REPORT_SECTIONS)[number][0];

export const sectionSchema = z.object({
  key: z.enum(REPORT_SECTIONS.map(([k]) => k) as [SectionKey, ...SectionKey[]]),
  title: z.string().trim().min(1),
  enabled: z.boolean(),
  intro: z.string().optional().default(""),
});
export const sectionsSchema = z.array(sectionSchema).max(20);
export type ReportSection = z.infer<typeof sectionSchema>;

export function defaultSections(): ReportSection[] {
  return REPORT_SECTIONS.map(([key, title]) => ({
    key,
    title,
    enabled: !["risks", "recommendations", "annexes"].includes(key),
    intro: "",
  }));
}

/* ------------------------------------------------- deterministic narrative */

export type NarrativeInput = {
  periodStart: LocalDate;
  periodEnd: LocalDate;
  ticketsCreated: number;
  ticketsClosed: number;
  slaEvaluated: number;
  slaMet: number;
  activitiesCompleted: number;
  totalMinutes: number;
  billableMinutes: number;
};

function fmtHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} horas` : `${h} horas ${m} minutos`;
}

/**
 * Deterministic initial narrative: states facts from the metrics, never
 * interpretations, causes or recommendations (spec §7). Fully editable after.
 */
export function buildNarrative(input: NarrativeInput): string {
  const lines: string[] = [];
  lines.push(
    `Durante el periodo del ${input.periodStart} al ${input.periodEnd} se atendieron ${input.ticketsCreated} tickets, de los cuales ${input.ticketsClosed} fueron cerrados.`,
  );
  if (input.slaEvaluated > 0) {
    const pct = Math.round((input.slaMet / input.slaEvaluated) * 100);
    lines.push(`El cumplimiento de SLA fue de ${pct}% (${input.slaMet} de ${input.slaEvaluated} tickets evaluados).`);
  }
  if (input.activitiesCompleted > 0) {
    lines.push(`Se completaron ${input.activitiesCompleted} actividades.`);
  }
  if (input.totalMinutes > 0) {
    lines.push(
      `Se registraron ${fmtHours(input.totalMinutes)} de atención${
        input.billableMinutes > 0 ? `, de las cuales ${fmtHours(input.billableMinutes)} son facturables` : ""
      }.`,
    );
  }
  return lines.join(" ");
}

/* -------------------------------------------------------------- CSV safety */

/**
 * Escapes a CSV cell: quotes when needed and neutralizes formula injection
 * (leading = + - @ get a leading apostrophe — spec §12).
 */
export function csvEscape(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) lines.push(row.map(csvEscape).join(","));
  return "﻿" + lines.join("\r\n"); // BOM for Excel UTF-8
}
