import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/db";
import { companies, itemFavorites, projects, recurrenceDefinitions, savedViewPreferences, savedViews, tickets, workItems } from "@/db/schema";
import type { SearchContext, SearchResultItem } from "./types";

/**
 * "Favoritos" and "Vistas favoritas" for the Command Center's empty state —
 * real backend data (item_favorites + saved_view_preferences), not a stub.
 * "Elementos recientes" and "búsquedas recientes" are tracked client-side
 * (localStorage, see components/shell/recent-items.ts) since they're a
 * per-browser UX affordance, not organizational data.
 */
export async function getFavoriteItems(ctx: SearchContext, limit = 8): Promise<SearchResultItem[]> {
  const favs = await db
    .select({ module: itemFavorites.module, entityId: itemFavorites.entityId })
    .from(itemFavorites)
    .where(and(eq(itemFavorites.organizationId, ctx.orgId), eq(itemFavorites.userId, ctx.userId)))
    .limit(limit * 2);
  if (favs.length === 0) return [];

  const idsByModule = new Map<string, number[]>();
  for (const f of favs) idsByModule.set(f.module, [...(idsByModule.get(f.module) ?? []), f.entityId]);

  const items: SearchResultItem[] = [];

  const ticketIds = idsByModule.get("tickets");
  if (ticketIds?.length) {
    const rows = await db
      .select({ id: tickets.id, folio: tickets.folio, title: workItems.title })
      .from(tickets)
      .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
      .where(inArray(tickets.id, ticketIds));
    for (const r of rows) items.push({ id: `tickets:${r.id}`, category: "tickets", iconKey: "ticket", title: `${r.folio} · ${r.title}`, route: `/helpdesk/${r.id}`, rank: 1 });
  }

  const projectIds = idsByModule.get("projects");
  if (projectIds?.length) {
    const rows = await db.select({ id: projects.id, name: projects.name }).from(projects).where(inArray(projects.id, projectIds));
    for (const r of rows) items.push({ id: `projects:${r.id}`, category: "projects", iconKey: "project", title: r.name, route: `/projects/${r.id}`, rank: 1 });
  }

  const companyIds = idsByModule.get("companies");
  if (companyIds?.length) {
    const rows = await db.select({ id: companies.id, name: companies.name }).from(companies).where(inArray(companies.id, companyIds));
    for (const r of rows) items.push({ id: `companies:${r.id}`, category: "companies", iconKey: "company", title: r.name, route: `/companies/${r.id}`, rank: 1 });
  }

  const recurringIds = idsByModule.get("recurring");
  if (recurringIds?.length) {
    const rows = await db.select({ id: recurrenceDefinitions.id, name: recurrenceDefinitions.name }).from(recurrenceDefinitions).where(inArray(recurrenceDefinitions.id, recurringIds));
    for (const r of rows) items.push({ id: `recurring:${r.id}`, category: "recurring", iconKey: "recurring", title: r.name, route: `/recurring/${r.id}`, rank: 1 });
  }

  return items.slice(0, limit);
}

const MODULE_BASE_PATH: Record<string, string> = { tickets: "/helpdesk", projects: "/projects", activities: "/activities", recurring: "/recurring" };

export async function getFavoriteViews(ctx: SearchContext, limit = 8): Promise<SearchResultItem[]> {
  const rows = await db
    .select({ id: savedViews.id, name: savedViews.name, module: savedViews.module })
    .from(savedViewPreferences)
    .innerJoin(savedViews, eq(savedViews.id, savedViewPreferences.viewId))
    .where(and(eq(savedViewPreferences.userId, ctx.userId), eq(savedViewPreferences.isFavorite, true), eq(savedViews.organizationId, ctx.orgId)))
    .limit(limit);

  return rows
    .filter((r) => MODULE_BASE_PATH[r.module])
    .map((r) => ({
      id: `views:${r.id}`,
      category: "views" as const,
      iconKey: "view" as const,
      title: r.name,
      description: r.module,
      route: `${MODULE_BASE_PATH[r.module]}?view=${r.id}`,
      rank: 1 as const,
    }));
}
