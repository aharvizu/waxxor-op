import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { Card, PageHeader } from "@/components/ui";
import { ClientForm } from "../client-form";

export const metadata: Metadata = { title: "Client" };

export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const clientId = Number(id);
  if (!Number.isInteger(clientId)) notFound();

  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.organizationId, user.organizationId)));
  if (!client) notFound();

  return (
    <div className="max-w-2xl">
      <PageHeader title={client.name} subtitle="Edit client details." />
      <Card className="p-6">
        <ClientForm client={client} submitLabel="Save changes" />
      </Card>
    </div>
  );
}
