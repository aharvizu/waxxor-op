import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, reports, users } from "@/db/schema";
import { reportStatusMeta } from "@/lib/labels";
import { bestRankOf, matchesAny } from "../normalize";
import { registerSource } from "../engine";
import type { SearchResultItem } from "../types";

registerSource({
  category: "reports",
  label: "Reports",
  iconKey: "report",
  async search(ctx, query, limit) {
    const rank = bestRankOf([reports.title, reports.subject, reports.description], query);
    const rows = await db
      .select({
        id: reports.id,
        title: reports.title,
        subject: reports.subject,
        status: reports.status,
        companyName: companies.name,
        responsibleName: users.name,
        updatedAt: reports.updatedAt,
        rank,
      })
      .from(reports)
      .leftJoin(companies, eq(reports.companyId, companies.id))
      .leftJoin(users, eq(reports.responsibleUserId, users.id))
      .where(and(eq(reports.organizationId, ctx.orgId), matchesAny([reports.title, reports.subject, reports.description], query)))
      .orderBy(rank)
      .limit(limit);

    return rows.map(
      (r): SearchResultItem => ({
        id: `reports:${r.id}`,
        category: "reports",
        iconKey: "report",
        title: r.title,
        description: r.subject,
        status: reportStatusMeta[r.status]?.label ?? r.status,
        owner: r.responsibleName,
        company: r.companyName,
        date: r.updatedAt.toISOString(),
        route: `/reports/${r.id}`,
        breadcrumb: ["Reports", r.title],
        rank: r.rank,
      }),
    );
  },
});
