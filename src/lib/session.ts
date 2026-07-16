import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canAccessInternalPortal, hasRole, type Role } from "@/lib/roles";

export type SessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
  role: Role;
  /** The organization every query and mutation must be scoped to. */
  organizationId: number;
};

type MaybeOrgUser = Omit<SessionUser, "organizationId"> & {
  organizationId: number | null;
};

/** The signed-in user, or null. Never redirects — for optional-auth spots. */
export async function getAuthUser(): Promise<MaybeOrgUser | null> {
  const session = await auth();
  return session?.user ?? null;
}

/**
 * Signed-in internal user or redirect: /login when anonymous or when the JWT
 * predates the organization migration (one forced re-login refreshes it),
 * /no-access for client-role accounts. The returned user always carries
 * organizationId — scope every query with it.
 * Use at the top of every page and server action.
 */
export async function requireUser(): Promise<SessionUser> {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  if (!canAccessInternalPortal(user.role)) redirect("/no-access");
  if (user.organizationId === null) redirect("/login");
  return user as SessionUser;
}

/**
 * Like requireUser, but the role must be one of `roles`.
 * SuperAdmin always passes (total access). Others are sent to the dashboard.
 */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!hasRole(user.role, roles)) redirect("/");
  return user;
}
