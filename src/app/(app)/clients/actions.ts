"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { requireUser } from "@/lib/session";

function fields(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    contactName: String(formData.get("contactName") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

export async function createClient(formData: FormData) {
  await requireUser();
  const data = fields(formData);
  if (!data.name) return;

  await db.insert(clients).values(data);
  revalidatePath("/clients");
}

export async function updateClient(formData: FormData) {
  await requireUser();
  const id = Number(formData.get("id"));
  const data = fields(formData);
  if (!Number.isInteger(id) || !data.name) return;

  await db.update(clients).set(data).where(eq(clients.id, id));
  revalidatePath("/clients");
  redirect("/clients");
}
