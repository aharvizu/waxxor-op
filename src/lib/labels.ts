import type { BadgeTone } from "@/components/ui";
import type { Locale } from "@/lib/i18n";

/**
 * Shared status/priority/role label maps, bilingual (es/en) — Settings →
 * Organización → Idioma drives which one renders (2026-08-25). Each map keeps
 * its original key set and tones; only the label text is locale-dependent.
 *
 * `getLabels(locale)` is the only entry point — server pages resolve `locale`
 * via `getOrgLocale`, client components via `useLocale()`. Every call site in
 * the app goes through it (no more static default-locale consts here).
 */

type BiMeta = { es: string; en: string; tone: BadgeTone };
export type Meta = { label: string; tone: BadgeTone };

function resolveMap<K extends string>(map: Record<K, BiMeta>, locale: Locale): Record<K, Meta> {
  const out = {} as Record<K, Meta>;
  for (const key of Object.keys(map) as K[]) {
    out[key] = { label: map[key][locale], tone: map[key].tone };
  }
  return out;
}

const ticketStatusMetaBi: Record<string, BiMeta> = {
  new: { es: "Nuevo", en: "New", tone: "blue" },
  assigned: { es: "Asignado", en: "Assigned", tone: "violet" },
  in_progress: { es: "En progreso", en: "In progress", tone: "purple" },
  waiting_customer: { es: "Esperando cliente", en: "Waiting customer", tone: "amber" },
  waiting_third_party: { es: "Esperando tercero", en: "Waiting third party", tone: "amber" },
  scheduled: { es: "Agendado", en: "Scheduled", tone: "blue" },
  resolved: { es: "Resuelto", en: "Resolved", tone: "green" },
  pending_confirmation: { es: "Pendiente de confirmación", en: "Pending confirmation", tone: "amber" },
  closed: { es: "Cerrado", en: "Closed", tone: "slate" },
  reopened: { es: "Reabierto", en: "Reopened", tone: "red" },
  cancelled: { es: "Cancelado", en: "Cancelled", tone: "slate" },
};

const ticketBillingMetaBi: Record<string, BiMeta> = {
  pending_review: { es: "Pendiente de revisión", en: "Pending review", tone: "amber" },
  included_in_contract: { es: "Incluido en contrato", en: "In contract", tone: "blue" },
  billable: { es: "Facturable", en: "Billable", tone: "green" },
  contract_overage: { es: "Excedente de contrato", en: "Contract overage", tone: "violet" },
  fixed_price: { es: "Precio fijo", en: "Fixed price", tone: "purple" },
  no_charge: { es: "Sin costo", en: "No charge", tone: "slate" },
  included_in_monthly_charge: { es: "Incluido en cargo mensual", en: "Monthly charge", tone: "blue" },
  charged: { es: "Facturado", en: "Charged", tone: "green" },
};

const confirmationTypeMetaBi: Record<string, BiMeta> = {
  whatsapp: { es: "WhatsApp", en: "WhatsApp", tone: "green" },
  phone: { es: "Teléfono", en: "Phone", tone: "blue" },
  email: { es: "Correo", en: "Email", tone: "blue" },
  verbal: { es: "Verbal", en: "Verbal", tone: "slate" },
  no_response: { es: "Sin respuesta", en: "No response", tone: "amber" },
  not_required: { es: "No requerido", en: "Not required", tone: "slate" },
};

const ticketPriorityMetaBi: Record<string, BiMeta> = {
  low: { es: "Baja", en: "Low", tone: "slate" },
  medium: { es: "Media", en: "Medium", tone: "blue" },
  high: { es: "Alta", en: "High", tone: "amber" },
  critical: { es: "Crítica", en: "Critical", tone: "red" },
};

