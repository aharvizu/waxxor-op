import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { Card, PageHeader, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createQuote } from "../actions";

export const metadata: Metadata = { title: "New quote" };

export default async function NewQuotePage() {
  const clientRows = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .orderBy(asc(clients.name));

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="New quote"
        subtitle="Create the quote first, then add line items on the next screen."
      />
      <Card className="p-6">
        <form action={createQuote} className="space-y-4">
          <div>
            <label htmlFor="title" className={labelClass}>
              Title
            </label>
            <input
              id="title"
              name="title"
              required
              placeholder="e.g. External penetration test — Q3 2026"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="clientId" className={labelClass}>
                Client
              </label>
              <select id="clientId" name="clientId" required className={inputClass}>
                <option value="">Select a client…</option>
                {clientRows.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="validUntil" className={labelClass}>
                Valid until
              </label>
              <input id="validUntil" name="validUntil" type="date" className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="currency" className={labelClass}>
                Currency
              </label>
              <select id="currency" name="currency" defaultValue="USD" className={inputClass}>
                <option value="USD">USD</option>
                <option value="MXN">MXN</option>
                <option value="EUR">EUR</option>
              </select>
            </div>
            <div>
              <label htmlFor="taxRate" className={labelClass}>
                Tax rate (%)
              </label>
              <input
                id="taxRate"
                name="taxRate"
                type="number"
                step="0.01"
                min="0"
                defaultValue="0"
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label htmlFor="notes" className={labelClass}>
              Notes / terms
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={4}
              placeholder="Payment terms, scope notes, exclusions…"
              className={inputClass}
            />
          </div>
          <SubmitButton>Create quote</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
