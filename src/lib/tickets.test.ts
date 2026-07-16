import { describe, expect, it } from "vitest";
import {
  CONFIRMATION_TYPES,
  TICKET_STATUSES,
  TICKET_SLA_PAUSE_STATUSES,
  canTransition,
  closureBlockers,
  computeTicketAmount,
  confirmationTypeSchema,
  finalSlaCompliance,
  ticketStatusSchema,
} from "./tickets";

describe("official ticket lifecycle", () => {
  it("exposes the eleven official statuses", () => {
    expect(TICKET_STATUSES).toEqual([
      "new", "assigned", "in_progress", "waiting_customer", "waiting_third_party",
      "scheduled", "resolved", "pending_confirmation", "closed", "reopened", "cancelled",
    ]);
    expect(ticketStatusSchema.safeParse("open").success).toBe(false); // legacy value
    expect(ticketStatusSchema.safeParse("pending").success).toBe(false); // activity value
  });

  it("waiting states pause the SLA", () => {
    expect(TICKET_SLA_PAUSE_STATUSES).toEqual(["waiting_customer", "waiting_third_party"]);
  });
});

describe("transitions", () => {
  it("allows the documented forward paths", () => {
    expect(canTransition("new", "assigned")).toBe(true);
    expect(canTransition("assigned", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "waiting_customer")).toBe(true);
    expect(canTransition("waiting_customer", "in_progress")).toBe(true);
    expect(canTransition("in_progress", "resolved")).toBe(true);
    expect(canTransition("resolved", "pending_confirmation")).toBe(true);
    expect(canTransition("pending_confirmation", "closed")).toBe(true);
    expect(canTransition("closed", "reopened")).toBe(true);
    expect(canTransition("cancelled", "reopened")).toBe(true);
    expect(canTransition("reopened", "in_progress")).toBe(true);
  });

  it("rejects inconsistent jumps", () => {
    expect(canTransition("new", "closed")).toBe(false); // must resolve first
    expect(canTransition("new", "pending_confirmation")).toBe(false);
    expect(canTransition("closed", "in_progress")).toBe(false); // reopen first
    expect(canTransition("closed", "closed")).toBe(false);
    expect(canTransition("cancelled", "in_progress")).toBe(false);
    expect(canTransition("resolved", "new")).toBe(false);
  });
});

describe("closure rules", () => {
  const ready = {
    resolution: "Fixed the VPN",
    category: "Networking",
    confirmationType: "phone",
    activeTimeMinutes: 30,
    timeExceptionReason: null,
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
