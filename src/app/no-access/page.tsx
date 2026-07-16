import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { signOut } from "@/auth";
import { canAccessInternalPortal } from "@/lib/roles";
import { getAuthUser } from "@/lib/session";
import { buttonSecondaryClass } from "@/components/ui";

export const metadata: Metadata = { title: "No access" };

/**
 * Landing page for authenticated client-role accounts: they can sign in, but
 * the internal portal is staff-only (the customer portal is future scope).
 */
export default async function NoAccessPage() {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  if (canAccessInternalPortal(user.role)) redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-xl border border-edge bg-surface p-8 text-center shadow-card">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl border border-edge bg-subtle text-muted">
          <ShieldAlert className="size-5" />
        </div>
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
      </div>
    </main>
  );
}
