import type { Metadata } from "next";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { companies, users } from "@/db/schema";
import { getCatalog, getSetting } from "@/lib/settings-data";
import { requireRole } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { ProjectForm } from "../project-forms";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string }>;
}) {
  const user = await requireRole("superadmin", "administrator", "director", "project_manager");
  const { companyId } = await searchParams;
  const defaultCompanyId = companyId ? Number(companyId) : undefined;

  const [companyRows, userRows, projectDefaults, templateRows] = await Promise.all([
    db
      .select({ id: companies.id, name: companies.name })
      .from(companies)
      .where(and(eq(companies.organizationId, user.organizationId), ne(companies.status, "archived")))
      .orderBy(asc(companies.name)),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.organizationId, user.organizationId), ne(users.role, "client")))
      .orderBy(asc(users.name)),
    getSetting(user.organizationId, "projects.defaults"),
    getCatalog(user.organizationId, "project_template"),
  ]);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Nuevo proyecto"
        subtitle="Se crea en Planning con su folio, el PM como participante y una lista inicial."
      />
      <Card className="p-6">
        <ProjectForm
          companies={companyRows}
          internalUsers={userRows}
          defaultPriority={projectDefaults.defaultPriority}
          templates={templateRows.map((t) => ({ id: t.id, name: t.name }))}
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
