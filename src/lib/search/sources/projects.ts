import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, projects, users } from "@/db/schema";
import { projectStatusMeta } from "@/lib/labels";
import { bestRankOf, matchesAny } from "../normalize";
import { registerSource } from "../engine";
import type { SearchResultItem } from "../types";

registerSource({
  category: "projects",
  label: "Projects",
  iconKey: "project",
  async search(ctx, query, limit) {
    const rank = bestRankOf([projects.name, projects.folio, projects.description], query);
    const rows = await db
      .select({
        id: projects.id,
        folio: projects.folio,
        name: projects.name,
        status: projects.status,
        companyName: companies.name,
        managerName: users.name,
        targetDate: projects.targetDate,
        rank,
      })
      .from(projects)
      .leftJoin(companies, eq(projects.companyId, companies.id))
      .leftJoin(users, eq(projects.projectManagerId, users.id))
      .where(and(eq(projects.organizationId, ctx.orgId), matchesAny([projects.name, projects.folio, projects.description], query)))
      .orderBy(rank)
      .limit(limit);

    return rows.map(
      (r): SearchResultItem => ({
        id: `projects:${r.id}`,
        category: "projects",
        iconKey: "project",
        title: r.name,
        description: `${r.folio} · ${projectStatusMeta[r.status]?.label ?? r.status}`,
        status: projectStatusMeta[r.status]?.label ?? r.status,
        owner: r.managerName,
        company: r.companyName,
        date: r.targetDate,
        route: `/projects/${r.id}`,
        breadcrumb: ["Projects", r.name],
        rank: r.rank,
      }),
    );
  },
});