const projectStatusMetaBi: Record<string, BiMeta> = {
  planning: { es: "Planeación", en: "Planning", tone: "violet" },
  active: { es: "Activo", en: "Active", tone: "green" },
  on_hold: { es: "En pausa", en: "On hold", tone: "amber" },
  at_risk: { es: "En riesgo", en: "At risk", tone: "red" },
  completed: { es: "Completado", en: "Completed", tone: "blue" },
  cancelled: { es: "Cancelado", en: "Cancelled", tone: "slate" },
  archived: { es: "Archivado", en: "Archived", tone: "slate" },
};

const taskStatusMetaBi: Record<string, BiMeta> = {
  todo: { es: "Por hacer", en: "To do", tone: "slate" },
  in_progress: { es: "En progreso", en: "In progress", tone: "purple" },
  done: { es: "Hecho", en: "Done", tone: "green" },
};

const quoteStatusMetaBi: Record<string, BiMeta> = {
  draft: { es: "Borrador", en: "Draft", tone: "slate" },
  sent: { es: "Enviada", en: "Sent", tone: "blue" },
  accepted: { es: "Aceptada", en: "Accepted", tone: "green" },
  rejected: { es: "Rechazada", en: "Rejected", tone: "red" },
  expired: { es: "Expirada", en: "Expired", tone: "amber" },
};

const reportStatusMetaBi: Record<string, BiMeta> = {
  draft: { es: "Borrador", en: "Draft", tone: "slate" },
  generating: { es: "Generando", en: "Generating", tone: "blue" },
  ready_for_review: { es: "Listo para revisión", en: "Ready for review", tone: "amber" },
  changes_requested: { es: "Cambios solicitados", en: "Changes requested", tone: "red" },
  approved: { es: "Aprobado", en: "Approved", tone: "green" },
  sent: { es: "Enviado", en: "Sent", tone: "green" },
  failed: { es: "Fallido", en: "Failed", tone: "red" },
  archived: { es: "Archivado", en: "Archived", tone: "slate" },
};

const reportTypeMetaBi: Record<string, BiMeta> = {
  monthly_service: { es: "Servicio mensual", en: "Monthly service", tone: "blue" },
  operational_summary: { es: "Resumen operativo", en: "Operational summary", tone: "blue" },
  executive_summary: { es: "Resumen ejecutivo", en: "Executive summary", tone: "purple" },
  sla_report: { es: "SLA", en: "SLA", tone: "violet" },
  time_report: { es: "Tiempo", en: "Time", tone: "slate" },
  project_report: { es: "Proyecto", en: "Project", tone: "violet" },
  billing_support: { es: "Soporte de cobro", en: "Billing support", tone: "amber" },
  custom_internal: { es: "Interno", en: "Internal", tone: "slate" },
};

const activityStatusMetaBi: Record<string, BiMeta> = {
  pending: { es: "Pendiente", en: "Pending", tone: "slate" },
  in_progress: { es: "En progreso", en: "In progress", tone: "purple" },
  waiting: { es: "En espera", en: "Waiting", tone: "amber" },
  blocked: { es: "Bloqueada", en: "Blocked", tone: "red" },
  completed: { es: "Completada", en: "Completed", tone: "green" },
  cancelled: { es: "Cancelada", en: "Cancelled", tone: "slate" },
  archived: { es: "Archivada", en: "Archived", tone: "slate" },
};

const activityTypeMetaBi: Record<string, BiMeta> = {
  general: { es: "General", en: "General", tone: "slate" },
  follow_up: { es: "Seguimiento", en: "Follow-up", tone: "blue" },
  meeting: { es: "Reunión", en: "Meeting", tone: "violet" },
  research: { es: "Investigación", en: "Research", tone: "blue" },
  documentation: { es: "Documentación", en: "Documentation", tone: "slate" },
  training: { es: "Capacitación", en: "Training", tone: "green" },
  review: { es: "Revisión", en: "Review", tone: "amber" },
  implementation: { es: "Implementación", en: "Implementation", tone: "purple" },
  preventive: { es: "Preventivo", en: "Preventive", tone: "green" },
  administrative: { es: "Administrativo", en: "Administrative", tone: "slate" },
  commercial: { es: "Comercial", en: "Commercial", tone: "amber" },
  reminder: { es: "Recordatorio", en: "Reminder", tone: "red" },
};

