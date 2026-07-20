import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, tickets, users, workItems } from "@/db/schema";
import { ticketStatusMeta } from "@/lib/labels";
import { bestRankOf, matchesAny } from "../normalize";
import { registerSource } from "../engine";
import type { SearchResultItem } from "../types";

registerSource({
  category: "tickets",
  label: "Tickets",
  iconKey: "ticket",
  async search(ctx, query, limit) {
    const rank = bestRankOf([workItems.title, tickets.folio], query);
    const rows = await db
      .select({
        id: tickets.id,
        folio: tickets.folio,
        title: workItems.title,
        status: workItems.status,
        companyName: companies.name,
        assigneeName: users.name,
        updatedAt: workItems.updatedAt,
        rank,
      })
      .from(tickets)
      .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
      .leftJoin(companies, eq(workItems.companyId, companies.id))
      .leftJoin(users, eq(workItems.assigneeId, users.id))
      .where(and(eq(tickets.organizationId, ctx.orgId), matchesAny([workItems.title, tickets.folio], query)))
      .orderBy(rank)
      .limit(limit);

    return rows.map(
      (r): SearchResultItem => ({
        id: `tickets:${r.id}`,
        category: "tickets",
        iconKey: "ticket",
        title: `${r.folio} · ${r.title}`,
        description: ticketStatusMeta[r.status]?.label ?? r.status,
        status: ticketStatusMeta[r.status]?.label ?? r.status,
        owner: r.assigneeName,
        company: r.companyName,
        date: r.updatedAt.toISOString(),
        route: `/helpdesk/${r.id}`,
        breadcrumb: ["Helpdesk", r.folio],
        rank: r.rank,
      }),
    );
  },
});
