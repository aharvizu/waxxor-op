import { describe, expect, it } from "vitest";
import { CHANNEL_ADAPTERS, REGISTRABLE_CHANNELS, channelAdapter } from "./channels";
import {
  CONVERSATION_STATUSES,
  canEditMessage,
  canSoftDeleteMessage,
  conversationStatusMeta,
  isConversationStatus,
} from "./conversations";

const base = { authorUserId: 7, direction: "outbound", deletedAt: null };

describe("message ownership rules", () => {
  it("author can edit and soft-delete their own message", () => {
    expect(canEditMessage(base, 7)).toBe(true);
    expect(canSoftDeleteMessage(base, 7)).toBe(true);
  });

  it("other users cannot edit or delete", () => {
    expect(canEditMessage(base, 8)).toBe(false);
    expect(canSoftDeleteMessage(base, 8)).toBe(false);
  });

  it("deleted messages are frozen", () => {
    const deleted = { ...base, deletedAt: new Date() };
    expect(canEditMessage(deleted, 7)).toBe(false);
    expect(canSoftDeleteMessage(deleted, 7)).toBe(false);
  });

  it("system events are never editable, even by their actor", () => {
    expect(canEditMessage({ ...base, direction: "system" }, 7)).toBe(false);
  });

  it("internal notes follow the same ownership rule", () => {
    expect(canEditMessage({ ...base, direction: "internal" }, 7)).toBe(true);
  });
});

describe("conversation statuses", () => {
  it("exposes exactly the four spec statuses with labels", () => {
    expect(CONVERSATION_STATUSES).toEqual(["open", "pending", "closed", "archived"]);
    for (const s of CONVERSATION_STATUSES) {
      expect(conversationStatusMeta[s]?.label).toBeTruthy();
    }
  });

  it("rejects unknown statuses (legacy 'attended' is migrated, not accepted)", () => {
    expect(isConversationStatus("open")).toBe(true);
    expect(isConversationStatus("attended")).toBe(false);
    expect(isConversationStatus("nonsense")).toBe(false);
  });
});

describe("channel adapters", () => {
  it("declares the five architecture channels", () => {
    expect(Object.keys(CHANNEL_ADAPTERS).sort()).toEqual(["api", "email", "internal", "teams", "whatsapp"]);
  });

  it("only internal is configured; delivery succeeds without external refs", async () => {
    expect(CHANNEL_ADAPTERS.internal.configured).toBe(true);
    const result = await CHANNEL_ADAPTERS.internal.deliver({ conversationId: 1, body: "hola", contactId: null });
    expect(result).toEqual({ ok: true, externalRef: null });
  });

  it("external channels report not_configured instead of throwing", async () => {
    for (const key of ["whatsapp", "email", "teams", "api"] as const) {
      const adapter = CHANNEL_ADAPTERS[key];
      expect(adapter.configured).toBe(false);
      const result = await adapter.deliver({ conversationId: 1, body: "hola", contactId: null });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("not_configured");
    }
  });

  it("channelAdapter resolves known keys and rejects unknown ones", () => {
    expect(channelAdapter("internal")?.key).toBe("internal");
    expect(channelAdapter("phone")).toBeNull(); // registrable, but not an adapter
    expect(channelAdapter("smoke-signals")).toBeNull();
  });

  it("registrable channels never claim to send externally", () => {
    for (const c of REGISTRABLE_CHANNELS.filter((c) => c.value !== "internal")) {
      expect(c.label.toLowerCase()).toMatch(/registro|otro/);
    }
  });
});
