import type { Metadata } from "next";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { companies, contacts, slaDefinitions, users } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { getFieldDefinitions } from "@/lib/custom-fields";
import { getCatalogNames } from "@/lib/settings-data";
import { NewTicketForm } from "./new-ticket-form";

export const metadata: Metadata = { title: "New ticket" };

export default async function NewTicketPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const user = await requireUser();
  const { companyId } = await searchParams;
  const defaultCompanyId = companyId ? Number(companyId) : undefined;
  const [companyRows, contactRows, userRows, slaRows] = await Promise.all([
    db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.organizationId, user.organizationId))
      .orderBy(asc(companies.name)),
    db
      .select({
        id: contacts.id,
        name: contacts.firstName,
        lastName: contacts.lastName,
        companyId: contacts.companyId,
      })
      .from(contacts)
      .where(and(eq(contacts.organizationId, user.organizationId), eq(contacts.isActive, true)))
      .orderBy(asc(contacts.lastName)),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.organizationId, user.organizationId), ne(users.role, "client")))
      .orderBy(asc(users.name)),
    user.role === "superadmin"
      ? db
          .select({ id: slaDefinitions.id, name: slaDefinitions.name })
          .from(slaDefinitions)
          .where(eq(slaDefinitions.organizationId, user.organizationId))
          .orderBy(asc(slaDefinitions.name))
      : Promise.resolve([] as { id: number; name: string }[]),
  ]);
  const contactOptions = contactRows.map((c) => ({
    id: c.id,
    name: `${c.name} ${c.lastName}`,
    companyId: c.companyId,
  }));
  const categoryOptions = await getCatalogNames(user.organizationId, "ticket_category");
  const customFields = await getFieldDefinitions(user.organizationId, "tickets", { activeOnly: true });

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="New ticket"
        subtitle="It starts as New (or Assigned when it already has an owner) and gets the SLA for its priority automatically."
      />
      <Card className="p-6">
        <NewTicketForm
          companies={companyRows}
          contacts={contactOptions}
          users={userRows}
          slas={slaRows}
          categoryOptions={categoryOptions}
          customFields={customFields}
          defaultCompanyId={
            defaultCompanyId && companyRows.some((c) => c.id === defaultCompanyId)
              ? defaultCompanyId
              : undefined
          }
        />
      </Card>
    </div>
  );
}
