import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { companies } from "@/db/schema";

/** Empresas elegibles como cliente de una propuesta (todas menos las archivadas). */
export async function listProposalCompanies(orgId: number) {
  return db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(and(eq(companies.organizationId, orgId), ne(companies.status, "archived")))
    .orderBy(asc(companies.name));
}
