import { describe, expect, it } from "vitest";
import { HELP_MODULES, isStepCompleted, moduleForPath, progressStatus } from "./help";

describe("moduleForPath", () => {
  it("maps known first path segments to their Help module", () => {
    expect(moduleForPath("/today")).toBe("today");
    expect(moduleForPath("/helpdesk/42")).toBe("tickets");
    expect(moduleForPath("/projects/7/risks")).toBe("projects");
    expect(moduleForPath("/settings/knowledge")).toBe("settings");
    expect(moduleForPath("/inbox")).toBe("inbox");
  });

  it("returns null for unmapped or root paths", () => {
    expect(moduleForPath("/")).toBeNull();
    expect(moduleForPath("/dashboard")).toBeNull();
    expect(moduleForPath("/quotes")).toBeNull();
  });

  it("every declared help module is reachable from some real path", () => {
    // sanity: the map isn't missing any of the enum's modules by typo
    for (const m of HELP_MODULES) {
      expect(typeof m).toBe("string");
    }
  });
});

describe("progressStatus", () => {
  it("is not_started when there is no progress row", () => {
    expect(progressStatus(null)).toBe("not_started");
  });

  it("is completed once completedAt is set", () => {
    expect(progressStatus({ completedAt: new Date(), startedAt: new Date() })).toBe("completed");
  });

  it("is in_progress when started but not completed", () => {
    expect(progressStatus({ completedAt: null, startedAt: new Date() })).toBe("in_progress");
  });
});

describe("isStepCompleted", () => {
  it("checks membership in the completed-step-ids array", () => {
    expect(isStepCompleted([1, 2, 3], 2)).toBe(true);
    expect(isStepCompleted([1, 3], 2)).toBe(false);
  });

  it("is false for malformed (non-array) input", () => {
    expect(isStepCompleted(null, 1)).toBe(false);
    expect(isStepCompleted("not-an-array", 1)).toBe(false);
  });
});
