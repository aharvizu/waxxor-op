import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { signOut } from "@/auth";
import { canAccessInternalPortal } from "@/lib/roles";
import { getAuthUser } from "@/lib/session";
import { buttonClass, buttonSecondaryClass } from "@/components/ui";

export const metadata: Metadata = { title: "No access" };

/**
 * Two distinct denial states share this page (UX audit, 2026-07-20):
 *   1. `client`-role accounts — no internal portal access at all (customer
 *      portal is future scope).
 *   2. An internal role hitting a page above its permission (?reason=role) —
 *      previously a silent redirect to "/" with no explanation.
 * An internal user with no reason param has nothing to see here — send them
 * home instead of looping.
 */
export default async function NoAccessPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const [user, { reason }] = await Promise.all([getAuthUser(), searchParams]);
  if (!user) redirect("/login");

  const insufficientRole = reason === "role" && canAccessInternalPortal(user.role);
  if (!insufficientRole && canAccessInternalPortal(user.role)) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-xl border border-edge bg-surface p-8 text-center shadow-card">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl border border-edge bg-subtle text-muted">
          <ShieldAlert className="size-5" />
        </div>
        {insufficientRole ? (
          <>
            <h1 className="text-lg font-semibold text-fg">No tienes permiso para esta sección</h1>
            <p className="mt-2 text-sm text-muted">
              Tu rol actual no incluye acceso a esta pantalla. Si crees que deberías tenerlo, contacta
              a un Administrator o SuperAdmin.
            </p>
            <Link href="/today" className={`${buttonClass} mt-6 inline-flex`}>
              Volver a Hoy
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-fg">No portal access</h1>
            <p className="mt-2 text-sm text-muted">
              Your account ({user.email}) is a client account and does not have
              access to the Waxxor Ops internal portal. If you believe this is a
              mistake, contact your Waxxor representative.
            </p>
            <form
              className="mt-6"
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/login" });
              }}
            >
              <button type="submit" className={buttonSecondaryClass}>
                Sign out
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
