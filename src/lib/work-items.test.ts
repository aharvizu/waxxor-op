import { describe, expect, it } from "vitest";
import {
  WORK_ITEM_TYPES,
  isWorkItemType,
  workItemPrioritySchema,
  workItemStatusSchema,
  workItemTypeSchema,
} from "./work-items";

describe("work item type validation", () => {
  it("exposes exactly the three initial types", () => {
    expect(WORK_ITEM_TYPES).toEqual(["activity", "ticket", "project_activity"]);
  });

  it("accepts valid types", () => {
    for (const t of WORK_ITEM_TYPES) {
      expect(isWorkItemType(t)).toBe(true);
      expect(workItemTypeSchema.safeParse(t).success).toBe(true);
    }
  });

  it("rejects invalid types", () => {
    for (const bad of ["task", "TICKET", "", null, undefined, 3]) {
      expect(isWorkItemType(bad)).toBe(false);
      expect(workItemTypeSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("status and priority schemas match the helpdesk sets", () => {
    expect(workItemStatusSchema.safeParse("waiting_on_customer").success).toBe(true);
    expect(workItemStatusSchema.safeParse("todo").success).toBe(false);
    expect(workItemPrioritySchema.safeParse("critical").success).toBe(true);
    expect(workItemPrioritySchema.safeParse("urgent").success).toBe(false);
  });
});
