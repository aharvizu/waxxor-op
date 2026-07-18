import { describe, expect, it } from "vitest";
import {
  buildClientAlerts,
  daysUntil,
  derivedContractStatus,
  derivedServiceStatus,
  describeClientAuditEvent,
  renewalBucket,
  renewalSeverity,
} from "./client360";

// NOW sits at 23:59:59 so `${date}T23:59:59Z - NOW` lands on exact day
// boundaries — dateIn(d) always yields daysUntil === d, no ceil rounding noise.
const NOW = new Date("2026-07-16T23:59:59Z");
const dateIn = (days: number) =>
  new Date(NOW.getTime() + days * 86_400_000).toISOString().slice(0, 10);

describe("daysUntil", () => {
  it("counts exact days to end-of-day on the target date", () => {
    expect(daysUntil(dateIn(7), NOW)).toBe(7);
    expect(daysUntil(dateIn(0), NOW)).toBe(0);
  });

  it("is negative once the date has passed", () => {
    expect(daysUntil(dateIn(-5), NOW)).toBe(-5);
  });
});

describe("renewalBucket", () => {
  it.each([
    [-1, "overdue"],
    [0, "d7"],
    [7, "d7"],
    [8, "d15"],
    [15, "d15"],
    [16, "d30"],
    [30, "d30"],
    [31, "d60"],
    [60, "d60"],
    [61, "d90"],
    [90, "d90"],
    [91, "later"],
  ] as const)("buckets %i days out as %s", (offset, expected) => {
    expect(renewalBucket(dateIn(offset), NOW)).toBe(expected);
  });
});

describe("renewalSeverity", () => {
  it("maps overdue/d7 to high, d15/d30 to medium, d60/d90 to low", () => {
    expect(renewalSeverity("overdue")).toBe("high");
    expect(renewalSeverity("d7")).toBe("high");
    expect(renewalSeverity("d15")).toBe("medium");
    expect(renewalSeverity("d30")).toBe("medium");
    expect(renewalSeverity("d60")).toBe("low");
    expect(renewalSeverity("d90")).toBe("low");
  });

  it("does not alert on renewals further than 90 days out", () => {
    expect(renewalSeverity("later")).toBeNull();
  });
});

describe("derivedServiceStatus", () => {
  it("passes through non-active stored statuses unchanged", () => {
    expect(derivedServiceStatus({ status: "cancelled", endDate: null, renewalDate: null }, NOW)).toBe(
      "cancelled",
    );
  });

  it("derives expired when the renewal date is in the past", () => {
    expect(
      derivedServiceStatus({ status: "active", endDate: null, renewalDate: dateIn(-3) }, NOW),
    ).toBe("expired");
  });

  it("derives expiring within 30 days", () => {
    expect(
      derivedServiceStatus({ status: "active", endDate: null, renewalDate: dateIn(20) }, NOW),
    ).toBe("expiring");
  });

  it("stays active beyond 30 days or with no date at all", () => {
    expect(
      derivedServiceStatus({ status: "active", endDate: null, renewalDate: dateIn(45) }, NOW),
    ).toBe("active");
    expect(derivedServiceStatus({ status: "active", endDate: null, renewalDate: null }, NOW)).toBe(
      "active",
    );
  });

  it("falls back to endDate when there is no renewalDate", () => {
    expect(derivedServiceStatus({ status: "active", endDate: dateIn(-1), renewalDate: null }, NOW)).toBe(
      "expired",
    );
  });
});

describe("derivedContractStatus", () => {
  it("passes through draft/cancelled/archived unchanged", () => {
    expect(derivedContractStatus({ status: "draft", endDate: dateIn(-10) }, NOW)).toBe("draft");
  });

  it("derives expired/expiring/active from endDate when stored status is active", () => {
    expect(derivedContractStatus({ status: "active", endDate: dateIn(-1) }, NOW)).toBe("expired");
    expect(derivedContractStatus({ status: "active", endDate: dateIn(10) }, NOW)).toBe("expiring");
    expect(derivedContractStatus({ status: "active", endDate: dateIn(60) }, NOW)).toBe("active");
  });

  it("stays active with no end date (open-ended contract)", () => {
    expect(derivedContractStatus({ status: "active", endDate: null }, NOW)).toBe("active");
  });
});

describe("buildClientAlerts", () => {
  const base = {
    clientId: 1,
    renewals: [],
    overdueTickets: 0,
    slaAtRisk: 0,
    unansweredConversations: 0,
    overdueActivities: 0,
    billingPendingReview: 0,
    recurrencesInError: 0,
    reportsNeedingAttention: 0,
    lastTouchAt: null,
    now: NOW,
  };

  it("returns nothing when everything is quiet", () => {
    expect(buildClientAlerts(base)).toEqual([]);
  });

  it("emits a renewal alert only within the alerting window, not for 'later'", () => {
    const alerts = buildClientAlerts({
      ...base,
      renewals: [
        {
          source: "client_service",
          sourceId: 1,
          clientId: 1,
          clientName: "Acme",
          concept: "M365",
          kind: "license",
          date: dateIn(10),
          amount: "100",
          ownerName: null,
          status: "active",
        },
        {
          source: "contract",
          sourceId: 2,
          clientId: 1,
          clientName: "Acme",
          concept: "Managed services",
          kind: "managed_service",
          date: dateIn(120),
          amount: "500",
          ownerName: null,
          status: "active",
        },
      ],
    });
    expect(alerts).toHaveLength(1);
    expect(alerts[0].key).toBe("renewal:client_service:1");
  });

  it("sorts by severity: high before medium before low", () => {
    const alerts = buildClientAlerts({
      ...base,
      overdueActivities: 1, // medium
      overdueTickets: 1, // high
      lastTouchAt: new Date(NOW.getTime() - 45 * 86_400_000), // low
    });
    expect(alerts.map((a) => a.severity)).toEqual(["high", "medium", "low"]);
  });

  it("flags inactivity only past the 30-day threshold", () => {
    const recent = buildClientAlerts({
      ...base,
      lastTouchAt: new Date(NOW.getTime() - 10 * 86_400_000),
    });
    expect(recent.find((a) => a.key === "inactive")).toBeUndefined();

    const stale = buildClientAlerts({
      ...base,
      lastTouchAt: new Date(NOW.getTime() - 31 * 86_400_000),
    });
    expect(stale.find((a) => a.key === "inactive")).toBeDefined();
  });
});

describe("describeClientAuditEvent", () => {
  it("describes create/delete generically by entity", () => {
    expect(
      describeClientAuditEvent({ entityType: "contract", action: "create", field: null, metadata: null }),
    ).toBe("Se creó un contrato.");
    expect(
      describeClientAuditEvent({ entityType: "contact", action: "delete", field: null, metadata: null }),
    ).toBe("Se eliminó un contacto.");
  });

  it("describes a field update in plain language", () => {
    expect(
      describeClientAuditEvent({
        entityType: "client",
        action: "update",
        field: "status",
        metadata: null,
      }),
    ).toBe("Se actualizó estado de el cliente.");
  });

  it("prefers the lifecycle event over the generic field description", () => {
    expect(
      describeClientAuditEvent({
        entityType: "contact",
        action: "update",
        field: "isPrimary",
        metadata: { event: "primary_contact_changed" },
      }),
    ).toBe("Se actualizó el contacto principal.");
  });
});
