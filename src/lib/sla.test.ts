import { describe, expect, it } from "vitest";
import { isSlaPauseStatus } from "./sla";

describe("isSlaPauseStatus", () => {
  it("pauses only the waiting category — Waiting customer/Waiting third party, and any custom 'en espera' status", () => {
    expect(isSlaPauseStatus("waiting")).toBe(true);
    expect(isSlaPauseStatus("open")).toBe(false);
    expect(isSlaPauseStatus("in_progress")).toBe(false);
    expect(isSlaPauseStatus("resolved")).toBe(false);
    expect(isSlaPauseStatus("closed")).toBe(false);
    expect(isSlaPauseStatus("cancelled")).toBe(false);
  });
});