const slaHealthMetaBi: Record<string, BiMeta> = {
  normal: { es: "En tiempo", en: "On track", tone: "green" },
  at_risk: { es: "En riesgo", en: "At risk", tone: "amber" },
  critical: { es: "Crítico", en: "Critical", tone: "red" },
  overdue: { es: "Vencido", en: "Overdue", tone: "red" },
  met: { es: "Cumplido", en: "Met", tone: "green" },
  breached: { es: "Incumplido", en: "Breached", tone: "red" },
};

const roleMetaBi: Record<string, BiMeta> = {
  superadmin: { es: "Super Admin", en: "Super Admin", tone: "purple" },
  administrator: { es: "Administrador", en: "Administrator", tone: "violet" },
  director: { es: "Director", en: "Director", tone: "blue" },
  project_manager: { es: "Gerente de proyecto", en: "Project Manager", tone: "amber" },
  technician: { es: "Técnico", en: "Technician", tone: "slate" },
  client: { es: "Cliente", en: "Client", tone: "green" },
};

const companyStatusMetaBi: Record<string, BiMeta> = {
  active: { es: "Activo", en: "Active", tone: "green" },
  inactive: { es: "Inactivo", en: "Inactive", tone: "slate" },
  prospect_legacy: { es: "Prospecto / legado", en: "Prospect / legacy", tone: "amber" },
  archived: { es: "Archivado", en: "Archived", tone: "slate" },
};

const vendorStatusMetaBi: Record<string, BiMeta> = {
  active: { es: "Activo", en: "Active", tone: "green" },
  inactive: { es: "Inactivo", en: "Inactive", tone: "slate" },
  archived: { es: "Archivado", en: "Archived", tone: "slate" },
};

const contactTypeMetaBi: Record<string, BiMeta> = {
  owner: { es: "Dueño", en: "Owner", tone: "purple" },
  primary: { es: "Principal", en: "Primary", tone: "blue" },
  technical: { es: "Técnico", en: "Technical", tone: "violet" },
  administrative: { es: "Administrativo", en: "Administrative", tone: "slate" },
  billing: { es: "Facturación", en: "Billing", tone: "amber" },
  management: { es: "Dirección", en: "Management", tone: "blue" },
  requester: { es: "Solicitante", en: "Requester", tone: "slate" },
  other: { es: "Otro", en: "Other", tone: "slate" },
};

const clientServiceTypeMetaBi: Record<string, BiMeta> = {
  recurring_service: { es: "Servicio recurrente", en: "Recurring service", tone: "blue" },
  license: { es: "Licencia", en: "License", tone: "violet" },
  support_contract: { es: "Contrato de soporte", en: "Support contract", tone: "purple" },
  one_time_service: { es: "Servicio único", en: "One-time service", tone: "slate" },
  managed_service: { es: "Servicio administrado", en: "Managed service", tone: "blue" },
};

/** Derived statuses (expiring/expired) included — they never hit the DB. */
const clientServiceStatusMetaBi: Record<string, BiMeta> = {
  active: { es: "Activo", en: "Active", tone: "green" },
  expiring: { es: "Por vencer", en: "Expiring", tone: "amber" },
  expired: { es: "Vencido", en: "Expired", tone: "red" },
  cancelled: { es: "Cancelado", en: "Cancelled", tone: "slate" },
  archived: { es: "Archivado", en: "Archived", tone: "slate" },
};

const contractTypeMetaBi: Record<string, BiMeta> = {
  support: { es: "Soporte", en: "Support", tone: "blue" },
  managed_service: { es: "Servicio administrado", en: "Managed service", tone: "violet" },
  licensing: { es: "Licenciamiento", en: "Licensing", tone: "purple" },
  consulting: { es: "Consultoría", en: "Consulting", tone: "amber" },
  maintenance: { es: "Mantenimiento", en: "Maintenance", tone: "slate" },
  other: { es: "Otro", en: "Other", tone: "slate" },
};

