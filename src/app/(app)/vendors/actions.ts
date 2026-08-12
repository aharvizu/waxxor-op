"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { vendors } from "@/db/schema";
import { type ActionState, parseForm, success, unexpectedError } from "@/lib/action-result";
import { recordAudit } from "@/lib/audit";
import { requireUser } from "@/lib/session";

const optionalText = z
  .string()
  .optional()
  .transform((value) => (value ?? "").trim() || null);

/** Minimal quick-add used from the vendors list. Full profile editing (status, category, address, owner, …) lives in vendor360-actions.ts's updateVendorProfile. */
const vendorSchema = z.object({
  name: z.string("Vendor name is required.").trim().min(1, "Vendor name is required."),
  contactName: optionalText,
  email: optionalText.pipe(z.email("Enter a valid email address.").nullable()),
  phone: optionalText,
  notes: optionalText,
});

export async function createVendor(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(vendorSchema, formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(vendors)
        .values({ ...data, organizationId: user.organizationId })
        .returning({ id: vendors.id });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "vendor",
        entityId: created.id,
        action: "create",
        metadata: { values: data },
      });
    });
  } catch (err) {
    return unexpectedError(err);
  }
  revalidatePath("/vendors");
  return success("Vendor added.");
}
