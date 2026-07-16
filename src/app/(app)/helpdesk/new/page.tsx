import type { Metadata } from "next";
import { and, asc, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { clients, slaDefinitions, users } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { NewTicketForm } from "./new-ticket-form";

export const metadata: Metadata = { title: "New ticket" };

export default async function NewTicketPage() {
  const user = await requireUser();
  const [clientRows, userRows, slaRows] = await Promise.all([
    db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(eq(clients.organizationId, user.organizationId))
      .orderBy(asc(clients.name)),
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

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="New ticket"
        subtitle="It starts as New (or Assigned when it already has an owner) and gets the SLA for its priority automatically."
      />
      <Card className="p-6">
        <NewTicketForm clients={clientRows} users={userRows} slas={slaRows} />
      </Card>
    </div>
  );
}