const contractStatusMetaBi: Record<string, BiMeta> = {
  draft: { es: "Borrador", en: "Draft", tone: "slate" },
  active: { es: "Activo", en: "Active", tone: "green" },
  expiring: { es: "Por vencer", en: "Expiring", tone: "amber" },
  expired: { es: "Vencido", en: "Expired", tone: "red" },
  cancelled: { es: "Cancelado", en: "Cancelled", tone: "slate" },
  archived: { es: "Archivado", en: "Archived", tone: "slate" },
};

const supportCoverageMetaBi: Record<string, BiMeta> = {
  included: { es: "Incluido", en: "Included", tone: "green" },
  incident_based: { es: "Por incidente", en: "Per incident", tone: "amber" },
  hourly_bundle: { es: "Bolsa de horas", en: "Hourly bundle", tone: "blue" },
  fixed_price: { es: "Precio fijo", en: "Fixed price", tone: "violet" },
  not_applicable: { es: "N/A", en: "N/A", tone: "slate" },
};

const renewalBucketMetaBi: Record<string, BiMeta> = {
  overdue: { es: "Vencido", en: "Overdue", tone: "red" },
  d7: { es: "≤ 7 días", en: "≤ 7 days", tone: "red" },
  d15: { es: "≤ 15 días", en: "≤ 15 days", tone: "amber" },
  d30: { es: "≤ 30 días", en: "≤ 30 days", tone: "amber" },
  d60: { es: "≤ 60 días", en: "≤ 60 days", tone: "blue" },
  d90: { es: "≤ 90 días", en: "≤ 90 days", tone: "slate" },
  later: { es: "Más adelante", en: "Later", tone: "slate" },
};

const projectPriorityMetaBi: Record<string, BiMeta> = {
  low: { es: "Baja", en: "Low", tone: "slate" },
  normal: { es: "Normal", en: "Normal", tone: "blue" },
  high: { es: "Alta", en: "High", tone: "amber" },
  urgent: { es: "Urgente", en: "Urgent", tone: "red" },
};

const projectHealthMetaBi: Record<string, BiMeta> = {
  on_track: { es: "En curso", en: "On track", tone: "green" },
  attention: { es: "Atención", en: "Attention", tone: "amber" },
  at_risk: { es: "En riesgo", en: "At risk", tone: "red" },
  blocked: { es: "Bloqueado", en: "Blocked", tone: "red" },
  completed: { es: "Completado", en: "Completed", tone: "blue" },
  not_set: { es: "Sin definir", en: "Not set", tone: "slate" },
};

const projectMemberRoleMetaBi: Record<string, BiMeta> = {
  manager: { es: "Gerente", en: "Manager", tone: "purple" },
  coordinator: { es: "Coordinador", en: "Coordinator", tone: "violet" },
  contributor: { es: "Colaborador", en: "Contributor", tone: "blue" },
  observer: { es: "Observador", en: "Observer", tone: "slate" },
};

const projectListStatusMetaBi: Record<string, BiMeta> = {
  planned: { es: "Planeada", en: "Planned", tone: "slate" },
  active: { es: "Activa", en: "Active", tone: "green" },
  completed: { es: "Completada", en: "Completed", tone: "blue" },
  archived: { es: "Archivada", en: "Archived", tone: "slate" },
};

const milestoneStatusMetaBi: Record<string, BiMeta> = {
  pending: { es: "Pendiente", en: "Pending", tone: "slate" },
  in_progress: { es: "En progreso", en: "In progress", tone: "blue" },
  completed: { es: "Completado", en: "Completed", tone: "green" },
  delayed: { es: "Retrasado", en: "Delayed", tone: "red" },
  cancelled: { es: "Cancelado", en: "Cancelled", tone: "slate" },
};

