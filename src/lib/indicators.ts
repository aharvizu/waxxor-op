/**
 * Central indicator definitions — the single place where every metric shown in
 * /indicators is named, defined and given its formula and drill-down route.
 * Formulas are implemented once in src/lib/report-metrics.ts; components never
 * compute their own numbers. See docs/features/indicator-definitions.md.
 */

export type IndicatorDefinition = {
  key: string;
  name: string;
  description: string;
  formula: string;
  unit: "count" | "minutes" | "percent" | "currency";
  source: string;
  drillDownRoute: string | null;
  emptyState: string;
};

export const INDICATOR_DEFINITIONS: readonly IndicatorDefinition[] = [
  {
    key: "backlog",
    name: "Backlog",
    description: "Tickets no cerrados ni cancelados al final del periodo.",
    formula: "count(tickets creados ≤ fin del periodo, sin closed_at ≤ fin, estado ≠ cancelled)",
    unit: "count",
    source: "tickets + work_items",
    drillDownRoute: "/helpdesk?quick=pending",
    emptyState: "Sin tickets abiertos en el periodo.",
  },
  {
    key: "tickets_created",
    name: "Tickets nuevos",
    description: "Tickets creados dentro del periodo.",
    formula: "count(work_items.created_at ∈ periodo, type = ticket)",
    unit: "count",
    source: "work_items",
    drillDownRoute: "/helpdesk?status=new",
    emptyState: "No se crearon tickets en el periodo.",
  },
  {
    key: "tickets_closed",
    name: "Tickets cerrados",
    description: "Tickets con cierre dentro del periodo.",
    formula: "count(tickets.closed_at ∈ periodo)",
    unit: "count",
    source: "tickets",
    drillDownRoute: "/helpdesk?status=closed",
    emptyState: "No se cerraron tickets en el periodo.",
  },
  {
    key: "reopen_rate",
    name: "Tasa de reapertura",
    description: "Tickets reabiertos entre tickets cerrados en el periodo.",
    formula: "reabiertos ∈ periodo / cerrados ∈ periodo × 100",
    unit: "percent",
    source: "tickets (last_reopened_at, closed_at)",
    drillDownRoute: "/helpdesk?status=reopened",
    emptyState: "Sin cierres en el periodo — la tasa no aplica.",
  },
  {
    key: "sla_compliance",
    name: "Cumplimiento de SLA",
    description: "Resolución dentro del objetivo, sobre tickets evaluables cerrados en el periodo.",
    formula:
      "count(sla_resolution_met = true) / count(sla_resolution_met is not null) × 100 — cancelados y sin snapshot excluidos por construcción",
    unit: "percent",
    source: "tickets (banderas finales congeladas al cierre)",
    drillDownRoute: "/helpdesk?quick=overdue",
    emptyState: "Sin tickets evaluables cerrados en el periodo.",
  },
  {
    key: "sla_first_response",
    name: "Cumplimiento primera respuesta",
    description: "Primera respuesta dentro del objetivo, sobre evaluables cerrados en el periodo.",
    formula: "count(sla_first_response_met = true) / count(sla_first_response_met is not null) × 100",
    unit: "percent",
    source: "tickets",
    drillDownRoute: "/helpdesk",
    emptyState: "Sin tickets evaluables en el periodo.",
  },
  {
    key: "avg_first_response",
    name: "Primera respuesta promedio",
    description: "Promedio de first_response_at − created_at para respuestas del periodo.",
    formula: "avg(first_response_at − created_at) en minutos naturales (las pausas no aplican a la primera respuesta)",
    unit: "minutes",
    source: "tickets + work_items",
    drillDownRoute: "/helpdesk",
    emptyState: "Sin primeras respuestas registradas en el periodo.",
  },
  {
    key: "avg_resolution",
    name: "Resolución promedio",
    description: "Promedio de resolved_at − created_at para resoluciones del periodo.",
    formula: "avg(resolved_at − created_at) en minutos naturales",
    unit: "minutes",
    source: "tickets + work_items",
    drillDownRoute: "/helpdesk",
    emptyState: "Sin resoluciones en el periodo.",
  },
  {
    key: "time_total",
    name: "Tiempo registrado",
    description: "Minutos de sesiones no anuladas con fecha dentro del periodo.",
    formula: "sum(duration_minutes) where voided_at is null and date ∈ periodo",
    unit: "minutes",
    source: "time_entries",
    drillDownRoute: null,
    emptyState: "Sin tiempo registrado en el periodo.",
  },
  {
    key: "time_billable",
    name: "Tiempo facturable",
    description: "Minutos con clasificación billable en el periodo.",
    formula: "sum(duration_minutes) where billing_status = 'billable'",
    unit: "minutes",
    source: "time_entries",
    drillDownRoute: null,
    emptyState: "Sin tiempo facturable en el periodo.",
  },
  {
    key: "billing_pending_review",
    name: "Cobro por revisar",
    description: "Tickets del periodo con clasificación de cobro pendiente.",
    formula: "count(billing_status = 'pending_review')",
    unit: "count",
    source: "tickets",
    drillDownRoute: "/helpdesk?billing=pending_review",
    emptyState: "Nada pendiente de revisión de cobro.",
  },
  {
    key: "billing_potential",
    name: "Monto potencial",
    description: "Suma de importes calculados en estados cobrables del periodo.",
    formula: "sum(calculated_amount) where billing_status in (billable, contract_overage, fixed_price)",
    unit: "currency",
    source: "tickets",
    drillDownRoute: "/helpdesk?billing=billable",
    emptyState: "Sin importes cobrables en el periodo.",
  },
  {
    key: "projects_at_risk",
    name: "Proyectos en riesgo",
    description: "Proyectos con estado o salud en riesgo/bloqueado.",
    formula: "count(status = 'at_risk' or health_status in ('at_risk','blocked'))",
    unit: "count",
    source: "projects",
    drillDownRoute: "/projects?quick=at_risk",
    emptyState: "Ningún proyecto en riesgo.",
  },
  {
    key: "recurrence_success_rate",
    name: "Éxito de recurrencias",
    description: "Ejecuciones exitosas entre intentadas en el periodo.",
    formula: "succeeded / (succeeded + failed) × 100",
    unit: "percent",
    source: "recurrence_executions",
    drillDownRoute: "/recurring?quick=errors",
    emptyState: "Sin ejecuciones de recurrencia en el periodo.",
  },
  {
    key: "reports_pipeline",
    name: "Reportes en flujo",
    description: "Reportes por estado del flujo de trabajo.",
    formula: "count(reports) group by status (excluye archivados)",
    unit: "count",
    source: "reports",
    drillDownRoute: "/reports",
    emptyState: "Sin reportes en el flujo.",
  },
] as const;

