import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { companies, tickets, users, workItems } from "@/db/schema";
import { listTicketStatuses } from "@/lib/ticket-catalogs";
import { bestRankOf, matchesAny } from "../normalize";
import { registerSource } from "../engine";
import type { SearchResultItem } from "../types";

registerSource({
  category: "tickets",
  label: "Tickets",
  iconKey: "ticket",
  async search(ctx, query, limit) {
    const rank = bestRankOf([workItems.title, tickets.folio], query);
    const [rows, statuses] = await Promise.all([
      db
        .select({
          id: tickets.id,
          folio: tickets.folio,
          title: workItems.title,
          statusId: tickets.statusId,
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
        .limit(limit),
      listTicketStatuses(ctx.orgId, { includeInactive: true }),
    ]);
    const statusById = new Map(statuses.map((s) => [s.id, s]));

    return rows.map((r): SearchResultItem => {
      const statusName = statusById.get(r.statusId)?.name ?? String(r.statusId);
      return {
        id: `tickets:${r.id}`,
        category: "tickets",
        iconKey: "ticket",
        title: `${r.folio} · ${r.title}`,
        description: statusName,
        status: statusName,
        owner: r.assigneeName,
        company: r.companyName,
        date: r.updatedAt.toISOString(),
        route: `/helpdesk/${r.id}`,
        breadcrumb: ["Helpdesk", r.folio],
        rank: r.rank,
      };
    });
  },
});
