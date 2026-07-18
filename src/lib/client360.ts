import { z } from "zod";
import { clientServices, clients, contacts, contracts, services } from "@/db/schema";

/** Pure domain rules for Client 360 — see docs/features/client-360.md. */

export const CLIENT_STATUSES = clients.status.enumValues;
export const CONTACT_TYPES = contacts.contactType.enumValues;
export const CLIENT_SERVICE_TYPES = clientServices.serviceType.enumValues;
export const SUPPORT_COVERAGES = clientServices.supportCoverage.enumValues;
export const CONTRACT_TYPES = contracts.contractType.enumValues;
export const CONTRACT_STATUSES = contracts.status.enumValues;
export const SERVICE_CATEGORIES = ["general", "cloud", "security", "infrastructure", "software", "support"] as const;

export const clientStatusSchema = z.enum(CLIENT_STATUSES);
export const contactTypeSchema = z.enum(CONTACT_TYPES);
export const clientServiceTypeSchema = z.enum(CLIENT_SERVICE_TYPES);
export const supportCoverageSchema = z.enum(SUPPORT_COVERAGES);
export const contractTypeSchema = z.enum(CONTRACT_TYPES);
export const contractStatusSchema = z.enum(contracts.status.enumValues);
export const serviceStatusSchema = z.enum(services.status.enumValues);

/* ------------------------------------------------------------- renewals */

export type RenewalBucket = "overdue" | "d7" | "d15" | "d30" | "d60" | "d90" | "later";

export const RENEWAL_BUCKET_LABELS: Record<RenewalBucket, string> = {
  overdue: "Vencido",
  d7: "≤ 7 días",
  d15: "≤ 15 días",
  d30: "≤ 30 días",
  d60: "≤ 60 días",
  d90: "≤ 90 días",
  later: "Más adelante",
};

const DAY = 86_400_000;

export function daysUntil(dateStr: string, now: Date): number {
  return Math.ceil(
    (new Date(`${dateStr}T23:59:59Z`).getTime() - now.getTime()) / DAY,
  );
}

/** Spec thresholds: 90 / 60 / 30 / 15 / 7 / vencido. */
export function renewalBucket(dateStr: string, now: Date): RenewalBucket {
  const d = daysUntil(dateStr, now);
  if (d < 0) return "overdue";
  if (d <= 7) return "d7";
  if (d <= 15) return "d15";
  if (d <= 30) return "d30";
  if (d <= 60) return "d60";
  if (d <= 90) return "d90";
  return "later";
}

export function renewalSeverity(bucket: RenewalBucket): "high" | "medium" | "low" | null {
  if (bucket === "overdue" || bucket === "d7") return "high";
  if (bucket === "d15" || bucket === "d30") return "medium";
  if (bucket === "d60" || bucket === "d90") return "low";
  return null; // "later" is not an alert
}

/** Unified renewal row built from client services, licenses and contracts. */
export type RenewalItem = {
  source: "client_service" | "contract";
  sourceId: number;
  clientId: number;
  clientName: string;
  concept: string;
  kind: string; // license / recurring_service / contract type…
  date: string;
  amount: string | null;
  ownerName: string | null;
  status: string;
};

/* ------------------------------------------------- derived display status */

/** client_services / contracts store active|cancelled|…; expiring/expired derive from dates. */
export function derivedServiceStatus(
  row: { status: string; endDate: string | null; renewalDate: string | null },
  now: Date,
): "active" | "expiring" | "expired" | "cancelled" | "archived" {
  if (row.status !== "active") return row.status as "cancelled" | "archived";
  const ref = row.renewalDate ?? row.endDate;
  if (!ref) return "active";
  const d = daysUntil(ref, now);
  if (d < 0) return "expired";
  if (d <= 30) return "expiring";
  return "active";
}

export function derivedContractStatus(
  row: { status: string; endDate: string | null },
  now: Date,
): "draft" | "active" | "expiring" | "expired" | "cancelled" | "archived" {
  if (row.status !== "active") return row.status as "draft" | "cancelled" | "archived";
  if (!row.endDate) return "active";
  const d = daysUntil(row.endDate, now);
  if (d < 0) return "expired";
  if (d <= 30) return "expiring";
  return "active";
}

/* --------------------------------------------------------------- alerts */

export type ClientAlert = {
  key: string;
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  href: string;
};

/**
 * Client-level alerts from real aggregates. The same renewal data feeds the
 * Today "No olvides" rules (renewal_upcoming / contract_expired) so alerts
 * are never duplicated logic.
 */
