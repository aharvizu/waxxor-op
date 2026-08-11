import { describe, expect, it } from "vitest";
import {
  CONFIRMATION_TYPES,
  TICKET_STATUSES,
  canTransition,
  closureBlockers,
  computeTicketAmount,
  confirmationTypeSchema,
  finalSlaCompliance,
  isActiveTicketStatus,
  isWorkflowDropdownCategory,
  ticketStatusSchema,
} from "./tickets";
import type { TicketStatusCategoryValue } from "./ticket-catalogs";

/** Builds a minimal status row for canTransition — mirrors the 11 system rows' real semanticKey/category pairing (see lib/ticket-catalogs.ts's SYSTEM_TICKET_STATUSES). */
function sys(id: number, semanticKey: string, category: TicketStatusCategoryValue) {
  return { id, semanticKey, category };
}
/** A custom (admin-created) status — no semanticKey, only a category. */
function custom(id: number, category: TicketStatusCategoryValue) {
  return { id, semanticKey: null, category };
}

const NEW = sys(1, "NEW", "open");
const ASSIGNED = sys(2, "ASSIGNED", "open");
const IN_PROGRESS = sys(3, "IN_PROGRESS", "in_progress");
const WAITING_CUSTOMER = sys(4, "WAITING_CUSTOMER", "waiting");
const RESOLVED = sys(5, "RESOLVED", "resolved");
const PENDING_CONFIRMATION = sys(6, "PENDING_CONFIRMATION", "resolved");
const CLOSED = sys(7, "CLOSED", "closed");
const REOPENED = sys(8, "REOPENED", "open");
const CANCELLED = sys(9, "CANCELLED", "cancelled");

describe("official ticket lifecycle", () => {
  it("exposes the eleven official statuses", () => {
    expect(TICKET_STATUSES).toEqual([
      "new", "assigned", "in_progress", "waiting_customer", "waiting_third_party",
      "scheduled", "resolved", "pending_confirmation", "closed", "reopened", "cancelled",
    ]);
    expect(ticketStatusSchema.safeParse("open").success).toBe(false); // legacy value
    expect(ticketStatusSchema.safeParse("pending").success).toBe(false); // activity value
  });

  it("isActiveTicketStatus is true only for open/in_progress/waiting", () => {
    expect(isActiveTicketStatus("open")).toBe(true);
    expect(isActiveTicketStatus("in_progress")).toBe(true);
    expect(isActiveTicketStatus("waiting")).toBe(true);
    expect(isActiveTicketStatus("resolved")).toBe(false);
    expect(isActiveTicketStatus("closed")).toBe(false);
    expect(isActiveTicketStatus("cancelled")).toBe(false);
  });

  it("the generic dropdown excludes resolved/closed — those need dedicated actions", () => {
    expect(isWorkflowDropdownCategory("open")).toBe(true);
    expect(isWorkflowDropdownCategory("in_progress")).toBe(true);
    expect(isWorkflowDropdownCategory("waiting")).toBe(true);
    expect(isWorkflowDropdownCategory("cancelled")).toBe(true);
    expect(isWorkflowDropdownCategory("resolved")).toBe(false);
    expect(isWorkflowDropdownCategory("closed")).toBe(false);
  });
});

describe("transitions — system statuses (exact graph, now keyed by semanticKey)", () => {
  it("allows the documented forward paths", () => {
    expect(canTransition(NEW, ASSIGNED)).toBe(true);
    expect(canTransition(ASSIGNED, IN_PROGRESS)).toBe(true);
    expect(canTransition(IN_PROGRESS, WAITING_CUSTOMER)).toBe(true);
    expect(canTransition(WAITING_CUSTOMER, IN_PROGRESS)).toBe(true);
    expect(canTransition(IN_PROGRESS, RESOLVED)).toBe(true);
    expect(canTransition(RESOLVED, PENDING_CONFIRMATION)).toBe(true);
    expect(canTransition(PENDING_CONFIRMATION, CLOSED)).toBe(true);
    expect(canTransition(CLOSED, REOPENED)).toBe(true);
    expect(canTransition(CANCELLED, REOPENED)).toBe(true);
    expect(canTransition(REOPENED, IN_PROGRESS)).toBe(true);
  });

  it("rejects inconsistent jumps", () => {
    expect(canTransition(NEW, CLOSED)).toBe(false); // must resolve first
    expect(canTransition(NEW, PENDING_CONFIRMATION)).toBe(false);
    expect(canTransition(CLOSED, IN_PROGRESS)).toBe(false); // reopen first
    expect(canTransition(CLOSED, CLOSED)).toBe(false);
    expect(canTransition(CANCELLED, IN_PROGRESS)).toBe(false);
    expect(canTransition(RESOLVED, NEW)).toBe(false);
  });

  it("nothing can ever target the system NEW status", () => {
    expect(canTransition(ASSIGNED, NEW)).toBe(false);
    expect(canTransition(REOPENED, NEW)).toBe(false);
    expect(canTransition(custom(20, "open"), NEW)).toBe(false);
  });
});

