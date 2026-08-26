import type { Metadata } from "next";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { companies, users } from "@/db/schema";
import { getCatalogNames } from "@/lib/settings-data";
import { requireUser } from "@/lib/session";
import { getOrgLocale } from "@/lib/get-org-locale";
import { t } from "@/lib/i18n";
import { Card, PageHeader } from "@/components/ui";
import { ActivityForm } from "../activity-form";

export const metadata: Metadata = { title: "New activity" };

export default async function NewActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; companyId?: string }>;
}) {
  const user = await requireUser();
  const locale = await getOrgLocale(user.organizationId);
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
        title={t("Nueva actividad", "New activity", locale)}
        subtitle={t(
          "Solo el título es obligatorio — cliente, responsable y fechas son opcionales.",
          "Only the title is required — client, assignee and dates are optional.",
          locale,
        )}
      />
      <Card className="p-6">
        <ActivityForm
          companies={companyRows}
          activityTypeOptions={activityTypeOptions}
          users={userRows}
          submitLabel={t("Crear actividad", "Create activity", locale)}
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
