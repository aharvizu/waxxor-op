import { describe, expect, it } from "vitest";
import { timeEntryAccessFor } from "./time-entry-access";

describe("time entry access", () => {
  it("leaves an open ticket fully editable", () => {
    expect(timeEntryAccessFor({ isClosed: false, isInvoiced: false })).toBe("full");
  });

  it("keeps a closed ticket's charge editable", () => {
    expect(timeEntryAccessFor({ isClosed: true, isInvoiced: false })).toBe("billing");
  });

  it("freezes everything once invoiced, closed or not", () => {
    expect(timeEntryAccessFor({ isClosed: true, isInvoiced: true })).toBe("read");
    expect(timeEntryAccessFor({ isClosed: false, isInvoiced: true })).toBe("read");
  });
});
