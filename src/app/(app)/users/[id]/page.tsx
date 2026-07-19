import { redirect } from "next/navigation";

/**
 * Navigation consolidation (2026-07-20): Users now lives only inside
 * Settings. This stub keeps old bookmarks/links working.
 */
export default async function UserRedirect({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/settings/users/${id}`);
}
