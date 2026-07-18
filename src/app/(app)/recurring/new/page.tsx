import type { Metadata } from "next";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { clients, projectLists, projects, users } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { getSetting } from "@/lib/settings-data";
import { Card, PageHeader } from "@/components/ui";
import { RecurrenceWizard } from "../recurring-forms";

export const metadata: Metadata = { title: "New recurrence" };

export default async function NewRecurrencePage({
  searchParams,
}: {
  searchParams: Promise<{ targetType?: string; clientId?: string; projectId?: string }>;
}) {
  const user = await requireUser();
  const { targetType, clientId, projectId } = await searchParams;

  const [clientRows, projectRows, listRows, userRows] = await Promise.all([
    db.select({ id: clients.id, name: clients.name }).from(clients).where(and(eq(clients.organizationId, user.organizationId), ne(clients.status, "archived"))).orderBy(asc(clients.name)),
    db.select({ id: projects.id, name: projects.name }).from(projects).where(and(eq(projects.organizationId, user.organizationId), ne(projects.status, "archived"))).orderBy(asc(projects.name)),
    db.select({ id: projectLists.id, name: projectLists.name, projectId: projectLists.projectId }).from(projectLists).where(eq(projectLists.organizationId, user.organizationId)),
    db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.organizationId, user.organizationId), ne(users.role, "client"))).orderBy(asc(users.name)),
  ]);

  const recurrenceDefaults = await getSetting(user.organizationId, "recurrence.defaults");

  const projectListsByProject: Record<number, { id: number; name: string }[]> = {};
  for (const l of listRows) {
    (projectListsByProject[l.projectId] ??= []).push({ id: l.id, name: l.name });
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Nueva recurrencia" subtitle="Trabajo operativo que Watson genera automáticamente." />
      <Card className="p-6">
        <RecurrenceWizard
          clients={clientRows}
          projects={projectRows}
          projectListsByProject={projectListsByProject}
          internalUsers={userRows}
          initialTargetType={targetType}
          defaults={{
            clientId: clientId ? Number(clientId) : null,
            projectId: projectId ? Number(projectId) : null,
            timeOfDay: recurrenceDefaults.defaultTimeOfDay,
            timezone: recurrenceDefaults.defaultTimezone,
          }}
        />
      </Card>
    </div>
  );
}
