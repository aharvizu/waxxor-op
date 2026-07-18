import type { ReactNode } from "react";
import { requireRole } from "@/lib/session";
import { SettingsNav } from "./settings-nav";

/**
 * Configuration module (E-02). Business sections: SuperAdmin + Administrator.
 * Technical sections (users, roles, API keys, environment, health details)
 * additionally gate themselves to SuperAdmin inside their own pages — this
 * layout is the outer boundary.
 */
export default async function SettingsLayout({ children }: { children: ReactNode }) {
  const user = await requireRole("superadmin", "administrator");

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      <SettingsNav isSuperadmin={user.role === "superadmin"} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
