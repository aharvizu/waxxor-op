import { auth } from "@/auth";
import { canAccessInternalPortal } from "@/lib/roles";
import { searchArticlesForPalette } from "@/lib/knowledge-data";
import { searchTutorialsForPalette } from "@/lib/help-data";

/**
 * Live global search backing the Command Palette (⌘K): published KB articles
 * + active Help tutorials matching the query. Org-scoped for articles;
 * tutorials are global product content (see schema.ts comment).
 */
export async function GET(req: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user || !user.organizationId || !canAccessInternalPortal(user.role)) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return Response.json({ articles: [], tutorials: [] });

  const [articles, tutorials] = await Promise.all([
    searchArticlesForPalette(user.organizationId, q, 5),
    searchTutorialsForPalette(q, 5),
  ]);

  return Response.json({ articles, tutorials });
}
