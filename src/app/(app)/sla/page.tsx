import { redirect } from "next/navigation";

/**
 * Navigation consolidation (2026-07-20): SLA now lives only inside Settings
 * (regla R7 — SuperAdmin only). This stub keeps old bookmarks/links working.
 */
export default function SlaRedirect() {
  redirect("/settings/sla");
}
