import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { Card, PageHeader, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { updateClient } from "../actions";

export const metadata: Metadata = { title: "Client" };

export default async function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const clientId = Number(id);
  if (!Number.isInteger(clientId)) notFound();

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) notFound();

  return (
    <div className="max-w-2xl">
      <PageHeader title={client.name} subtitle="Edit client details." />
      <Card className="p-6">
        <form action={updateClient} className="space-y-4">
          <input type="hidden" name="id" value={client.id} />
          <div>
            <label htmlFor="name" className={labelClass}>
              Company name
            </label>
            <input
              id="name"
              name="name"
              required
              defaultValue={client.name}
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="contactName" className={labelClass}>
                Contact person
              </label>
              <input
                id="contactName"
                name="contactName"
                defaultValue={client.contactName ?? ""}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="email" className={labelClass}>
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                defaultValue={client.email ?? ""}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="phone" className={labelClass}>
                Phone
              </label>
              <input
                id="phone"
                name="phone"
                defaultValue={client.phone ?? ""}
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label htmlFor="notes" className={labelClass}>
              Notes
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={4}
              defaultValue={client.notes ?? ""}
              className={inputClass}
            />
          </div>
          <SubmitButton>Save changes</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
