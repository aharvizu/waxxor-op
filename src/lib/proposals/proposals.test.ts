import { describe, expect, it } from "vitest";
import { computeTotals, itemAmountCents } from "./calc";
import { PRODUCT_LIST, PRODUCTS, resolvePeriod } from "./catalog";
import { buildDocument } from "./document";
import { canTransition, composeFolio, effectiveStatus, expiryDate } from "./lifecycle";
import { formatCents, parseMoneyToCents } from "./money";
import { renderProposalHtml } from "./render";
import type { ProposalInput, ProposalItem } from "./types";
import { issueBlockers, validateProposalInput } from "./validation";

const item = (over: Partial<ProposalItem>): ProposalItem => ({
  title: "Concepto",
  description: "",
  quantity: 1,
  termLabel: "Proyecto",
  unitPriceCents: 0,
  recurrence: "one_time",
  ...over,
});

function inputFor(key: keyof typeof PRODUCTS, over: Partial<ProposalInput> = {}): ProposalInput {
  const p = PRODUCTS[key];
  const period = resolvePeriod(p, null);
  const ctx = { planKey: p.defaultPlan, period, validityDays: 30 };
  return {
    companyId: null,
    clientName: "Cliente de prueba",
    preparedBy: "Waxxor",
    date: "2026-11-14",
    validityDays: 30,
    productKey: key,
    planKey: p.planLabel ? p.defaultPlan : null,
    billingPeriod: period,
    items: p.suggestedItems(ctx),
    note: p.defaultNote(ctx),
    ivaBps: 1600,
    ...over,
  };
}

describe("money", () => {
  it("parses typed amounts to integer cents without going through float", () => {
    expect(parseMoneyToCents("1850.55")).toBe(185055);
    expect(parseMoneyToCents("$1,850")).toBe(185000);
    expect(parseMoneyToCents("0.1")).toBe(10);
    for (const bad of ["", "abc", "1.234", "-5", "1e3"]) expect(parseMoneyToCents(bad)).toBeNull();
  });

  it("formats cents as MXN", () => {
    expect(formatCents(27689200)).toBe("$276,892.00");
  });
});

describe("totals", () => {
  it("SentinelOne acceptance case squares to the cent (spec §12.8)", () => {
    const totals = computeTotals(
      [
        item({ quantity: 120, unitPriceCents: 185000 }),
        item({ quantity: null, unitPriceCents: 950000 }),
        item({ quantity: 120, unitPriceCents: 6000 }),
      ],
      1600,
      null,
    );
    expect(totals.oneTime).toEqual({ subtotalCents: 23870000, ivaCents: 3819200, totalCents: 27689200 });
    expect(totals.recurring.totalCents).toBe(0);
  });

  it("MSP360 dual totals never mix the columns (spec §12.9)", () => {
    const totals = computeTotals(
      [
        item({ quantity: 25, unitPriceCents: 18000, recurrence: "monthly" }),
        item({ quantity: 2, unitPriceCents: 29000, recurrence: "monthly" }),
        item({ quantity: null, unitPriceCents: 250000, recurrence: "monthly" }),
        item({ quantity: 1, unitPriceCents: 1800000 }),
      ],
      1600,
      "monthly",
    );
    expect(totals.oneTime).toEqual({ subtotalCents: 1800000, ivaCents: 288000, totalCents: 2088000 });
    expect(totals.recurring).toEqual({ subtotalCents: 758000, ivaCents: 121280, totalCents: 879280 });
  });

  it("annual period: a monthly item contributes twelve months, an annual one once", () => {
    const totals = computeTotals(
      [
        item({ quantity: 10, unitPriceCents: 100000, recurrence: "annual" }),
        item({ quantity: 1, unitPriceCents: 50000, recurrence: "monthly" }),
        item({ quantity: 1, unitPriceCents: 300000 }),
      ],
      1600,
      "annual",
    );
    expect(totals.recurring.subtotalCents).toBe(1000000 + 50000 * 12);
    expect(totals.oneTime.subtotalCents).toBe(300000);
  });

  it('"No Incluido" does not add, a null quantity multiplies by one', () => {
    expect(itemAmountCents({ quantity: 5, unitPriceCents: null })).toBeNull();
    expect(itemAmountCents({ quantity: null, unitPriceCents: 950000 })).toBe(950000);
    expect(computeTotals([item({ unitPriceCents: null })], 1600, null).oneTime.totalCents).toBe(0);
  });

  it("rounds IVA per column, not over the sum", () => {
    // 0.33 y 0.33 al 16 %: cada columna redondea 5.28 → 5; sobre la suma serían 11.
    const totals = computeTotals([item({ unitPriceCents: 33 }), item({ unitPriceCents: 33, recurrence: "monthly" })], 1600, "monthly");
    expect(totals.oneTime.ivaCents + totals.recurring.ivaCents).toBe(10);
  });
});

