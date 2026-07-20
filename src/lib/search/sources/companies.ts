import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { bestRankOf, matchesAny } from "../normalize";
import { registerSource } from "../engine";
import type { SearchResultItem } from "../types";

registerSource({
  category: "companies",
  label: "Companies",
  iconKey: "company",
  async search(ctx, query, limit) {
    const rank = bestRankOf([companies.name, companies.legalName, companies.industry, companies.city], query);
    const rows = await db
      .select({
        id: companies.id,
        name: companies.name,
        industry: companies.industry,
        city: companies.city,
        status: companies.status,
        updatedAt: companies.updatedAt,
        rank,
      })
      .from(companies)
      .where(
        and(
          eq(companies.organizationId, ctx.orgId),
          matchesAny([companies.name, companies.legalName, companies.industry, companies.city], query),
        ),
      )
      .orderBy(rank)
      .limit(limit);

    return rows.map(
      (r): SearchResultItem => ({
        id: `companies:${r.id}`,
        category: "companies",
        iconKey: "company",
        title: r.name,
        description: [r.industry, r.city].filter(Boolean).join(" · ") || null,
        status: r.status,
        company: r.name,
        date: r.updatedAt.toISOString(),
        route: `/companies/${r.id}`,
        breadcrumb: ["Companies", r.name],
        rank: r.rank,
      }),
    );
  },
});
