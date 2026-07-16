import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, quoteItems, quotes } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { Trash2 } from "lucide-react";
import {
  Badge,
  Card,
  CardHeader,
  PageHeader,
  Td,
  Th,
  cx,
  inputClass,
  labelClass,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { PrintButton } from "@/components/print-button";
import { fmtDate, fmtMoney } from "@/lib/format";
import { quoteStatusMeta } from "@/lib/labels";
import { addQuoteItem, deleteQuoteItem, updateQuoteStatus } from "../actions";

export const metadata: Metadata = { title: "Quote" };

export default async function QuotePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const quoteId = Number(id);
  if (!Number.isInteger(quoteId)) notFound();

  const [row] = await db
    .select({ quote: quotes, client: clients })
    .from(quotes)
    .innerJoin(clients, eq(quotes.clientId, clients.id))
    .where(and(eq(quotes.id, quoteId), eq(quotes.organizationId, user.organizationId)));
  if (!row) notFound();

  const items = await db
    .select()
    .from(quoteItems)
    .where(eq(quoteItems.quoteId, quoteId))
    .orderBy(asc(quoteItems.sortOrder), asc(quoteItems.id));

  const q = row.quote;
  const subtotal = items.reduce(
    (sum, i) => sum + Number(i.quantity) * Number(i.unitPrice),
    0,
  );
  const tax = subtotal * (Number(q.taxRate) / 100);
  const total = subtotal + tax;
  const quoteNumber = `Q-${String(q.id).padStart(4, "0")}`;

  return (
    <div className="max-w-4xl">
      <div className="print:hidden">
        <PageHeader
          title={`${quoteNumber} ${q.title}`}
          subtitle={`${row.client.name} · ${fmtMoney(total, q.currency)}`}
          action={
            <div className="flex items-center gap-3">
              <Badge tone={quoteStatusMeta[q.status].tone}>
                {quoteStatusMeta[q.status].label}
              </Badge>
              <PrintButton />
            </div>
          }
        />
      </div>

      {/* Printable quote document */}
      <Card className="p-8 print:rounded-none print:border-0 print:shadow-none">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-purple-700 font-bold text-white print:bg-slate-900">
                W
              </div>
              <div>
                <div className="text-lg font-semibold">Waxxor</div>
                <div className="text-xs text-muted">Information Security · waxxor.com</div>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-semibold">Quotation</div>
            <div className="text-sm text-muted">{quoteNumber}</div>
            {q.validUntil ? (
              <div className="mt-1 text-xs text-muted">
                Valid until {fmtDate(q.validUntil)}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-6 text-sm">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-faint">
              Prepared for
            </div>
            <div className="mt-1 font-medium">{row.client.name}</div>
            {row.client.contactName ? <div>{row.client.contactName}</div> : null}
            {row.client.email ? (
              <div className="text-muted">{row.client.email}</div>
            ) : null}
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold uppercase tracking-wide text-faint">
              Subject
            </div>
            <div className="mt-1 font-medium">{q.title}</div>
          </div>
        </div>

        <table className="w-full">
          <thead>
            <tr>
              <Th className="pl-0">Description</Th>
              <Th className="text-right">Qty</Th>
              <Th className="text-right">Unit price</Th>
              <Th className="pr-0 text-right">Amount</Th>
              <Th className="w-10 print:hidden" />
            </tr>
          </thead>
          <tbody className="divide-y divide-edge">
            {items.map((i) => (
              <tr key={i.id}>
                <Td className="pl-0">{i.description}</Td>
                <Td className="text-right tabular-nums">{Number(i.quantity)}</Td>
                <Td className="text-right tabular-nums">
                  {fmtMoney(i.unitPrice, q.currency)}
                </Td>
                <Td className="pr-0 text-right font-medium tabular-nums">
                  {fmtMoney(Number(i.quantity) * Number(i.unitPrice), q.currency)}
                </Td>
                <Td className="print:hidden">
                  <form action={deleteQuoteItem}>
                    <input type="hidden" name="id" value={i.id} />
                    <input type="hidden" name="quoteId" value={q.id} />
                    <button
                      type="submit"
                      aria-label="Remove item"
                      className="flex size-7 items-center justify-center rounded-md text-faint transition-colors duration-150 hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </form>
                </Td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <Td className="pl-0 text-muted" >
                  No line items yet — add them below.
                </Td>
                <Td /><Td /><Td /><Td className="print:hidden" />
              </tr>
            ) : null}
          </tbody>
        </table>

        <div className="mt-6 flex justify-end">
          <dl className="w-64 space-y-1 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">Subtotal</dt>
              <dd className="tabular-nums">{fmtMoney(subtotal, q.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted">Tax ({Number(q.taxRate)}%)</dt>
              <dd className="tabular-nums">{fmtMoney(tax, q.currency)}</dd>
            </div>
            <div className="flex justify-between border-t border-edge-strong pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{fmtMoney(total, q.currency)}</dd>
            </div>
          </dl>
        </div>

        {q.notes ? (
          <div className="mt-8 border-t border-edge pt-4 text-sm text-muted">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">
              Notes & terms
            </div>
            <p className="whitespace-pre-wrap">{q.notes}</p>
          </div>
        ) : null}
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3 print:hidden">
        <Card className="overflow-hidden lg:col-span-2">
          <CardHeader title="Add line item" description="Services and deliverables on this quote." />
          <form action={addQuoteItem} className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-6">
            <input type="hidden" name="quoteId" value={q.id} />
            <input
              name="description"
              required
              placeholder="Service description…"
              className={cx(inputClass, "sm:col-span-3")}
            />
            <input
              name="quantity"
              type="number"
              step="0.01"
              min="0"
              defaultValue="1"
              aria-label="Quantity"
              className={inputClass}
            />
            <input
              name="unitPrice"
              type="number"
              step="0.01"
              min="0"
              placeholder="Unit price"
              aria-label="Unit price"
              className={inputClass}
            />
            <SubmitButton>Add</SubmitButton>
          </form>
        </Card>

        <Card className="h-fit overflow-hidden">
          <CardHeader title="Status" />
          <form action={updateQuoteStatus} className="space-y-4 p-5">
            <input type="hidden" name="id" value={q.id} />
            <div>
              <label htmlFor="status" className={labelClass}>
                Quote status
              </label>
              <select id="status" name="status" defaultValue={q.status} className={inputClass}>
                {Object.entries(quoteStatusMeta).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>
            <SubmitButton>Update</SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
