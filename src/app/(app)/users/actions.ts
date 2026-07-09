"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { requireAdmin } from "@/lib/session";

function fields(formData: FormData) {
  const role = String(formData.get("role") ?? "member");
  return {
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    role: (role === "admin" ? "admin" : "member") as "admin" | "member",
    title: String(formData.get("title") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
  };
}

async function emailTaken(email: string, excludeId?: number) {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email));
  return existing !== undefined && existing.id !== excludeId;
}

export async function createUser(formData: FormData) {
  await requireAdmin();
  const data = fields(formData);
  const password = String(formData.get("password") ?? "");
  if (!data.name || !data.email || password.length < 8) return;
  if (await emailTaken(data.email)) redirect("/users?error=email-taken");

  const passwordHash = await bcrypt.hash(password, 12);
  await db.insert(users).values({ ...data, passwordHash });
  revalidatePath("/users");
}

export async function updateUser(formData: FormData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  const data = fields(formData);
  if (!Number.isInteger(id) || !data.name || !data.email) return;
  if (await emailTaken(data.email, id)) {
    redirect(`/users/${id}?error=email-taken`);
  }

  const password = String(formData.get("password") ?? "");
  if (password && password.length < 8) {
    redirect(`/users/${id}?error=short-password`);
  }
  const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;

  await db
    .update(users)
    .set({ ...data, ...(passwordHash ? { passwordHash } : {}) })
    .where(eq(users.id, id));
  revalidatePath("/users");
  redirect("/users");
}

export async function deleteUser(formData: FormData) {
  const me = await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  if (String(id) === me.id) redirect(`/users/${id}?error=self-delete`);

  try {
    await db.delete(users).where(eq(users.id, id));
  } catch {
    // FK references from tickets/tasks/comments block the delete.
    redirect(`/users/${id}?error=in-use`);
  }
  revalidatePath("/users");
  redirect("/users");
}
