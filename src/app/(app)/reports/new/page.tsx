import type { Metadata } from "next";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { companies, projects, reportTemplates, users } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { CreateReportForm } from "../report-forms";

export const metadata: Metadata = { title: "New report" };

export default async function NewReportPage({
  searchParams,
}: {
  searchParams: Promise<{ companyId?: string; projectId?: string; type?: string }>;
}) {
  const user = await requireUser();
  const { companyId, projectId, type } = await searchParams;

  const [companyRows, projectRows, templateRows, userRows] = await Promise.all([
    db.select({ id: companies.id, name: companies.name }).from(companies).where(and(eq(companies.organizationId, user.organizationId), ne(companies.status, "archived"))).orderBy(asc(companies.name)),
    db.select({ id: projects.id, name: projects.name }).from(projects).where(eq(projects.organizationId, user.organizationId)).orderBy(asc(projects.name)),
    db
      .select({ id: reportTemplates.id, name: reportTemplates.name, reportType: reportTemplates.reportType })
      .from(reportTemplates)
      .where(and(eq(reportTemplates.organizationId, user.organizationId), eq(reportTemplates.status, "active")))
      .orderBy(asc(reportTemplates.name)),
    db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.organizationId, user.organizationId), ne(users.role, "client"))).orderBy(asc(users.name)),
  ]);

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Nuevo reporte"
        subtitle="El contenido se genera con datos reales del periodo y queda congelado como snapshot."
      />
      <Card className="p-6">
        <CreateReportForm
          companies={companyRows}
          projects={projectRows}
          templates={templateRows}
          internalUsers={userRows}
          defaults={{
            companyId: companyId ? Number(companyId) : undefined,
            projectId: projectId ? Number(projectId) : undefined,
            reportType: type,
          }}
        />
      </Card>
    </div>
  );
}
