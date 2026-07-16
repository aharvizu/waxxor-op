import { describe, expect, it } from "vitest";
import {
  ROLES,
  canAccessInternalPortal,
  canManageUsers,
  hasRole,
  normalizeRole,
} from "./roles";

describe("legacy role migration mapping (drizzle/0003)", () => {
  it("maps legacy admin to superadmin", () => {
    expect(normalizeRole("admin")).toBe("superadmin");
  });

  it("maps legacy member to technician", () => {
    expect(normalizeRole("member")).toBe("technician");
  });

  it("keeps the six official roles unchanged", () => {
    for (const role of ROLES) expect(normalizeRole(role)).toBe(role);
  });

  it("falls back to the least-privileged internal role for unknown values", () => {
    expect(normalizeRole("bogus")).toBe("technician");
    expect(normalizeRole(null)).toBe("technician");
    expect(normalizeRole(undefined)).toBe("technician");
  });
});

describe("authorization policy", () => {
  it("grants superadmin any role check (total access)", () => {
    expect(hasRole("superadmin", [])).toBe(true);
    expect(hasRole("superadmin", ["technician"])).toBe(true);
    expect(canManageUsers("superadmin")).toBe(true);
    expect(canAccessInternalPortal("superadmin")).toBe(true);
  });

  it("rejects technician for user administration", () => {
    expect(canManageUsers("technician")).toBe(false);
    expect(hasRole("technician", ["superadmin"])).toBe(false);
  });

  it("rejects every non-superadmin role for user administration", () => {
    for (const role of ROLES.filter((r) => r !== "superadmin")) {
      expect(canManageUsers(role)).toBe(false);
    }
  });

  it("rejects client accounts for the internal portal", () => {
    expect(canAccessInternalPortal("client")).toBe(false);
  });

  it("admits every internal role to the portal", () => {
    for (const role of ROLES.filter((r) => r !== "client")) {
      expect(canAccessInternalPortal(role)).toBe(true);
    }
  });

  it("hasRole matches listed roles without superadmin shortcut", () => {
    expect(hasRole("director", ["director", "project_manager"])).toBe(true);
    expect(hasRole("client", ["director"])).toBe(false);
  });
});
