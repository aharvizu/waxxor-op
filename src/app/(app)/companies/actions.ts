"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { companies } from "@/db/schema";
import { type ActionState, parseForm, success, unexpectedError } from "@/lib/action-result";
import { recordAudit } from "@/lib/audit";
import { requireUser } from "@/lib/session";
import { getSetting } from "@/lib/settings-data";

/** Optional free-text field: trims and normalizes empty to null. */
const optionalText = z
  .string()
  .optional()
  .transform((value) => (value ?? "").trim() || null);

/**
 * Minimal quick-add used from the companies list. Full profile editing (status,
 * owners, address, …) lives in client360-actions.ts's updateClientProfile.
 */
const clientSchema = z.object({
  name: z.string("Company name is required.").trim().min(1, "Company name is required."),
  contactName: optionalText,
  email: optionalText.pipe(z.email("Enter a valid email address.").nullable()),
  phone: optionalText,
  notes: optionalText,
});

export async function createClient(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(clientSchema, formData);
  if (error) return error;

  // Org defaults (Settings -> Clientes) apply only when the quick form leaves them empty.
  const orgDefaults = await getSetting(user.organizationId, "companies.defaults");
  const values = {
    ...data,
    accountOwnerId:
      ("accountOwnerId" in data ? (data as { accountOwnerId?: number | null }).accountOwnerId : null) ??
      orgDefaults.defaultAccountOwnerId ??
      null,
    defaultTechnicianId:
      ("defaultTechnicianId" in data ? (data as { defaultTechnicianId?: number | null }).defaultTechnicianId : null) ??
      orgDefaults.defaultTechnicianId ??
      null,
  };

  try {
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(companies)
        .values({ ...values, organizationId: user.organizationId })
        .returning({ id: companies.id });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "client",
        entityId: created.id,
        action: "create",
        metadata: { values },
      });
    });
  } catch (err) {
    return unexpectedError(err);
  }
  revalidatePath("/companies");
  return success("Client added.");
}
