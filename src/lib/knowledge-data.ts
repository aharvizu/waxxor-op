import { and, asc, desc, eq, exists, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  companies,
  knowledgeArticleFavorites,
  knowledgeArticleRelations,
  knowledgeArticleVersions,
  knowledgeArticles,
  knowledgeCategories,
  projects,
  tickets,
  users,
  workItems,
} from "@/db/schema";
import type { KnowledgeRelationType, KnowledgeStatus } from "@/lib/knowledge";

/** Org-scoped reads for /knowledge. Writes live in knowledge/actions.ts. */

export type KnowledgeFilters = {
  status?: KnowledgeStatus;
  categoryId?: number;
  q?: string;
  favoritesOnly?: boolean;
  tag?: string;
};

const LIST_LIMIT = 200;

/** Statuses visible to a role that can only read published content. */
export function readableStatuses(canSeeDrafts: boolean): KnowledgeStatus[] {
  return canSeeDrafts ? ["draft", "in_review", "published", "archived"] : ["published"];
}

export async function listArticles(
  orgId: number,
  userId: number,
  canSeeDrafts: boolean,
  f: KnowledgeFilters,
) {
  const conditions: SQL[] = [
    eq(knowledgeArticles.organizationId, orgId),
    inArray(knowledgeArticles.status, f.status ? [f.status] : readableStatuses(canSeeDrafts)),
  ];
  if (f.categoryId) conditions.push(eq(knowledgeArticles.categoryId, f.categoryId));
  if (f.q) {
    const term = `%${f.q}%`;
    const cond = or(
      ilike(knowledgeArticles.title, term),
      ilike(knowledgeArticles.problem, term),
      ilike(knowledgeArticles.solution, term),
    );
    if (cond) conditions.push(cond);
  }
  if (f.tag) {
    conditions.push(sql`${knowledgeArticles.tags} @> ${JSON.stringify([f.tag])}::jsonb`);
  }
  if (f.favoritesOnly) {
    conditions.push(
      exists(
        db
          .select({ one: sql`1` })
          .from(knowledgeArticleFavorites)
          .where(
            and(
              eq(knowledgeArticleFavorites.articleId, knowledgeArticles.id),
              eq(knowledgeArticleFavorites.userId, userId),
            ),
          ),
      ),
    );
  }

  return db
    .select({
      id: knowledgeArticles.id,
      title: knowledgeArticles.title,
      slug: knowledgeArticles.slug,
      status: knowledgeArticles.status,
      visibility: knowledgeArticles.visibility,
      tags: knowledgeArticles.tags,
      categoryId: knowledgeArticles.categoryId,
      categoryName: knowledgeCategories.name,
      categoryColor: knowledgeCategories.color,
      authorId: knowledgeArticles.authorId,
      authorName: users.name,
      publishedAt: knowledgeArticles.publishedAt,
      updatedAt: knowledgeArticles.updatedAt,
      currentVersion: knowledgeArticles.currentVersion,
      isFavorite: sql<boolean>`exists (
        select 1 from ${knowledgeArticleFavorites} f
        where f.article_id = ${knowledgeArticles.id} and f.user_id = ${userId}
      )`,
    })
    .from(knowledgeArticles)
    .leftJoin(knowledgeCategories, eq(knowledgeArticles.categoryId, knowledgeCategories.id))
    .leftJoin(users, eq(knowledgeArticles.authorId, users.id))
    .where(and(...conditions))
    .orderBy(desc(knowledgeArticles.updatedAt))
    .limit(LIST_LIMIT);
}

export type KnowledgeListRow = Awaited<ReturnType<typeof listArticles>>[number];

export async function getArticleDetail(orgId: number, userId: number, id: number) {
  const [row] = await db
    .select({
      article: knowledgeArticles,
      categoryName: knowledgeCategories.name,
      authorName: users.name,
      sourceTicketFolio: tickets.folio,
    })
    .from(knowledgeArticles)
    .leftJoin(knowledgeCategories, eq(knowledgeArticles.categoryId, knowledgeCategories.id))
    .leftJoin(users, eq(knowledgeArticles.authorId, users.id))
    .leftJoin(tickets, eq(knowledgeArticles.sourceTicketId, tickets.id))
    .where(and(eq(knowledgeArticles.id, id), eq(knowledgeArticles.organizationId, orgId)));
  if (!row) return null;

  const [reviewer] = row.article.reviewerId
    ? await db.select({ name: users.name }).from(users).where(eq(users.id, row.article.reviewerId))
    : [];

  const [versions, relations, favorite] = await Promise.all([
    db
      .select({
        id: knowledgeArticleVersions.id,
        versionNumber: knowledgeArticleVersions.versionNumber,
        title: knowledgeArticleVersions.title,
        changeSummary: knowledgeArticleVersions.changeSummary,
        editedById: knowledgeArticleVersions.editedById,
        editedByName: users.name,
        createdAt: knowledgeArticleVersions.createdAt,
      })
      .from(knowledgeArticleVersions)
      .leftJoin(users, eq(knowledgeArticleVersions.editedById, users.id))
      .where(eq(knowledgeArticleVersions.articleId, id))
      .orderBy(desc(knowledgeArticleVersions.versionNumber)),
    db
      .select()
      .from(knowledgeArticleRelations)
      .where(eq(knowledgeArticleRelations.articleId, id))
      .orderBy(desc(knowledgeArticleRelations.isOrigin)),
    db
      .select({ id: knowledgeArticleFavorites.id })
      .from(knowledgeArticleFavorites)
      .where(
        and(
          eq(knowledgeArticleFavorites.articleId, id),
          eq(knowledgeArticleFavorites.userId, userId),
        ),
      ),
  ]);

  const relationLabels = await resolveRelationLabels(orgId, relations);

  return {
    ...row,
    reviewerName: reviewer?.name ?? null,
    versions,
    relations: relations.map((r) => ({ ...r, label: relationLabels.get(`${r.relatedType}:${r.relatedId}`) ?? `#${r.relatedId}` })),
    isFavorite: favorite.length > 0,
  };
}

