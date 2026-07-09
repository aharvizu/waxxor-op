import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { clients, quoteItems, quotes } from "@/db/schema";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Td,
  Th,
  buttonClass,
} from "@/components/ui";
import { fmtDate, fmtMoney } from "@/lib/format";
import { quoteStatusMeta } from "@/lib/labels";

export const metadata: Metadata = { title: "Quotes" };

export default async function QuotesPage() {
  const rows = await db
    .select({
      id: quotes.id,
      title: quotes.title,
      status: quotes.status,
      currency: quotes.currency,
      validUntil: quotes.validUntil,
      clientName: clients.name,
      subtotal: sql<string>`coalesce(sum(${quoteItems.quantity} * ${quoteItems.unitPrice}), 0)`,
      taxRate: quotes.taxRate,
    })
    .from(quotes)
    .innerJoin(clients, eq(quotes.clientId, clients.id))
    .leftJoin(quoteItems, eq(quoteItems.quoteId, quotes.id))
    .groupBy(quotes.id, clients.name)
    .orderBy(desc(quotes.createdAt));

  return (
    <div>
      <PageHeader
        title="Quotes"
        subtitle="Proposals and quotations for clients."
        action={
          <Link href="/quotes/new" className={buttonClass}>
            New quote
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState>No quotes yet. Create one to get started.</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <Th>Quote</Th>
                <Th>Client</Th>
                <Th>Status</Th>
                <Th>Valid until</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((q) => {
                const subtotal = Number(q.subtotal);
                const total = subtotal * (1 + Number(q.taxRate) / 100);
                return (
                  <tr key={q.id} className="hover:bg-slate-50">
                    <Td>
                      <Link
                        href={`/quotes/${q.id}`}
                        className="font-medium hover:text-purple-700"
                      >
                        Q-{String(q.id).padStart(4, "0")} {q.title}
                      </Link>
                    </Td>
                    <Td className="text-slate-500">{q.clientName}</Td>
                    <Td>
                      <Badge tone={quoteStatusMeta[q.status].tone}>
                        {quoteStatusMeta[q.status].label}
                      </Badge>
                    </Td>
                    <Td className="text-slate-500">{fmtDate(q.validUntil)}</Td>
                    <Td className="text-right font-medium tabular-nums">
                      {fmtMoney(total, q.currency)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