describe("lifecycle", () => {
  it("composes the folio with a 4-digit sequence", () => {
    expect(composeFolio("WX", 2026, 1)).toBe("WX-2026-0001");
    expect(composeFolio("WX", 2027, 12345)).toBe("WX-2027-12345");
  });

  it("derives expired from an issued proposal past its validity, never from other states", () => {
    expect(expiryDate("2026-11-14", 30)).toBe("2026-12-14");
    expect(effectiveStatus("issued", "2026-12-14", "2026-12-14")).toBe("issued");
    expect(effectiveStatus("issued", "2026-12-14", "2026-12-15")).toBe("expired");
    expect(effectiveStatus("accepted", "2026-12-14", "2027-01-01")).toBe("accepted");
    expect(effectiveStatus("draft", "2026-12-14", "2027-01-01")).toBe("draft");
  });

  it("an issued proposal is immutable and terminal states stay terminal", () => {
    expect(canTransition("draft", "issued")).toBe(true);
    expect(canTransition("issued", "draft")).toBe(false);
    expect(canTransition("expired", "accepted")).toBe(true);
    expect(canTransition("expired", "rejected")).toBe(false);
    for (const to of ["draft", "issued", "accepted", "rejected", "cancelled"] as const) {
      expect(canTransition("accepted", to)).toBe(false);
      expect(canTransition("cancelled", to)).toBe(false);
    }
  });
});

describe("validation", () => {
  it("accepts every product's suggested proposal as a draft", () => {
    for (const p of PRODUCT_LIST) expect(validateProposalInput(inputFor(p.key)).ok).toBe(true);
  });

  it("enforces the per-product item limit — 3 for SentinelOne, 4 for MSP360, not 5", () => {
    expect(PRODUCTS.sentinelone.maxItems).toBe(3);
    expect(PRODUCTS.msp360.maxItems).toBe(4);
    const base = inputFor("sentinelone");
    expect(validateProposalInput({ ...base, items: [...base.items, item({})] }).ok).toBe(false);
  });

  it("rejects recurring items on a single-total product and annual items on a monthly proposal", () => {
    const s1 = inputFor("sentinelone");
    expect(validateProposalInput({ ...s1, items: [item({ recurrence: "monthly" })] }).ok).toBe(false);
    const m365 = inputFor("microsoft365", { billingPeriod: "monthly" });
    expect(validateProposalInput({ ...m365, items: [item({ recurrence: "annual", termLabel: "Anual" })] }).ok).toBe(false);
  });

  it("rejects a plan the product does not have and normalizes a product without plans", () => {
    expect(validateProposalInput(inputFor("sentinelone", { planKey: "prem" })).ok).toBe(false);
    const msp = validateProposalInput(inputFor("msp360", { planKey: null, billingPeriod: "annual" }));
    expect(msp.ok && msp.data.planKey).toBe("default");
    // MSP360 solo admite mensual: el periodo se normaliza a lo que el catálogo permite.
    expect(msp.ok && msp.data.billingPeriod).toBe("monthly");
  });

  it("blocks issuing until some item has a price", () => {
    expect(issueBlockers(inputFor("msp360"))).toHaveLength(1);
    expect(issueBlockers({ items: [item({ unitPriceCents: 100 })] })).toHaveLength(0);
  });
});

describe("document", () => {
  it("numbers sections by layout: four with the comparison, three without", () => {
    const s1 = renderProposalHtml(buildDocument(inputFor("sentinelone"), null));
    expect(s1).toContain('<div class="n">04</div><h2>Términos y condiciones</h2>');
    expect(s1).toContain("Comparativo de paquetes");
    const msp = renderProposalHtml(buildDocument(inputFor("msp360"), null));
    expect(msp).toContain('<div class="n">03</div><h2>Términos y condiciones</h2>');
    expect(msp).not.toContain("Comparativo de paquetes");
  });

  it("escapes what the user typed", () => {
    const html = renderProposalHtml(buildDocument(inputFor("msp360", { clientName: '<script>alert("x")</script>' }), null));
    expect(html).not.toContain('<script>alert("x")</script>');
    expect(html).toContain("&lt;script&gt;");
  });

  it("marks a draft and titles an issued document with its folio", () => {
    expect(renderProposalHtml(buildDocument(inputFor("msp360"), null))).toContain("BORRADOR");
    const issued = renderProposalHtml(buildDocument(inputFor("msp360"), { folio: "WX-2026-0007", issuedAt: "2026-11-14T00:00:00Z" }));
    expect(issued).not.toContain("BORRADOR");
    expect(issued).toContain("<title>WX-2026-0007 · Cliente de prueba");
  });

  it("the Microsoft 365 recurring column follows the billing period", () => {
    const annual = buildDocument(inputFor("microsoft365", { billingPeriod: "annual" }), null);
    expect(annual.totals.recurringHeader).toBe("Anualidad");
    const monthly = buildDocument(inputFor("microsoft365", { billingPeriod: "monthly" }), null);
    expect(monthly.totals.recurringHeader).toBe("Mensualidad");
    expect(monthly.termsHtml[0][1]).toContain("renovación mensual");
  });

  it("never prints a grand total adding both columns", () => {
    const input = inputFor("msp360", {
      items: [item({ unitPriceCents: 1800000 }), item({ quantity: 25, unitPriceCents: 18000, recurrence: "monthly", termLabel: "Mensual" })],
    });
    const html = renderProposalHtml(buildDocument(input, null));
    expect(html).toContain("$20,880.00");
    expect(html).toContain("$5,220.00");
    expect(html).not.toContain(formatCents(2088000 + 522000));
  });
});
