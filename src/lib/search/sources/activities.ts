import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { activities, companies, users, workItems } from "@/db/schema";
import { activityStatusMeta } from "@/lib/labels";
import { bestRankOf, matchesAny } from "../normalize";
import { registerSource } from "../engine";
import type { SearchResultItem } from "../types";

registerSource({
  category: "activities",
  label: "Activities",
  iconKey: "activity",
  async search(ctx, query, limit) {
    const rows = await db
      .select({
        id: activities.id,
        title: workItems.title,
        status: workItems.status,
        dueDate: workItems.dueDate,
        companyName: companies.name,
        assigneeName: users.name,
        rank: bestRankOf([workItems.title], query),
      })
      .from(activities)
      .innerJoin(workItems, eq(activities.workItemId, workItems.id))
      .leftJoin(companies, eq(workItems.companyId, companies.id))
      .leftJoin(users, eq(workItems.assigneeId, users.id))
      .where(
        and(
          eq(workItems.organizationId, ctx.orgId),
          isNull(activities.convertedAt),
          isNull(activities.archivedAt),
          matchesAny([workItems.title], query),
        ),
      )
      .orderBy(bestRankOf([workItems.title], query))
      .limit(limit);

    return rows.map(
      (r): SearchResultItem => ({
        id: `activities:${r.id}`,
        category: "activities",
        iconKey: "activity",
        title: r.title,
        description: activityStatusMeta[r.status]?.label ?? r.status,
        status: activityStatusMeta[r.status]?.label ?? r.status,
        owner: r.assigneeName,
        company: r.companyName,
        date: r.dueDate,
        route: `/activities/${r.id}`,
        breadcrumb: ["Activities", r.title],
        rank: r.rank,
      }),
    );
  },
});
