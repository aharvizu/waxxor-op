"use server";

import bcrypt from "bcryptjs";
import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { users } from "@/db/schema";
import { diffFields, recordAudit } from "@/lib/audit";
import { normalizeRole } from "@/lib/roles";
import { requireRole } from "@/lib/session";

/** User fields that are audited with old/new values. Never the password hash. */
const auditedFields = ["name", "email", "role", "title", "phone"] as const;

function fields(formData: FormData) {
  return {
    name: String(formData.get("name") ?? "").trim(),
    email: String(formData.get("email") ?? "").trim().toLowerCase(),
    role: normalizeRole(formData.get("role")),
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

export async function updateUser(formData: FormData) {
  const me = await requireRole("superadmin");
  const id = Number(formData.get("id"));
  const data = fields(formData);
  if (!Number.isInteger(id) || !data.name || !data.email) return;
  if (await emailTaken(data.email, id)) {
    redirect(`/settings/users/${id}?error=email-taken`);
  }

  const password = String(formData.get("password") ?? "");
  if (password && password.length < 8) {
    redirect(`/settings/users/${id}?error=short-password`);
  }
  const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;

  await db.transaction(async (tx) => {
    const scope = and(eq(users.id, id), eq(users.organizationId, me.organizationId));
    const [before] = await tx.select().from(users).where(scope);
    if (!before) return;

    const changes = diffFields(
      {
        organizationId: me.organizationId,
        userId: Number(me.id),
        entityType: "user",
        entityId: id,
      },
      before,
      data,
      auditedFields,
    );
    if (passwordHash) {
      // record THAT the password changed, never the values
      changes.push({
        organizationId: me.organizationId,
        userId: Number(me.id),
        entityType: "user",
        entityId: id,
        action: "update",
        field: "password",
        metadata: { changed: true },
      });
    }
    if (changes.length === 0) return;

    await tx
      .update(users)
      .set({ ...data, ...(passwordHash ? { passwordHash } : {}) })
      .where(scope);
    await recordAudit(tx, changes);
  });
  revalidatePath("/settings/users");
  redirect("/settings/users");
}

export async function deleteUser(formData: FormData) {
  const me = await requireRole("superadmin");
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return;
  if (String(id) === me.id) redirect(`/settings/users/${id}?error=self-delete`);

  try {
    await db.transaction(async (tx) => {
      const scope = and(eq(users.id, id), eq(users.organizationId, me.organizationId));
      const [victim] = await tx.select().from(users).where(scope);
      if (!victim) return;
      await tx.delete(users).where(scope);
      await recordAudit(tx, {
        organizationId: me.organizationId,
        userId: Number(me.id),
        entityType: "user",
        entityId: id,
        action: "delete",
        metadata: {
          values: {
            name: victim.name,
            email: victim.email,
            role: victim.role,
            title: victim.title,
            phone: victim.phone,
          },
        },
      });
    });
  } catch {
    // FK references from tickets/tasks/comments block the delete.
    redirect(`/settings/users/${id}?error=in-use`);
  }
  revalidatePath("/settings/users");
  redirect("/settings/users");
}
