import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { FileText, Plus } from "lucide-react";
import { db } from "@/db";
import { companies, quoteItems, quotes } from "@/db/schema";
import { requireUser } from "@/lib/session";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  THead,
  Table,
  Td,
  Th,
  buttonClass,
} from "@/components/ui";
import { fmtDate, fmtMoney } from "@/lib/format";
import { quoteStatusMeta } from "@/lib/labels";

export const metadata: Metadata = { title: "Quotes" };

export default async function QuotesPage() {
  const user = await requireUser();
  const rows = await db
    .select({
      id: quotes.id,
      title: quotes.title,
      status: quotes.status,
      currency: quotes.currency,
      validUntil: quotes.validUntil,
      companyName: companies.name,
      subtotal: sql<string>`coalesce(sum(${quoteItems.quantity} * ${quoteItems.unitPrice}), 0)`,
      taxRate: quotes.taxRate,
    })
    .from(quotes)
    .innerJoin(companies, eq(quotes.companyId, companies.id))
    .leftJoin(quoteItems, eq(quoteItems.quoteId, quotes.id))
    .where(eq(quotes.organizationId, user.organizationId))
    .groupBy(quotes.id, companies.name)
    .orderBy(desc(quotes.createdAt));

  return (
    <div>
      <PageHeader
        title="Quotes"
        subtitle="Proposals and quotations for companies."
        action={
          <Link href="/quotes/new" className={buttonClass}>
            <Plus /> New quote
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="No quotes yet"
          action={
            <Link href="/quotes/new" className={buttonClass}>
              <Plus /> New quote
            </Link>
          }
        >
          Create a quote, add line items, and share a polished printable proposal
          with your client.
        </EmptyState>
      ) : (
        <Card className="overflow-visible">
          <Table>
            <THead>
              <tr>
                <Th>Quote</Th>
                <Th>Client</Th>
                <Th>Status</Th>
                <Th>Valid until</Th>
                <Th className="text-right">Total</Th>
              </tr>
            </THead>
            <tbody className="divide-y divide-edge">
              {rows.map((q) => {
                const subtotal = Number(q.subtotal);
                const total = subtotal * (1 + Number(q.taxRate) / 100);
                return (
                  <tr key={q.id} className="group transition-colors hover:bg-subtle">
                    <Td>
                      <Link
                        href={`/quotes/${q.id}`}
                        className="font-medium text-fg transition-colors group-hover:text-primary"
                      >
                        <span className="mr-1.5 font-mono text-xs text-faint">
                          Q-{String(q.id).padStart(4, "0")}
                        </span>
                        {q.title}
                      </Link>
                    </Td>
                    <Td className="text-muted">{q.companyName}</Td>
                    <Td>
                      <Badge tone={quoteStatusMeta[q.status].tone}>
                        {quoteStatusMeta[q.status].label}
                      </Badge>
                    </Td>
                    <Td className="text-muted tabular-nums">{fmtDate(q.validUntil)}</Td>
                    <Td className="text-right font-medium tabular-nums">
                      {fmtMoney(total, q.currency)}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