describe("transitions — custom statuses fall back to the category graph", () => {
  it("a custom status behaves like its category's system peers", () => {
    const customWaiting = custom(21, "waiting");
    expect(canTransition(IN_PROGRESS, customWaiting)).toBe(true); // in_progress -> waiting is allowed
    expect(canTransition(customWaiting, RESOLVED)).toBe(true); // waiting -> resolved is allowed
    expect(canTransition(CLOSED, customWaiting)).toBe(false); // closed only reopens
  });

  it("two different custom statuses in the same category can transition between each other", () => {
    const waitingA = custom(22, "waiting");
    const waitingB = custom(23, "waiting");
    expect(canTransition(waitingA, waitingB)).toBe(true);
  });

  it("a custom resolved-category status can close or reopen, like Resolved/Pending confirmation", () => {
    const customResolved = custom(24, "resolved");
    expect(canTransition(customResolved, CLOSED)).toBe(true);
    expect(canTransition(customResolved, REOPENED)).toBe(true);
  });
});

describe("closure rules", () => {
  const ready = {
    resolution: "Fixed the VPN",
    category: "Networking",
    confirmationType: "phone",
    activeTimeMinutes: 30,
    timeExceptionReason: null,
    billingStatusCategory: "included" as const,
    openRelatedActivities: 0,
  };

  it("closable when everything is present", () => {
    expect(closureBlockers(ready)).toEqual([]);
  });

  it("blocks without resolution / category / confirmation", () => {
    expect(closureBlockers({ ...ready, resolution: null })).toContain("resolution");
    expect(closureBlockers({ ...ready, category: "  " })).toContain("category");
    expect(closureBlockers({ ...ready, confirmationType: null })).toContain("confirmation_type");
  });

  it("blocks without time unless an explicit exception reason exists", () => {
    expect(closureBlockers({ ...ready, activeTimeMinutes: 0 })).toContain("time_or_exception");
    expect(
      closureBlockers({ ...ready, activeTimeMinutes: 0, timeExceptionReason: "Handled by vendor" }),
    ).toEqual([]);
  });

  it("blocks while a related Activity is still open", () => {
    expect(closureBlockers({ ...ready, openRelatedActivities: 1 })).toContain("open_related_activities");
    expect(closureBlockers({ ...ready, openRelatedActivities: 0 })).toEqual([]);
  });

  it("blocks while the billing classification is still pending (or unresolved)", () => {
    expect(closureBlockers({ ...ready, billingStatusCategory: "pending" })).toContain("billing_status");
    expect(closureBlockers({ ...ready, billingStatusCategory: null })).toContain("billing_status");
    expect(closureBlockers({ ...ready, billingStatusCategory: "not_billable" })).toEqual([]);
    expect(closureBlockers({ ...ready, billingStatusCategory: "billed" })).toEqual([]);
  });
});

describe("confirmation types", () => {
  it("accepts each of the six types", () => {
    expect(CONFIRMATION_TYPES).toEqual([
      "whatsapp", "phone", "email", "verbal", "no_response", "not_required",
    ]);
    for (const t of CONFIRMATION_TYPES) {
      expect(confirmationTypeSchema.safeParse(t).success).toBe(true);
    }
    expect(confirmationTypeSchema.safeParse("sms").success).toBe(false);
  });
});

describe("operational billing amount", () => {
  it("hourly: billableMinutes/60 × rate", () => {
    expect(
      computeTicketAmount({ modality: "remote", billableMinutes: 90, hourlyRate: "100.00", fixedAmount: null }),
    ).toBe("150.00");
    expect(
      computeTicketAmount({ modality: "onsite", billableMinutes: 45, hourlyRate: "80", fixedAmount: null }),
    ).toBe("60.00");
  });

  it("fixed price ignores minutes", () => {
    expect(
      computeTicketAmount({ modality: "fixed_price", billableMinutes: 999, hourlyRate: "100", fixedAmount: "2500.00" }),
    ).toBe("2500.00");
  });

  it("not applicable or missing rate → null", () => {
    expect(
      computeTicketAmount({ modality: "not_applicable", billableMinutes: 60, hourlyRate: "100", fixedAmount: "5" }),
    ).toBeNull();
    expect(
      computeTicketAmount({ modality: "remote", billableMinutes: 60, hourlyRate: null, fixedAmount: null }),
    ).toBeNull();
  });
});

describe("final SLA compliance at close", () => {
  const target = new Date("2026-07-17T16:00:00Z");
  it("met / missed / n-a", () => {
    expect(
      finalSlaCompliance({
        firstResponseAt: new Date("2026-07-17T15:00:00Z"),
        firstResponseTargetAt: target,
        resolvedAt: new Date("2026-07-17T17:00:00Z"),
        resolutionTargetAt: target,
      }),
    ).toEqual({ slaFirstResponseMet: true, slaResolutionMet: false });
    expect(
      finalSlaCompliance({
        firstResponseAt: null,
        firstResponseTargetAt: target,
        resolvedAt: null,
        resolutionTargetAt: null,
      }),
    ).toEqual({ slaFirstResponseMet: false, slaResolutionMet: null });
  });
});
