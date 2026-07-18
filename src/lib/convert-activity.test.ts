import { describe, expect, it } from "vitest";
import { conversionBlockReason } from "./convert-activity";

const base = {
  convertedAt: null,
  archivedAt: null,
  status: "pending",
  finalClientId: 5,
  confirmCancelled: false,
};

describe("conversion guard rules", () => {
  it("allows a normal activity with a client", () => {
    expect(conversionBlockReason(base)).toBeNull();
  });

  it("rejects an activity without a client (PRD: tickets belong to a client)", () => {
    expect(conversionBlockReason({ ...base, finalClientId: null })).toBe("no_client");
  });

  it("rejects an archived activity", () => {
    expect(conversionBlockReason({ ...base, archivedAt: new Date() })).toBe("archived");
  });

  it("rejects an already converted activity (no second conversion, no second WorkItem)", () => {
    expect(conversionBlockReason({ ...base, convertedAt: new Date() })).toBe(
      "already_converted",
    );
  });

  it("requires explicit confirmation for cancelled activities", () => {
    expect(conversionBlockReason({ ...base, status: "cancelled" })).toBe(
      "needs_confirmation",
    );
    expect(
      conversionBlockReason({ ...base, status: "cancelled", confirmCancelled: true }),
    ).toBeNull();
  });

  it("allows completed activities (ticket will start as open)", () => {
    expect(conversionBlockReason({ ...base, status: "completed" })).toBeNull();
  });

  it("checks blocks in priority order: converted > archived > client", () => {
    expect(
      conversionBlockReason({
        ...base,
        convertedAt: new Date(),
        archivedAt: new Date(),
        finalClientId: null,
      }),
    ).toBe("already_converted");
  });

  it("requires explicit confirmation for project activities (they leave the project)", () => {
    expect(conversionBlockReason({ ...base, projectId: 7 })).toBe(
      "needs_project_confirmation",
    );
    expect(
      conversionBlockReason({ ...base, projectId: 7, confirmProject: true }),
    ).toBeNull();
  });

  it("blocks conversion while the activity has subactivities", () => {
    expect(
      conversionBlockReason({ ...base, projectId: 7, confirmProject: true, hasSubactivities: true }),
    ).toBe("has_subactivities");
  });
});
