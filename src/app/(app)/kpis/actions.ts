"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { kpiEntries, kpis } from "@/db/schema";
import { requireUser } from "@/lib/session";

function toId(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function createKpi(formData: FormData) {
  await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const target = String(formData.get("target") ?? "").trim();
  await db.insert(kpis).values({
    name,
    unit: String(formData.get("unit") ?? "").trim() || null,
    target: target && !Number.isNaN(Number(target)) ? target : null,
  });
  revalidatePath("/kpis");
}

export async function deleteKpi(formData: FormData) {
  await requireUser();
  const id = toId(formData.get("id"));
  if (!id) return;

  await db.delete(kpis).where(eq(kpis.id, id));
  revalidatePath("/kpis");
}

export async function addKpiEntry(formData: FormData) {
  await requireUser();
  const kpiId = toId(formData.get("kpiId"));
  const value = String(formData.get("value") ?? "").trim();
  const period = String(formData.get("period") ?? "").trim();
  if (!kpiId || !value || Number.isNaN(Number(value)) || !period) return;

  await db.insert(kpiEntries).values({
    kpiId,
    value,
    period,
    note: String(formData.get("note") ?? "").trim() || null,
  });
  revalidatePath("/kpis");
}