const riskSeverityMetaBi: Record<string, BiMeta> = {
  low: { es: "Baja", en: "Low", tone: "slate" },
  medium: { es: "Media", en: "Medium", tone: "amber" },
  high: { es: "Alta", en: "High", tone: "red" },
  critical: { es: "Crítica", en: "Critical", tone: "red" },
};

const riskStatusMetaBi: Record<string, BiMeta> = {
  open: { es: "Abierto", en: "Open", tone: "red" },
  monitoring: { es: "Monitoreando", en: "Monitoring", tone: "amber" },
  mitigated: { es: "Mitigado", en: "Mitigated", tone: "green" },
  occurred: { es: "Ocurrió", en: "Occurred", tone: "red" },
  closed: { es: "Cerrado", en: "Closed", tone: "slate" },
};

const recurrenceStatusMetaBi: Record<string, BiMeta> = {
  draft: { es: "Borrador", en: "Draft", tone: "slate" },
  active: { es: "Activa", en: "Active", tone: "green" },
  paused: { es: "Pausada", en: "Paused", tone: "amber" },
  completed: { es: "Completada", en: "Completed", tone: "blue" },
  expired: { es: "Expirada", en: "Expired", tone: "slate" },
  error: { es: "Error", en: "Error", tone: "red" },
  archived: { es: "Archivada", en: "Archived", tone: "slate" },
};

const recurrenceTargetTypeMetaBi: Record<string, BiMeta> = {
  activity: { es: "Actividad", en: "Activity", tone: "purple" },
  ticket: { es: "Ticket", en: "Ticket", tone: "blue" },
  project_activity: { es: "Actividad de proyecto", en: "Project activity", tone: "violet" },
  report: { es: "Reporte", en: "Report", tone: "slate" },
};

const recurrenceFrequencyMetaBi: Record<string, BiMeta> = {
  daily: { es: "Diaria", en: "Daily", tone: "slate" },
  weekly: { es: "Semanal", en: "Weekly", tone: "slate" },
  monthly: { es: "Mensual", en: "Monthly", tone: "slate" },
  quarterly: { es: "Trimestral", en: "Quarterly", tone: "slate" },
  semiannual: { es: "Semestral", en: "Semiannual", tone: "slate" },
  annual: { es: "Anual", en: "Annual", tone: "slate" },
  weekdays: { es: "Días hábiles", en: "Weekdays", tone: "slate" },
  custom: { es: "Personalizada", en: "Custom", tone: "slate" },
};

const recurrenceExecutionStatusMetaBi: Record<string, BiMeta> = {
  pending: { es: "Pendiente", en: "Pending", tone: "slate" },
  running: { es: "Ejecutando", en: "Running", tone: "blue" },
  succeeded: { es: "Exitosa", en: "Succeeded", tone: "green" },
  failed: { es: "Fallida", en: "Failed", tone: "red" },
  skipped: { es: "Omitida", en: "Skipped", tone: "slate" },
  cancelled: { es: "Cancelada", en: "Cancelled", tone: "slate" },
  duplicate_prevented: { es: "Duplicado evitado", en: "Duplicate prevented", tone: "amber" },
};

const recurrenceExecutionSourceMetaBi: Record<string, BiMeta> = {
  scheduler: { es: "Programador", en: "Scheduler", tone: "slate" },
  manual: { es: "Manual", en: "Manual", tone: "blue" },
  retry: { es: "Reintento", en: "Retry", tone: "amber" },
  backfill: { es: "Retroactivo", en: "Backfill", tone: "violet" },
};

const knowledgeStatusMetaBi: Record<string, BiMeta> = {
  draft: { es: "Borrador", en: "Draft", tone: "slate" },
  in_review: { es: "En revisión", en: "In review", tone: "amber" },
  published: { es: "Publicado", en: "Published", tone: "green" },
  archived: { es: "Archivado", en: "Archived", tone: "slate" },
};

