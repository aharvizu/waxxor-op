import { describe, expect, it } from "vitest";
import { parseWorkPeekToken, workDetailHref, workPeekToken, type WorkPeekTarget } from "./work-peek";

describe("work quick-view token", () => {
  it("round-trips every target, so the link and the parser cannot drift apart", () => {
    const targets: WorkPeekTarget[] = [
      { type: "ticket", entityId: 322 },
      { type: "activity", entityId: 322 },
      { type: "ticket", entityId: 1 },
      { type: "activity", entityId: 999999 },
    ];
    for (const target of targets) {
      expect(parseWorkPeekToken(workPeekToken(target))).toEqual(target);
    }
  });

  it("keeps the two types apart at the same id", () => {
    // The id is the specialization id, so ticket #322 and activity #322 both
    // exist — only the prefix tells the page which row to open.
    expect(workPeekToken({ type: "ticket", entityId: 322 })).toBe("t:322");
    expect(workPeekToken({ type: "activity", entityId: 322 })).toBe("a:322");
  });

  it("rejects anything that is not a token instead of guessing", () => {
    for (const bad of [undefined, null, "", "322", "x:322", "t:", "t:abc", "t:322:1", " t:322", "T:322"]) {
      expect(parseWorkPeekToken(bad)).toBeNull();
    }
  });
});

describe("work detail href", () => {
  it("routes each type to its own module", () => {
    expect(workDetailHref({ type: "ticket", entityId: 322 })).toBe("/helpdesk/322");
    expect(workDetailHref({ type: "activity", entityId: 45 })).toBe("/activities/45");
  });

  it("lives here so both runtimes can call it", () => {
    // Regression guard for 2026-11-08: this used to be exported from the
    // "use client" work-views module, so the server-rendered quick view threw
    // "Attempted to call workHref() from the server" the moment it opened.
    // Being in a pure module is the fix; client-boundary.test.ts enforces it.
    const token = workPeekToken({ type: "activity", entityId: 45 });
    const parsed = parseWorkPeekToken(token)!;
    expect(workDetailHref(parsed)).toBe("/activities/45");
  });
});
