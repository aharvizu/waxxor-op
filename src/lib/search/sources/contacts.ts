import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, contacts } from "@/db/schema";
import { bestRankOf, matchesAny } from "../normalize";
import { registerSource } from "../engine";
import type { SearchResultItem } from "../types";

const fullName = sql`${contacts.firstName} || ' ' || ${contacts.lastName}`;

registerSource({
  category: "contacts",
  label: "Contacts",
  iconKey: "contact",
  async search(ctx, query, limit) {
    const rank = bestRankOf([fullName, contacts.email], query);
    const rows = await db
      .select({
        id: contacts.id,
        firstName: contacts.firstName,
        lastName: contacts.lastName,
        jobTitle: contacts.jobTitle,
        email: contacts.email,
        companyName: companies.name,
        updatedAt: contacts.updatedAt,
        rank,
      })
      .from(contacts)
      .innerJoin(companies, eq(contacts.companyId, companies.id))
      .where(and(eq(contacts.organizationId, ctx.orgId), matchesAny([fullName, contacts.email], query)))
      .orderBy(rank)
      .limit(limit);

    return rows.map(
      (r): SearchResultItem => ({
        id: `contacts:${r.id}`,
        category: "contacts",
        iconKey: "contact",
        title: `${r.firstName} ${r.lastName}`,
        description: r.jobTitle ?? r.email ?? null,
        company: r.companyName,
        date: r.updatedAt.toISOString(),
        route: `/contacts/${r.id}`,
        breadcrumb: ["Contacts", `${r.firstName} ${r.lastName}`],
        rank: r.rank,
      }),
    );
  },
});
