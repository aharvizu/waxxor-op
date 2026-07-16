import { z } from "zod";
import { tickets } from "@/db/schema";

/**
 * Ticket lifecycle, closure rules and operational billing — pure domain.
 * See docs/features/tickets.md and docs/features/ticket-billing.md.
 */

export const TICKET_STATUSES = [
  "new",
  "assigned",
  "in_progress",
  "waiting_customer",
  "waiting_third_party",
  "scheduled",
  "resolved",
  "pending_confirmation",
  "closed",
  "reopened",
  "cancelled",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];
export const ticketStatusSchema = z.enum(TICKET_STATUSES);

/** Statuses an agent can pick from the generic dropdown (the rest go through dedicated actions). */
export const TICKET_WORKFLOW_STATUSES = [
  "new",
  "assigned",
  "in_progress",
  "waiting_customer",
  "waiting_third_party",
  "scheduled",
  "cancelled",
] as const;
export const ticketWorkflowStatusSchema = z.enum(TICKET_WORKFLOW_STATUSES);

const ACTIVE = [
  "new",
  "assigned",
  "in_progress",
  "waiting_customer",
  "waiting_third_party",
  "scheduled",
  "reopened",
] as const;

/** Valid transitions. Resolution/confirmation/closure/reopen run through dedicated actions. */
const TRANSITIONS: Record<TicketStatus, readonly TicketStatus[]> = {
  new: ["assigned", "in_progress", "scheduled", "waiting_customer", "waiting_third_party", "resolved", "cancelled"],
  assigned: ["in_progress", "scheduled", "waiting_customer", "waiting_third_party", "resolved", "cancelled"],
  in_progress: ["assigned", "scheduled", "waiting_customer", "waiting_third_party", "resolved", "cancelled"],
  waiting_customer: ["assigned", "in_progress", "scheduled", "waiting_third_party", "resolved", "cancelled"],
  waiting_third_party: ["assigned", "in_progress", "scheduled", "waiting_customer", "resolved", "cancelled"],
  scheduled: ["assigned", "in_progress", "waiting_customer", "waiting_third_party", "resolved", "cancelled"],
  resolved: ["pending_confirmation", "closed", "reopened"],
  pending_confirmation: ["closed", "reopened"],
  closed: ["reopened"],
  reopened: ["assigned", "in_progress", "scheduled", "waiting_customer", "waiting_third_party", "resolved", "cancelled"],
  cancelled: ["reopened"],
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return false;
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function isActiveTicketStatus(status: string): boolean {
  return (ACTIVE as readonly string[]).includes(status);
}

/** Statuses that pause the SLA clock (see docs/features/sla.md). */
export const TICKET_SLA_PAUSE_STATUSES = ["waiting_customer", "waiting_third_party"] as const;

export const CONFIRMATION_TYPES = tickets.confirmationType.enumValues;
export const confirmationTypeSchema = z.enum(CONFIRMATION_TYPES);

export const TICKET_BILLING_STATUSES = tickets.billingStatus.enumValues;
export const ticketBillingStatusSchema = z.enum(TICKET_BILLING_STATUSES);
export const TICKET_BILLING_MODALITIES = tickets.billingModality.enumValues;
export const ticketBillingModalitySchema = z.enum(TICKET_BILLING_MODALITIES);

/**
 * Closure requirements (pure): resolution, category, confirmation type, and
 * either active time or an explicit reason for the audited time exception.
 * Returns the list of missing requirements ([] = closable).
 */
export function closureBlockers(state: {
  resolution: string | null;
  category: string | null;
  confirmationType: string | null;
  activeTimeMinutes: number;
  timeExceptionReason: string | null;
}): string[] {
  const missing: string[] = [];
  if (!state.resolution?.trim()) missing.push("resolution");
  if (!state.category?.trim()) missing.push("category");
  if (!state.confirmationType) missing.push("confirmation_type");
  if (state.activeTimeMinutes <= 0 && !state.timeExceptionReason?.trim()) {
    missing.push("time_or_exception");
  }
  return missing;
}

/**
 * Operational billing amount:
 *  - fixed_price → fixedAmount;
 *  - remote/onsite → billableMinutes/60 × hourlyRate (voided entries never count);
 *  - not_applicable → null.
 * Numeric columns travel as strings.
 */
export function computeTicketAmount(params: {
  modality: (typeof TICKET_BILLING_MODALITIES)[number];
  billableMinutes: number;
  hourlyRate: string | null;
  fixedAmount: string | null;
}): string | null {
  const { modality, billableMinutes, hourlyRate, fixedAmount } = params;
  if (modality === "not_applicable") return null;
  if (modality === "fixed_price") return fixedAmount;
  if (!hourlyRate) return null;
  return ((billableMinutes / 60) * Number(hourlyRate)).toFixed(2);
}

/** Final SLA compliance, frozen at close. Null when the ticket has no SLA/target. */
export function finalSlaCompliance(t: {
  firstResponseAt: Date | null;
  firstResponseTargetAt: Date | null;
  resolvedAt: Date | null;
  resolutionTargetAt: Date | null;
}): { slaFirstResponseMet: boolean | null; slaResolutionMet: boolean | null } {
  return {
    slaFirstResponseMet: t.firstResponseTargetAt
      ? t.firstResponseAt !== null &&
        t.firstResponseAt.getTime() <= t.firstResponseTargetAt.getTime()
      : null,
    slaResolutionMet: t.resolutionTargetAt
      ? t.resolvedAt !== null && t.resolvedAt.getTime() <= t.resolutionTargetAt.getTime()
      : null,
  };
}
