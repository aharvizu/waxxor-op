"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { quoteItems, quotes } from "@/db/schema";
import { requireUser } from "@/lib/session";

type QuoteStatus = (typeof quotes.status.enumValues)[number];

function toId(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function createQuote(formData: FormData) {
  await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const clientId = toId(formData.get("clientId"));
  if (!title || !clientId) return;

  const taxRateRaw = String(formData.get("taxRate") ?? "").trim();
  const validUntil = String(formData.get("validUntil") ?? "").trim();

  const [quote] = await db
    .insert(quotes)
    .values({
      title,
      clientId,
      currency: String(formData.get("currency") ?? "USD").toUpperCase(),
      taxRate: taxRateRaw && !Number.isNaN(Number(taxRateRaw)) ? taxRateRaw : "0",
      validUntil: validUntil || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
    })
    .returning({ id: quotes.id });

  revalidatePath("/quotes");
  redirect(`/quotes/${quote.id}`);
}

export async function addQuoteItem(formData: FormData) {
  await requireUser();
  const quoteId = toId(formData.get("quoteId"));
  const description = String(formData.get("description") ?? "").trim();
  if (!quoteId || !description) return;

  const quantity = String(formData.get("quantity") ?? "1").trim() || "1";
  const unitPrice = String(formData.get("unitPrice") ?? "0").trim() || "0";
  if (Number.isNaN(Number(quantity)) || Number.isNaN(Number(unitPrice))) return;

  await db.insert(quoteItems).values({ quoteId, description, quantity, unitPrice });
  revalidatePath(`/quotes/${quoteId}`);
}

export async function deleteQuoteItem(formData: FormData) {
  await requireUser();
  const id = toId(formData.get("id"));
  const quoteId = toId(formData.get("quoteId"));
  if (!id) return;

  await db.delete(quoteItems).where(eq(quoteItems.id, id));
  if (quoteId) revalidatePath(`/quotes/${quoteId}`);
}

export async function updateQuoteStatus(formData: FormData) {
  await requireUser();
  const id = toId(formData.get("id"));
  if (!id) return;

  await db
    .update(quotes)
    .set({ status: formData.get("status") as QuoteStatus })
    .where(eq(quotes.id, id));

  revalidatePath(`/quotes/${id}`);
  revalidatePath("/quotes");
}
