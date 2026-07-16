import { describe, expect, it } from "vitest";
import { z } from "zod";
import { diffFields } from "./audit";
import { parseForm } from "./action-result";

describe("organizationId cannot come from the browser", () => {
  it("parseForm strips organizationId (and any unknown key) from FormData", () => {
    const schema = z.object({ name: z.string().trim().min(1) });
    const formData = new FormData();
    formData.set("name", "Acme");
    formData.set("organizationId", "999"); // tampering attempt

    const { data, error } = parseForm(schema, formData);
    expect(error).toBeNull();
    expect(data).toEqual({ name: "Acme" });
    expect(data && "organizationId" in data).toBe(false);
  });

  it("parseForm ignores organizationId even when other fields fail validation", () => {
    const schema = z.object({ name: z.string().trim().min(1) });
    const formData = new FormData();
    formData.set("name", "");
    formData.set("organizationId", "999");

    const { data, error } = parseForm(schema, formData);
    expect(data).toBeNull();
    expect(error && error.ok).toBe(false);
  });
});

describe("audit events carry organizationId", () => {
  it("diffFields stamps the base organizationId on every generated event", () => {
    type Rec = { name: string; phone: string; notes: string | null };
    const before: Rec = { name: "Old", phone: "1", notes: null };
    const after: Rec = { name: "New", phone: "1", notes: "hi" };
    const events = diffFields(
      { organizationId: 7, userId: 1, entityType: "client", entityId: 42 },
      before,
      after,
      ["name", "phone", "notes"] as const,
    );
    expect(events).toHaveLength(2); // name and notes changed, phone did not
    for (const e of events) {
      expect(e.organizationId).toBe(7);
      expect(e.action).toBe("update");
    }
  });

  it("AuditEvent requires organizationId at the type level", () => {
    // @ts-expect-error — organizationId is mandatory on AuditEvent
    const bad: import("./audit").AuditEvent = {
      entityType: "client",
      entityId: 1,
      action: "create",
    };
    expect(bad).toBeDefined();
  });
});
