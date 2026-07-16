import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { Building2 } from "lucide-react";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { requireUser } from "@/lib/session";
import {
  Avatar,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  THead,
  Table,
  Td,
  Th,
} from "@/components/ui";
import { ClientForm } from "./client-form";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage() {
  const user = await requireUser();
  const rows = await db
    .select()
    .from(clients)
    .where(eq(clients.organizationId, user.organizationId))
    .orderBy(asc(clients.name));

  return (
    <div>
      <PageHeader title="Clients" subtitle="Customers you support, quote, and report to." />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {rows.length === 0 ? (
            <EmptyState icon={<Building2 />} title="No clients yet">
              Add your first client on the right — they’ll be available across
              tickets, projects, quotes, and reports.
            </EmptyState>
          ) : (
            <Card className="overflow-visible">
              <Table>
                <THead>
                  <tr>
                    <Th>Name</Th>
                    <Th>Contact</Th>
                    <Th>Email</Th>
                    <Th>Phone</Th>
                  </tr>
                </THead>
                <tbody className="divide-y divide-edge">
                  {rows.map((c) => (
                    <tr key={c.id} className="group transition-colors hover:bg-subtle">
                      <Td>
                        <Link
                          href={`/clients/${c.id}`}
                          className="flex items-center gap-3 font-medium text-fg transition-colors group-hover:text-primary"
                        >
                          <Avatar name={c.name} size="sm" square />
                          {c.name}
                        </Link>
                      </Td>
                      <Td className="text-muted">{c.contactName ?? "—"}</Td>
                      <Td className="text-muted">{c.email ?? "—"}</Td>
                      <Td className="text-muted tabular-nums">{c.phone ?? "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </Card>
          )}
        </div>

        <Card className="h-fit overflow-hidden">
          <CardHeader title="Add client" description="A new customer account." />
          <div className="p-5">
            <ClientForm submitLabel="Add client" />
          </div>
        </Card>
      </div>
    </div>
  );
}