async function resolveRelationLabels(
  orgId: number,
  relations: { relatedType: KnowledgeRelationType; relatedId: number }[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const ticketIds = relations.filter((r) => r.relatedType === "ticket").map((r) => r.relatedId);
  const companyIds = relations.filter((r) => r.relatedType === "company").map((r) => r.relatedId);
  const projectIds = relations.filter((r) => r.relatedType === "project").map((r) => r.relatedId);
  const activityIds = relations.filter((r) => r.relatedType === "activity").map((r) => r.relatedId);

  const [ticketRows, companyRows, projectRows, activityRows] = await Promise.all([
    ticketIds.length
      ? db
          .select({ id: tickets.id, folio: tickets.folio, title: workItems.title })
          .from(tickets)
          .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
          .where(and(eq(tickets.organizationId, orgId), inArray(tickets.id, ticketIds)))
      : Promise.resolve([]),
    companyIds.length
      ? db
          .select({ id: companies.id, name: companies.name })
          .from(companies)
          .where(and(eq(companies.organizationId, orgId), inArray(companies.id, companyIds)))
      : Promise.resolve([]),
    projectIds.length
      ? db
          .select({ id: projects.id, name: projects.name, folio: projects.folio })
          .from(projects)
          .where(and(eq(projects.organizationId, orgId), inArray(projects.id, projectIds)))
      : Promise.resolve([]),
    activityIds.length
      ? db
          .select({ id: workItems.id, title: workItems.title })
          .from(workItems)
          .where(and(eq(workItems.organizationId, orgId), inArray(workItems.id, activityIds)))
      : Promise.resolve([]),
  ]);

  for (const t of ticketRows) map.set(`ticket:${t.id}`, `${t.folio} · ${t.title}`);
  for (const c of companyRows) map.set(`client:${c.id}`, c.name);
  for (const p of projectRows) map.set(`project:${p.id}`, `${p.folio} · ${p.name}`);
  for (const a of activityRows) map.set(`activity:${a.id}`, a.title);
  return map;
}

export async function getCategories(orgId: number, opts: { includeInactive?: boolean } = {}) {
  const conditions = [eq(knowledgeCategories.organizationId, orgId)];
  if (!opts.includeInactive) conditions.push(eq(knowledgeCategories.isActive, true));
  return db
    .select()
    .from(knowledgeCategories)
    .where(and(...conditions))
    .orderBy(asc(knowledgeCategories.sortOrder), asc(knowledgeCategories.name));
}

/** Articles related to a given entity (client/project/ticket/activity) — one query. */
export async function getRelatedArticles(
  orgId: number,
  relatedType: KnowledgeRelationType,
  relatedId: number,
  limit = 10,
) {
  return db
    .select({
      id: knowledgeArticles.id,
      title: knowledgeArticles.title,
      slug: knowledgeArticles.slug,
      status: knowledgeArticles.status,
      updatedAt: knowledgeArticles.updatedAt,
    })
    .from(knowledgeArticleRelations)
    .innerJoin(knowledgeArticles, eq(knowledgeArticleRelations.articleId, knowledgeArticles.id))
    .where(
      and(
        eq(knowledgeArticles.organizationId, orgId),
        eq(knowledgeArticleRelations.relatedType, relatedType),
        eq(knowledgeArticleRelations.relatedId, relatedId),
      ),
    )
    .orderBy(desc(knowledgeArticles.updatedAt))
    .limit(limit);
}

/** The article generated from a ticket, if any — shown on the ticket detail. */
export async function getArticleForTicket(orgId: number, ticketId: number) {
  const [row] = await db
    .select({ id: knowledgeArticles.id, title: knowledgeArticles.title, status: knowledgeArticles.status })
    .from(knowledgeArticles)
    .where(
      and(eq(knowledgeArticles.organizationId, orgId), eq(knowledgeArticles.sourceTicketId, ticketId)),
    );
  return row ?? null;
}

/** Lightweight matches for the global Command Palette search. */
export async function searchArticlesForPalette(orgId: number, q: string, limit = 5) {
  const term = `%${q}%`;
  return db
    .select({ id: knowledgeArticles.id, title: knowledgeArticles.title, slug: knowledgeArticles.slug })
    .from(knowledgeArticles)
    .where(
      and(
        eq(knowledgeArticles.organizationId, orgId),
        eq(knowledgeArticles.status, "published"),
        ilike(knowledgeArticles.title, term),
      ),
    )
    .orderBy(desc(knowledgeArticles.updatedAt))
    .limit(limit);
}
