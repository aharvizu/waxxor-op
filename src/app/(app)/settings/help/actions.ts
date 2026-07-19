"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { helpTutorials } from "@/db/schema";
import { type ActionState, businessError, parseForm, success, unexpectedError } from "@/lib/action-result";
import { recordAudit } from "@/lib/audit";
import { requireRole } from "@/lib/session";

/**
 * Tutorials are seeded content (see scripts/seed-help.ts) — Settings lets
 * SuperAdmin/Administrator activate/deactivate them, not author new ones
 * (a full content editor is out of scope, spec: no LMS completo).
 */
export async function toggleTutorialActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireRole("superadmin", "administrator");
  const { data, error } = parseForm(z.object({ id: z.coerce.number().int().positive() }), formData);
  if (error) return error;

  try {
    const [tutorial] = await db.select().from(helpTutorials).where(eq(helpTutorials.id, data.id));
    if (!tutorial) return businessError("El tutorial ya no existe.");
    const next = !tutorial.isActive;
    await db.transaction(async (tx) => {
      await tx.update(helpTutorials).set({ isActive: next, updatedAt: new Date() }).where(eq(helpTutorials.id, data.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "help_tutorial",
        entityId: data.id,
        action: "update",
        field: "isActive",
        oldValue: String(tutorial.isActive),
        newValue: String(next),
        metadata: { event: next ? "activated" : "deactivated", slug: tutorial.slug },
      });
    });
  } catch (err) {
    return unexpectedError(err);
  }
  revalidatePath("/settings/help");
  revalidatePath("/help");
  return success();
}
