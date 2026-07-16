"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { clients } from "@/db/schema";
import {
  type ActionState,
  businessError,
  parseForm,
  success,
  unexpectedError,
} from "@/lib/action-result";
import { diffFields, recordAudit } from "@/lib/audit";
import { requireUser } from "@/lib/session";

const auditedFields = ["name", "contactName", "email", "phone", "notes"] as const;

/** Thrown inside the update transaction to surface a business error after rollback. */
class ClientNotFoundError extends Error {}

/** Optional free-text field: trims and normalizes empty to null. */
const optionalText = z
  .string()
  .optional()
  .transform((value) => (value ?? "").trim() || null);

const clientSchema = z.object({
  name: z.string("Company name is required.").trim().min(1, "Company name is required."),
  contactName: optionalText,
  email: optionalText.pipe(z.email("Enter a valid email address.").nullable()),
  phone: optionalText,
  notes: optionalText,
});

const clientWithIdSchema = clientSchema.extend({
  id: z.coerce.number().int().positive(),
});

export async function createClient(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(clientSchema, formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(clients)
        .values({ ...data, organizationId: user.organizationId })
        .returning({ id: clients.id });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "client",
        entityId: created.id,
        action: "create",
        metadata: { values: data },
      });
    });
  } catch (err) {
    return unexpectedError(err);
  }
  revalidatePath("/clients");
  return success("Client added.");
}

export async function updateClient(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(clientWithIdSchema, formData);
  if (error) return error;

  const { id, ...values } = data;
  try {
    await db.transaction(async (tx) => {
      const scope = and(
        eq(clients.id, id),
        eq(clients.organizationId, user.organizationId),
      );
      const [before] = await tx.select().from(clients).where(scope);
      if (!before) throw new ClientNotFoundError();

      const changes = diffFields(
        {
          organizationId: user.organizationId,
          userId: Number(user.id),
          entityType: "client",
          entityId: id,
        },
        before,
        values,
        auditedFields,
      );
      if (changes.length === 0) return;

      await tx.update(clients).set(values).where(scope);
      await recordAudit(tx, changes);
    });
  } catch (err) {
    if (err instanceof ClientNotFoundError) {
      return businessError("This client no longer exists.");
    }
    return unexpectedError(err);
  }

  revalidatePath("/clients");
  redirect("/clients");
}
