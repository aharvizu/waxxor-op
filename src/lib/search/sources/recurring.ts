import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, recurrenceDefinitions } from "@/db/schema";
import { recurrenceStatusMeta } from "@/lib/labels";
import { bestRankOf, matchesAny } from "../normalize";
import { registerSource } from "../engine";
import type { SearchResultItem } from "../types";

registerSource({
  category: "recurring",
  label: "Recurring",
  iconKey: "recurring",
  async search(ctx, query, limit) {
    const rank = bestRankOf([recurrenceDefinitions.name, recurrenceDefinitions.description], query);
    const rows = await db
      .select({
        id: recurrenceDefinitions.id,
        name: recurrenceDefinitions.name,
        status: recurrenceDefinitions.status,
        companyName: companies.name,
        nextRunAt: recurrenceDefinitions.nextRunAt,
        rank,
      })
      .from(recurrenceDefinitions)
      .leftJoin(companies, eq(recurrenceDefinitions.companyId, companies.id))
      .where(
        and(
          eq(recurrenceDefinitions.organizationId, ctx.orgId),
          matchesAny([recurrenceDefinitions.name, recurrenceDefinitions.description], query),
        ),
      )
      .orderBy(rank)
      .limit(limit);

    return rows.map(
      (r): SearchResultItem => ({
        id: `recurring:${r.id}`,
        category: "recurring",
        iconKey: "recurring",
        title: r.name,
        description: recurrenceStatusMeta[r.status]?.label ?? r.status,
        status: recurrenceStatusMeta[r.status]?.label ?? r.status,
        company: r.companyName,
        date: r.nextRunAt?.toISOString() ?? null,
        route: `/recurring/${r.id}`,
        breadcrumb: ["Recurring", r.name],
        rank: r.rank,
      }),
    );
  },
});
