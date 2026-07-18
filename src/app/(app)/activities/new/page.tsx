import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { ActivityForm } from "../activity-form";

export const metadata: Metadata = { title: "New activity" };

export default async function NewActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; clientId?: string }>;
}) {
  const user = await requireUser();
  const { type, clientId } = await searchParams;
  const defaultClientId = clientId ? Number(clientId) : undefined;
  const clientRows = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(eq(clients.organizationId, user.organizationId))
    .orderBy(asc(clients.name));

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="New activity"
        subtitle="Only the title is required — client, assignee and dates are optional."
      />
      <Card className="p-6">
        <ActivityForm
          clients={clientRows}
          submitLabel="Create activity"
          defaultType={type}
          defaultClientId={
            defaultClientId && clientRows.some((c) => c.id === defaultClientId)
              ? defaultClientId
              : undefined
          }
        />
      </Card>
    </div>
  );
}
