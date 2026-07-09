import type { Metadata } from "next";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { Card, EmptyState, PageHeader, Td, Th, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createClient } from "./actions";

export const metadata: Metadata = { title: "Clients" };

export default async function ClientsPage() {
  const rows = await db.select().from(clients).orderBy(asc(clients.name));

  return (
    <div>
      <PageHeader title="Clients" subtitle="Customers you support, quote, and report to." />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          {rows.length === 0 ? (
            <EmptyState>No clients yet — add your first one on the right.</EmptyState>
          ) : (
            <Card className="overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-50">
                  <tr>
                    <Th>Name</Th>
                    <Th>Contact</Th>
                    <Th>Email</Th>
                    <Th>Phone</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50">
                      <Td>
                        <Link
                          href={`/clients/${c.id}`}
                          className="font-medium hover:text-purple-700"
                        >
                          {c.name}
                        </Link>
                      </Td>
                      <Td className="text-slate-500">{c.contactName ?? "—"}</Td>
                      <Td className="text-slate-500">{c.email ?? "—"}</Td>
                      <Td className="text-slate-500">{c.phone ?? "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>

        <Card className="h-fit p-5">
          <h2 className="mb-4 text-sm font-semibold">Add client</h2>
          <form action={createClient} className="space-y-4">
            <div>
              <label htmlFor="name" className={labelClass}>
                Company name
              </label>
              <input id="name" name="name" required className={inputClass} />
            </div>
            <div>
              <label htmlFor="contactName" className={labelClass}>
                Contact person
              </label>
              <input id="contactName" name="contactName" className={inputClass} />
            </div>
            <div>
              <label htmlFor="email" className={labelClass}>
                Email
              </label>
              <input id="email" name="email" type="email" className={inputClass} />
            </div>
            <div>
              <label htmlFor="phone" className={labelClass}>
                Phone
              </label>
              <input id="phone" name="phone" className={inputClass} />
            </div>
            <div>
              <label htmlFor="notes" className={labelClass}>
                Notes
              </label>
              <textarea id="notes" name="notes" rows={3} className={inputClass} />
            </div>
            <SubmitButton>Add client</SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
