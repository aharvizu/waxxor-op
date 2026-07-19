import { redirect } from "next/navigation";

/**
 * Navigation consolidation (2026-07-20): Users now lives only inside
 * Settings. This stub keeps old bookmarks/links working.
 */
export default function UsersRedirect() {
  redirect("/settings/users");
}
