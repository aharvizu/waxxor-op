import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, quoteItems, quotes } from "@/db/schema";
import { Badge, Card, PageHeader, Td, Th, cx, inputClass, labelClass } from "@/components/ui";
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
  const { id } = await params;
  const quoteId = Number(id);
  if (!Number.isInteger(quoteId)) notFound();

  const [row] = await db
    .select({ quote: quotes, client: clients })
    .from(quotes)
    .innerJoin(clients, eq(quotes.clientId, clients.id))
    .where(eq(quotes.id, quoteId));
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
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 font-bold text-white">
                W
              </div>
              <div>
                <div className="text-lg font-semibold">Waxxor</div>
                <div className="text-xs text-slate-500">Information Security · waxxor.com</div>
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xl font-semibold">Quotation</div>
            <div className="text-sm text-slate-500">{quoteNumber}</div>
            {q.validUntil ? (
              <div className="mt-1 text-xs text-slate-500">
                Valid until {fmtDate(q.validUntil)}
              </div>
            ) : null}
          </div>
        </div>

        <div className="mb-8 grid grid-cols-2 gap-6 text-sm">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Prepared for
            </div>
            <div className="mt-1 font-medium">{row.client.name}</div>
            {row.client.contactName ? <div>{row.client.contactName}</div> : null}
            {row.client.email ? (
              <div className="text-slate-500">{row.client.email}</div>
            ) : null}
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Subject
            </div>
            <div className="mt-1 font-medium">{q.title}</div>
          </div>
        </div>

        <table className="w-full">
          <thead className="border-b border-slate-300">
            <tr>
              <Th className="pl-0">Description</Th>
              <Th className="text-right">Qty</Th>
              <Th className="text-right">Unit price</Th>
              <Th className="pr-0 text-right">Amount</Th>
              <Th className="w-10 print:hidden" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
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
                      className="text-xs font-medium text-red-600 hover:underline"
                    >
                      Remove
                    </button>
                  </form>
                </Td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <Td className="pl-0 text-slate-500" >
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
              <dt className="text-slate-500">Subtotal</dt>
              <dd className="tabular-nums">{fmtMoney(subtotal, q.currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Tax ({Number(q.taxRate)}%)</dt>
              <dd className="tabular-nums">{fmtMoney(tax, q.currency)}</dd>
            </div>
            <div className="flex justify-between border-t border-slate-300 pt-2 text-base font-semibold">
              <dt>Total</dt>
              <dd className="tabular-nums">{fmtMoney(total, q.currency)}</dd>
            </div>
          </dl>
        </div>

        {q.notes ? (
          <div className="mt-8 border-t border-slate-200 pt-4 text-sm text-slate-600">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Notes & terms
            </div>
            <p className="whitespace-pre-wrap">{q.notes}</p>
          </div>
        ) : null}
      </Card>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3 print:hidden">
        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-4 text-sm font-semibold">Add line item</h2>
          <form action={addQuoteItem} className="grid grid-cols-1 gap-3 sm:grid-cols-6">
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

        <Card className="h-fit p-5">
          <h2 className="mb-4 text-sm font-semibold">Status</h2>
          <form action={updateQuoteStatus} className="space-y-4">
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
