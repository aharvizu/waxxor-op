import { auth } from "@/auth";
import { canAccessInternalPortal } from "@/lib/roles";
import { runSearch, type SearchGroup } from "@/lib/search/engine";
import { getFavoriteItems, getFavoriteViews } from "@/lib/search/favorites";
import { allQuickActions } from "@/lib/search/sources/actions";
import "@/lib/search/sources"; // registers every source as a side effect — see sources/index.ts
import type { SearchCategory } from "@/lib/search/types";

/**
 * The Command Center's single backend endpoint. All ranking/grouping logic
 * lives in the Search Engine (src/lib/search/engine.ts) — this route only
 * authenticates the caller and forwards their org/role.
 */
export async function GET(req: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user || !user.organizationId || !canAccessInternalPortal(user.role)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const category = (url.searchParams.get("category") as SearchCategory | null) ?? undefined;
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 20) : undefined;

  const ctx = { orgId: user.organizationId, userId: Number(user.id), role: user.role };

  if (!q) {
    // Empty query: recent/favorites/quick-actions state, not a live search
    // — "elementos recientes" are tracked client-side (localStorage), so
    // this only returns what the server actually knows: favorites + the
    // full quick-action list.
    const [favoriteItems, favoriteViews] = await Promise.all([getFavoriteItems(ctx), getFavoriteViews(ctx)]);
    const groups: SearchGroup[] = [];
    if (favoriteItems.length > 0) groups.push({ category: "activities", label: "Favoritos", iconKey: "activity", items: favoriteItems });
    if (favoriteViews.length > 0) groups.push({ category: "views", label: "Vistas favoritas", iconKey: "view", items: favoriteViews });
    groups.push({ category: "actions", label: "Acciones rápidas", iconKey: "action", items: allQuickActions() });
    return Response.json({ query: "", groups, total: groups.reduce((s, g) => s + g.items.length, 0) });
  }

  const result = await runSearch(ctx, q, { category, limit });
  return Response.json(result);
}
