import { userRole } from "@/db/schema";

/** The six official Watson roles (PRD §7). */
export type Role = (typeof userRole.enumValues)[number];

export const ROLES = userRole.enumValues;

/** Roles allowed into the internal portal — everyone except client accounts. */
export const INTERNAL_ROLES = ROLES.filter((r) => r !== "client");

/**
 * True when `role` is one of `allowed`. SuperAdmin always passes:
 * total access is a product rule (PRD), not a per-check decision.
 */
export function hasRole(role: Role, allowed: readonly Role[]): boolean {
  return role === "superadmin" || allowed.includes(role);
}

/** Client accounts have no access to the internal portal (customer portal is future scope). */
export function canAccessInternalPortal(role: Role): boolean {
  return role !== "client";
}

/** Only SuperAdmin may see or modify users. */
export function canManageUsers(role: Role): boolean {
  return role === "superadmin";
}

/**
 * Mapping used by migration drizzle/0003: legacy admin → superadmin,
 * legacy member → technician. Also normalizes roles from JWTs issued
 * before the migration, so stale sessions keep working with the
 * equivalent new role instead of an invalid value.
 */
export function normalizeRole(value: unknown): Role {
  if (value === "admin") return "superadmin";
  if (value === "member") return "technician";
  if (typeof value === "string" && (ROLES as readonly string[]).includes(value)) {
    return value as Role;
  }
  // Unknown/missing → least-privileged internal role, same floor as before.
  return "technician";
}