export function buildClientAlerts(input: {
  clientId: number;
  renewals: RenewalItem[];
  overdueTickets: number;
  slaAtRisk: number;
  unansweredConversations: number;
  overdueActivities: number;
  billingPendingReview: number;
  recurrencesInError: number;
  reportsNeedingAttention: number;
  lastTouchAt: Date | null;
  now: Date;
}): ClientAlert[] {
  const out: ClientAlert[] = [];
  const base = `/clients/${input.clientId}`;

  for (const r of input.renewals) {
    const bucket = renewalBucket(r.date, input.now);
    const sev = renewalSeverity(bucket);
    if (!sev) continue;
    out.push({
      key: `renewal:${r.source}:${r.sourceId}`,
      severity: sev,
      title:
        bucket === "overdue"
          ? `Renovación vencida: ${r.concept}`
          : `Renovación próxima: ${r.concept}`,
      detail: `${RENEWAL_BUCKET_LABELS[bucket]} · ${r.date}${r.amount ? ` · $${r.amount}` : ""}`,
      href: `${base}?tab=renewals`,
    });
  }
  if (input.overdueTickets > 0) {
    out.push({
      key: "tickets_overdue",
      severity: "high",
      title: `${input.overdueTickets} ticket(s) vencido(s)`,
      detail: "SLA de resolución superado.",
      href: `${base}?tab=tickets&view=overdue`,
    });
  }
  if (input.slaAtRisk > 0) {
    out.push({
      key: "sla_risk",
      severity: "high",
      title: `${input.slaAtRisk} SLA en riesgo`,
      detail: "Quedan ≤25% de la ventana.",
      href: `${base}?tab=tickets`,
    });
  }
  if (input.unansweredConversations > 0) {
    out.push({
      key: "conversations",
      severity: "medium",
      title: `${input.unansweredConversations} conversación(es) sin respuesta`,
      detail: "El cliente espera respuesta.",
      href: `${base}?tab=conversations`,
    });
  }
  if (input.overdueActivities > 0) {
    out.push({
      key: "activities_overdue",
      severity: "medium",
      title: `${input.overdueActivities} actividad(es) vencida(s)`,
      detail: "Reagenda o completa.",
      href: `${base}?tab=activities`,
    });
  }
  if (input.billingPendingReview > 0) {
    out.push({
      key: "billing_review",
      severity: "medium",
      title: `${input.billingPendingReview} cobro(s) por revisar`,
      detail: "Tickets con clasificación pendiente.",
      href: `${base}?tab=billing`,
    });
  }
  if (input.reportsNeedingAttention > 0) {
    out.push({
      key: "reports_attention",
      severity: "medium",
      title: `${input.reportsNeedingAttention} reporte(s) por atender`,
      detail: "Pendientes de generar, revisar, corregir o enviar.",
      href: `${base}?tab=reportes`,
    });
  }
  if (input.recurrencesInError > 0) {
    out.push({
      key: "recurrences_error",
      severity: "medium",
      title: `${input.recurrencesInError} recurrencia(s) con error`,
      detail: "Pausadas automáticamente tras fallos consecutivos.",
      href: `${base}?tab=recurrentes`,
    });
  }
  if (
    input.lastTouchAt &&
    input.now.getTime() - input.lastTouchAt.getTime() > 30 * DAY
  ) {
    out.push({
      key: "inactive",
      severity: "low",
      title: "Sin interacción reciente",
      detail: `Última actividad: ${input.lastTouchAt.toISOString().slice(0, 10)}.`,
      href: `${base}?tab=history`,
    });
  }
  const order = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

/* ------------------------------------------------------- readable history */

const FIELD_LABELS_ES: Record<string, string> = {
  name: "nombre",
  legalName: "razón social",
  status: "estado",
  accountOwnerId: "responsable de cuenta",
  defaultTechnicianId: "técnico por defecto",
  isPrimary: "contacto principal",
  isActive: "activo",
  renewalDate: "fecha de renovación",
  endDate: "fecha de fin",
  cost: "costo",
  clientPrice: "precio al cliente",
  monthlyAmount: "monto mensual",
  body: "contenido",
};

const ENTITY_LABELS_ES: Record<string, string> = {
  client: "el cliente",
  contact: "un contacto",
  service: "el catálogo de servicios",
  client_service: "un servicio contratado",
  contract: "un contrato",
  client_note: "una nota",
};

/**
 * Translates one AuditLog row into a plain-language sentence for the
 * client-facing "Historial" tab. The raw technical log (field/old/new/actor)
 * stays SuperAdmin/Administrator-only — this is the readable layer everyone else sees.
 */
export function describeClientAuditEvent(log: {
  entityType: string;
  action: string;
  field: string | null;
  metadata: unknown;
}): string {
  const entity = ENTITY_LABELS_ES[log.entityType] ?? log.entityType;
  const meta = (log.metadata ?? {}) as Record<string, unknown>;
  const event = typeof meta.event === "string" ? meta.event : null;

  if (event === "primary_contact_changed") return "Se actualizó el contacto principal.";
  if (event === "contact_archived") return "Se archivó un contacto.";
  if (event === "contact_restored") return "Se restauró un contacto.";
  if (event === "renewal_updated") return "Se actualizó una fecha de renovación.";
  if (event === "note_edited") return "Se editó una nota.";

  if (log.action === "create") return `Se creó ${entity}.`;
  if (log.action === "delete") return `Se eliminó ${entity}.`;
  if (log.action === "update" && log.field) {
    const fieldLabel = FIELD_LABELS_ES[log.field] ?? log.field;
    return `Se actualizó ${fieldLabel} de ${entity}.`;
  }
  return `Se actualizó ${entity}.`;
}