const knowledgeVisibilityMetaBi: Record<string, BiMeta> = {
  internal: { es: "Interna", en: "Internal", tone: "blue" },
  client: { es: "Cliente (futuro)", en: "Client (future)", tone: "violet" },
};

const knowledgeRelationTypeMetaBi: Record<string, BiMeta> = {
  ticket: { es: "Ticket", en: "Ticket", tone: "blue" },
  company: { es: "Empresa", en: "Company", tone: "violet" },
  project: { es: "Proyecto", en: "Project", tone: "amber" },
  activity: { es: "Actividad", en: "Activity", tone: "slate" },
};

/** Locale-aware entry point — server pages resolve `locale` via getOrgLocale,
 * client components via useLocale(). */
export function getLabels(locale: Locale) {
  return {
    ticketStatusMeta: resolveMap(ticketStatusMetaBi, locale),
    ticketBillingMeta: resolveMap(ticketBillingMetaBi, locale),
    confirmationTypeMeta: resolveMap(confirmationTypeMetaBi, locale),
    ticketPriorityMeta: resolveMap(ticketPriorityMetaBi, locale),
    projectStatusMeta: resolveMap(projectStatusMetaBi, locale),
    taskStatusMeta: resolveMap(taskStatusMetaBi, locale),
    quoteStatusMeta: resolveMap(quoteStatusMetaBi, locale),
    reportStatusMeta: resolveMap(reportStatusMetaBi, locale),
    reportTypeMeta: resolveMap(reportTypeMetaBi, locale),
    activityStatusMeta: resolveMap(activityStatusMetaBi, locale),
    activityTypeMeta: resolveMap(activityTypeMetaBi, locale),
    slaHealthMeta: resolveMap(slaHealthMetaBi, locale),
    roleMeta: resolveMap(roleMetaBi, locale),
    companyStatusMeta: resolveMap(companyStatusMetaBi, locale),
    vendorStatusMeta: resolveMap(vendorStatusMetaBi, locale),
    contactTypeMeta: resolveMap(contactTypeMetaBi, locale),
    clientServiceTypeMeta: resolveMap(clientServiceTypeMetaBi, locale),
    clientServiceStatusMeta: resolveMap(clientServiceStatusMetaBi, locale),
    contractTypeMeta: resolveMap(contractTypeMetaBi, locale),
    contractStatusMeta: resolveMap(contractStatusMetaBi, locale),
    supportCoverageMeta: resolveMap(supportCoverageMetaBi, locale),
    renewalBucketMeta: resolveMap(renewalBucketMetaBi, locale),
    projectPriorityMeta: resolveMap(projectPriorityMetaBi, locale),
    projectHealthMeta: resolveMap(projectHealthMetaBi, locale),
    projectMemberRoleMeta: resolveMap(projectMemberRoleMetaBi, locale),
    projectListStatusMeta: resolveMap(projectListStatusMetaBi, locale),
    milestoneStatusMeta: resolveMap(milestoneStatusMetaBi, locale),
    riskSeverityMeta: resolveMap(riskSeverityMetaBi, locale),
    riskStatusMeta: resolveMap(riskStatusMetaBi, locale),
    recurrenceStatusMeta: resolveMap(recurrenceStatusMetaBi, locale),
    recurrenceTargetTypeMeta: resolveMap(recurrenceTargetTypeMetaBi, locale),
    recurrenceFrequencyMeta: resolveMap(recurrenceFrequencyMetaBi, locale),
    recurrenceExecutionStatusMeta: resolveMap(recurrenceExecutionStatusMetaBi, locale),
    recurrenceExecutionSourceMeta: resolveMap(recurrenceExecutionSourceMetaBi, locale),
    knowledgeStatusMeta: resolveMap(knowledgeStatusMetaBi, locale),
    knowledgeVisibilityMeta: resolveMap(knowledgeVisibilityMetaBi, locale),
    knowledgeRelationTypeMeta: resolveMap(knowledgeRelationTypeMetaBi, locale),
  };
}
