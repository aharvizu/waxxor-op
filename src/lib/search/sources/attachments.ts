import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, attachments, projects, tickets, workItems } from "@/db/schema";
import { bestRankOf, matchesAny } from "../normalize";
import { registerSource } from "../engine";
import type { SearchResultItem } from "../types";

registerSource({
  category: "attachments",
  label: "Adjuntos",
  iconKey: "attachment",
  async search(ctx, query, limit) {
    const rank = bestRankOf([attachments.filename], query);
    const rows = await db
      .select({
        id: attachments.id,
        filename: attachments.filename,
        createdAt: attachments.createdAt,
        workItemTitle: workItems.title,
        ticketId: tickets.id,
        ticketFolio: tickets.folio,
        activityId: activities.id,
        projectId: projects.id,
        projectName: projects.name,
        rank,
      })
      .from(attachments)
      .leftJoin(workItems, eq(attachments.workItemId, workItems.id))
      .leftJoin(tickets, eq(tickets.workItemId, workItems.id))
      .leftJoin(activities, eq(activities.workItemId, workItems.id))
      .leftJoin(projects, eq(attachments.projectId, projects.id))
      .where(and(eq(attachments.organizationId, ctx.orgId), matchesAny([attachments.filename], query)))
      .orderBy(rank)
      .limit(limit);

    return rows
      .map((r): SearchResultItem | null => {
        let route: string;
        let parentTitle: string;
        if (r.ticketId) {
          route = `/helpdesk/${r.ticketId}`;
          parentTitle = `${r.ticketFolio} · ${r.workItemTitle}`;
        } else if (r.activityId) {
          route = `/activities/${r.activityId}`;
          parentTitle = r.workItemTitle ?? "Activity";
        } else if (r.projectId) {
          route = `/projects/${r.projectId}`;
          parentTitle = r.projectName ?? "Project";
        } else {
          return null; // orphaned attachment (e.g. a message-only upload) — nothing to open
        }
        return {
          id: `attachments:${r.id}`,
          category: "attachments",
          iconKey: "attachment",
          title: r.filename,
          description: `Adjunto en ${parentTitle}`,
          date: r.createdAt.toISOString(),
          route,
          breadcrumb: ["Adjuntos", parentTitle, r.filename],
          rank: r.rank,
        };
      })
      .filter((r): r is SearchResultItem => r !== null);
  },
});
