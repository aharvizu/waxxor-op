import type { Metadata } from "next";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { companies, users } from "@/db/schema";
import { getCatalogNames } from "@/lib/settings-data";
import { requireUser } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { ActivityForm } from "../activity-form";

export const metadata: Metadata = { title: "New activity" };

export default async function NewActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; companyId?: string }>;
}) {
  const user = await requireUser();
  const { type, companyId } = await searchParams;
  const defaultCompanyId = companyId ? Number(companyId) : undefined;
  const [companyRows, activityTypeOptions, userRows] = await Promise.all([
    db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(eq(companies.organizationId, user.organizationId))
      .orderBy(asc(companies.name)),
    getCatalogNames(user.organizationId, "time_entry_type"),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.organizationId, user.organizationId), ne(users.role, "client")))
      .orderBy(asc(users.name)),
  ]);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="New activity"
        subtitle="Only the title is required — client, assignee and dates are optional."
      />
      <Card className="p-6">
        <ActivityForm
          companies={companyRows}
          activityTypeOptions={activityTypeOptions}
          users={userRows}
          submitLabel="Create activity"
          defaultType={type}
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
