import { z } from "zod";
import { tickets } from "@/db/schema";
import type { TicketBillingCategoryValue, TicketStatusCategoryValue, TicketStatusRow } from "./ticket-catalogs";

/**
 * Ticket lifecycle, closure rules and operational billing — pure domain.
 * See docs/features/tickets.md and docs/features/ticket-billing.md.
 *
 * Status is now catalog-driven (2026-07-22 — see lib/ticket-catalogs.ts): the
 * 11 fixed strings below no longer gate the workflow. canTransition/
 * isActiveTicketStatus operate on a status row's stable semanticKey (system
 * rows, exact graph below — byte-for-byte the same graph as before, just
 * keyed by id instead of string) or, for a custom status with no
 * semanticKey, on its semanticCategory (the "open/in_progress/waiting/
 * resolved/closed/cancelled" dispatch key every row must declare).
 */

/** Legacy list of the 11 system statuses' slugs — used only by seed/migration/test code that still needs the plain string set. */
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

type StatusForTransition = Pick<TicketStatusRow, "id" | "semanticKey" | "category">;

/** The exact graph the old string-keyed TRANSITIONS map encoded, now keyed by stable semanticKey. Resolution/confirmation/closure/reopen run through dedicated actions. */
const SYSTEM_TRANSITIONS: Record<string, readonly string[]> = {
  NEW: ["ASSIGNED", "IN_PROGRESS", "SCHEDULED", "WAITING_CUSTOMER", "WAITING_THIRD_PARTY", "RESOLVED", "CANCELLED"],
  ASSIGNED: ["IN_PROGRESS", "SCHEDULED", "WAITING_CUSTOMER", "WAITING_THIRD_PARTY", "RESOLVED", "CANCELLED"],
  IN_PROGRESS: ["ASSIGNED", "SCHEDULED", "WAITING_CUSTOMER", "WAITING_THIRD_PARTY", "RESOLVED", "CANCELLED"],
  WAITING_CUSTOMER: ["ASSIGNED", "IN_PROGRESS", "SCHEDULED", "WAITING_THIRD_PARTY", "RESOLVED", "CANCELLED"],
  WAITING_THIRD_PARTY: ["ASSIGNED", "IN_PROGRESS", "SCHEDULED", "WAITING_CUSTOMER", "RESOLVED", "CANCELLED"],
  SCHEDULED: ["ASSIGNED", "IN_PROGRESS", "WAITING_CUSTOMER", "WAITING_THIRD_PARTY", "RESOLVED", "CANCELLED"],
  RESOLVED: ["PENDING_CONFIRMATION", "CLOSED", "REOPENED"],
  PENDING_CONFIRMATION: ["CLOSED", "REOPENED"],
  CLOSED: ["REOPENED"],
  REOPENED: ["ASSIGNED", "IN_PROGRESS", "SCHEDULED", "WAITING_CUSTOMER", "WAITING_THIRD_PARTY", "RESOLVED", "CANCELLED"],
  CANCELLED: ["REOPENED"],
};

/** Fallback graph for any transition involving a custom (no-semanticKey) status — a generalization of the graph above at the category level. */
const CATEGORY_TRANSITIONS: Record<TicketStatusCategoryValue, readonly TicketStatusCategoryValue[]> = {
  open: ["open", "in_progress", "waiting", "resolved", "cancelled"],
  in_progress: ["open", "in_progress", "waiting", "resolved", "cancelled"],
  waiting: ["open", "in_progress", "waiting", "resolved", "cancelled"],
  resolved: ["resolved", "closed", "open"],
  closed: ["open"],
  cancelled: ["open"],
};

/** "new" only ever exists as a starting point — never a valid transition target, system or custom. */
export function canTransition(from: StatusForTransition, to: StatusForTransition): boolean {
  if (from.id === to.id) return false;
  if (to.semanticKey === "NEW") return false;
  if (from.semanticKey && to.semanticKey) {
    return SYSTEM_TRANSITIONS[from.semanticKey]?.includes(to.semanticKey) ?? false;
  }
  return CATEGORY_TRANSITIONS[from.category]?.includes(to.category) ?? false;
}

/** "Active" = still open work — everything except resolved/pending_confirmation/closed/cancelled. */
export function isActiveTicketStatus(category: TicketStatusCategoryValue): boolean {
  return category === "open" || category === "in_progress" || category === "waiting";
}

/** Categories selectable from the generic status dropdown — resolve/close/reopen go through their own dedicated actions instead. */
export function isWorkflowDropdownCategory(category: TicketStatusCategoryValue): boolean {
  return category === "open" || category === "in_progress" || category === "waiting" || category === "cancelled";
}

export const CONFIRMATION_TYPES = tickets.confirmationType.enumValues;
export const confirmationTypeSchema = z.enum(CONFIRMATION_TYPES);

export const TICKET_BILLING_STATUSES = tickets.billingStatus.enumValues;
export const ticketBillingStatusSchema = z.enum(TICKET_BILLING_STATUSES);
export const TICKET_BILLING_MODALITIES = tickets.billingModality.enumValues;
export const ticketBillingModalitySchema = z.enum(TICKET_BILLING_MODALITIES);

/**
 * Closure requirements (pure): resolution, category, confirmation type,
 * either active time or an explicit reason for the audited time exception, a
 * settled billing classification (2026-08-11 — a ticket can no longer close
 * while its billing status is still in the "pending" category; the caller
 * resolves the EFFECTIVE category — the one being applied at close if a
 * decision was submitted, else the ticket's current one), and no still-open
 * related Activity (2026-07-29 — closing a ticket while a linked follow-up
 * Activity is still pending/in_progress/waiting/blocked loses track of it;
 * the caller resolves "still open" as not completed/cancelled/archived and
 * passes the count in, since that's a real query this pure function can't do
 * itself). Returns the list of missing requirements ([] = closable).
 */
export function closureBlockers(state: {
  resolution: string | null;
  category: string | null;
  confirmationType: string | null;
  activeTimeMinutes: number;
  timeExceptionReason: string | null;
  billingStatusCategory: TicketBillingCategoryValue | null;
  openRelatedActivities: number;
}): string[] {
  const missing: string[] = [];
  if (!state.resolution?.trim()) missing.push("resolution");
  if (!state.category?.trim()) missing.push("category");
  if (!state.confirmationType) missing.push("confirmation_type");
  if (state.activeTimeMinutes <= 0 && !state.timeExceptionReason?.trim()) {
    missing.push("time_or_exception");
  }
  if (state.billingStatusCategory === null || state.billingStatusCategory === "pending") {
    missing.push("billing_status");
  }
  if (state.openRelatedActivities > 0) missing.push("open_related_activities");
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
