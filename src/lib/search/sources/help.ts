import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { helpTutorials } from "@/db/schema";
import { bestRankOf, matchesAny } from "../normalize";
import { registerSource } from "../engine";
import type { SearchResultItem } from "../types";

/** Help Center content is global product content, not org-scoped (see schema.ts). */
registerSource({
  category: "help",
  label: "Help Center",
  iconKey: "help",
  async search(_ctx, query, limit) {
    const rank = bestRankOf([helpTutorials.title, helpTutorials.objective], query);
    const rows = await db
      .select({
        slug: helpTutorials.slug,
        title: helpTutorials.title,
        objective: helpTutorials.objective,
        module: helpTutorials.module,
        rank,
      })
      .from(helpTutorials)
      .where(and(eq(helpTutorials.isActive, true), matchesAny([helpTutorials.title, helpTutorials.objective], query)))
      .orderBy(rank)
      .limit(limit);

    return rows.map(
      (r): SearchResultItem => ({
        id: `help:${r.slug}`,
        category: "help",
        iconKey: "help",
        title: r.title,
        description: r.objective,
        route: `/help/${r.slug}`,
        breadcrumb: ["Help Center", r.module, r.title],
        rank: r.rank,
      }),
    );
  },
});