export function indicatorDefinition(key: string): IndicatorDefinition | undefined {
  return INDICATOR_DEFINITIONS.find((d) => d.key === key);
}

/* ------------------------------------------------------------- thresholds */

/**
 * Default thresholds — overridable per organization via indicator_thresholds
 * rows (SuperAdmin/Administrator, audited). Documented in
 * docs/features/indicator-thresholds.md.
 */
export const INDICATOR_THRESHOLD_DEFAULTS: Record<string, { value: number; label: string; unit: string }> = {
  sla_target_pct: { value: 90, label: "Objetivo de cumplimiento de SLA", unit: "%" },
  client_inactive_days: { value: 30, label: "Días máximos sin interacción con cliente", unit: "días" },
  report_overdue_days: { value: 5, label: "Días tras el fin de periodo para considerar un reporte vencido", unit: "días" },
  renewal_upcoming_days: { value: 30, label: "Días para considerar una renovación próxima", unit: "días" },
  backlog_critical_pct: { value: 25, label: "Crecimiento de backlog considerado crítico", unit: "%" },
  recurrence_failures_allowed: { value: 3, label: "Fallos de recurrencia consecutivos permitidos", unit: "fallos" },
};

export type Thresholds = Record<string, number>;

export function mergeThresholds(overrides: { key: string; value: string }[]): Thresholds {
  const merged: Thresholds = {};
  for (const [key, def] of Object.entries(INDICATOR_THRESHOLD_DEFAULTS)) merged[key] = def.value;
  for (const o of overrides) {
    if (o.key in INDICATOR_THRESHOLD_DEFAULTS) merged[o.key] = Number(o.value);
  }
  return merged;
}

/* -------------------------------------------------------- attention rules */

export type AttentionItem = { key: string; severity: "high" | "medium"; text: string; href: string };

/**
 * Deterministic "Atención requerida" for the Executive Overview — facts only,
 * never invented strategic recommendations (spec §27).
 */
export function buildExecutiveAttention(input: {
  backlog: number;
  backlogPrevious: number | null;
  slaCompliancePct: number | null;
  overdueTickets: number;
  projectsAtRisk: number;
  billingPendingReview: number;
  reportsOverdue: number;
  recurrencesInError: number;
  thresholds: Thresholds;
}): AttentionItem[] {
  const out: AttentionItem[] = [];
  if (
    input.backlogPrevious !== null &&
    input.backlogPrevious > 0 &&
    ((input.backlog - input.backlogPrevious) / input.backlogPrevious) * 100 >=
      input.thresholds.backlog_critical_pct
  ) {
    out.push({
      key: "backlog_growth",
      severity: "high",
      text: `El backlog creció de ${input.backlogPrevious} a ${input.backlog} (≥${input.thresholds.backlog_critical_pct}%).`,
      href: "/helpdesk",
    });
  }
  if (input.slaCompliancePct !== null && input.slaCompliancePct < input.thresholds.sla_target_pct) {
    out.push({
      key: "sla_below_target",
      severity: "high",
      text: `Cumplimiento de SLA en ${input.slaCompliancePct}% — por debajo del objetivo (${input.thresholds.sla_target_pct}%).`,
      href: "/helpdesk?quick=overdue",
    });
  }
  if (input.overdueTickets > 0) {
    out.push({
      key: "tickets_overdue",
      severity: "high",
      text: `${input.overdueTickets} ticket(s) con SLA vencido ahora mismo.`,
      href: "/helpdesk?quick=overdue",
    });
  }
  if (input.projectsAtRisk > 0) {
    out.push({
      key: "projects_at_risk",
      severity: "medium",
      text: `${input.projectsAtRisk} proyecto(s) en riesgo o bloqueado(s).`,
      href: "/projects?quick=at_risk",
    });
  }
  if (input.billingPendingReview > 0) {
    out.push({
      key: "billing_review",
      severity: "medium",
      text: `${input.billingPendingReview} ticket(s) con cobro sin revisar.`,
      href: "/helpdesk?billing=pending_review",
    });
  }
  if (input.reportsOverdue > 0) {
    out.push({
      key: "reports_overdue",
      severity: "medium",
      text: `${input.reportsOverdue} reporte(s) vencido(s) o por atender.`,
      href: "/reports?view=pending_review",
    });
  }
  if (input.recurrencesInError > 0) {
    out.push({
      key: "recurrences_error",
      severity: "medium",
      text: `${input.recurrencesInError} recurrencia(s) pausada(s) por fallos.`,
      href: "/recurring?quick=errors",
    });
  }
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
}
