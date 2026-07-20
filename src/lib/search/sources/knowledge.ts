import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { knowledgeArticles } from "@/db/schema";
import { bestRankOf, matchesAny } from "../normalize";
import { registerSource } from "../engine";
import type { SearchResultItem } from "../types";

registerSource({
  category: "knowledge",
  label: "Knowledge Base",
  iconKey: "knowledge",
  async search(ctx, query, limit) {
    const rank = bestRankOf([knowledgeArticles.title, knowledgeArticles.problem, knowledgeArticles.solution], query);
    const rows = await db
      .select({
        id: knowledgeArticles.id,
        title: knowledgeArticles.title,
        slug: knowledgeArticles.slug,
        problem: knowledgeArticles.problem,
        updatedAt: knowledgeArticles.updatedAt,
        rank,
      })
      .from(knowledgeArticles)
      .where(
        and(
          eq(knowledgeArticles.organizationId, ctx.orgId),
          eq(knowledgeArticles.status, "published"),
          matchesAny([knowledgeArticles.title, knowledgeArticles.problem, knowledgeArticles.solution], query),
        ),
      )
      .orderBy(rank)
      .limit(limit);

    return rows.map(
      (r): SearchResultItem => ({
        id: `knowledge:${r.id}`,
        category: "knowledge",
        iconKey: "knowledge",
        title: r.title,
        description: r.problem,
        date: r.updatedAt.toISOString(),
        route: `/knowledge/${r.id}`,
        breadcrumb: ["Knowledge Base", r.title],
        rank: r.rank,
      }),
    );
  },
});
