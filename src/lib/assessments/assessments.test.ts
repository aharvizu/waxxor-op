import { describe, expect, it } from "vitest";
import { PRODUCTS } from "@/lib/proposals/catalog";
import { ALL_QUESTIONS, answerLabel, sanitizeAnswers } from "./questionnaire";
import { assessmentPrefill, deriveOpportunities } from "./recommendations";

describe("questionnaire", () => {
  it("has unique question keys — answers are stored by key", () => {
    const keys = ALL_QUESTIONS.map((q) => q.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("keeps only answers that match the questionnaire", () => {
    const clean = sanitizeAnswers({
      "profile.users": "25",
      "profile.devices": "-3",
      "email.platform": "hosting",
      "email.mfa": "made-up",
      "backups.scope": ["servers", "bogus"],
      "domains.renewal": "mañana",
      "not.a.question": "x",
      "people.incidents": "   ",
    });
    expect(clean).toEqual({ "profile.users": "25", "email.platform": "hosting", "backups.scope": ["servers"] });
  });

  it("renders select and multi answers with their labels", () => {
    const q = ALL_QUESTIONS.find((x) => x.key === "email.platform")!;
    expect(answerLabel(q, { "email.platform": "m365" })).toBe("Microsoft 365");
    expect(answerLabel(q, {})).toBeNull();
  });
});

describe("opportunities", () => {
  it("derives nothing from an empty assessment", () => {
    expect(deriveOpportunities({})).toEqual([]);
  });

  it("cites the finding behind each opportunity", () => {
    const found = deriveOpportunities({
      "email.platform": "hosting",
      "email.office": "perpetual",
      "endpoints.type": "antivirus",
      "backups.offsite": "no",
      "backups.restore_test": "never",
      "people.training_interest": "yes",
      "domains.owner": "employee",
    });
    expect(found.map((o) => o.key)).toEqual(["microsoft365", "sentinelone", "msp360", "training", "domains"]);
    expect(found[0].planKey).toBe("std");
    expect(found.every((o) => o.reasons.length > 0)).toBe(true);
    // Sin plantilla de propuesta no hay producto que cotizar.
    expect(found[3].productKey).toBeNull();
  });

  it("points an existing Microsoft 365 tenant with gaps to Premium", () => {
    const [m365] = deriveOpportunities({ "email.platform": "m365", "email.mfa": "none" });
    expect(m365.planKey).toBe("prem");
  });

  it("a healthy environment produces no opportunity", () => {
    expect(
      deriveOpportunities({
        "email.platform": "m365",
        "email.mfa": "all",
        "email.filtering": "advanced",
        "endpoints.type": "edr",
        "backups.offsite": "yes",
        "backups.restore_test": "recent",
      }),
    ).toEqual([]);
  });
});

describe("proposal prefill", () => {
  const answers = { "email.mailboxes": "40", "profile.users": "45", "profile.devices": "30", "profile.servers": "2", "backups.volume_tb": "3" };
  const suggested = (key: keyof typeof PRODUCTS) => {
    const p = PRODUCTS[key];
    return p.suggestedItems({ planKey: p.defaultPlan, period: p.periods[0] ?? null, validityDays: 30 });
  };

  it("mailboxes become Microsoft 365 licenses, endpoints become agents, TB become storage", () => {
    expect(assessmentPrefill("microsoft365", answers, suggested("microsoft365"))[0].quantity).toBe(40);
    expect(assessmentPrefill("sentinelone", answers, suggested("sentinelone"))[0].quantity).toBe(32);
    const msp = assessmentPrefill("msp360", answers, suggested("msp360"));
    expect([msp[0].quantity, msp[1].quantity]).toEqual([32, 3]);
  });

  it("never touches prices and leaves quantities alone without data", () => {
    const base = suggested("sentinelone");
    const out = assessmentPrefill("sentinelone", {}, base);
    expect(out).toEqual(base);
    expect(assessmentPrefill("sentinelone", answers, base).map((i) => i.unitPriceCents)).toEqual(base.map((i) => i.unitPriceCents));
  });
});
