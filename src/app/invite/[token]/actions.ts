"use server";

import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  type ActionState,
  businessError,
  parseForm,
  unexpectedError,
} from "@/lib/action-result";
import { recordAudit } from "@/lib/audit";

const acceptSchema = z
  .object({
    token: z.string().trim().min(1),
    password: z.string().min(8, "Mínimo 8 caracteres."),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Las contraseñas no coinciden.",
    path: ["confirm"],
  });

/**
 * Public action: an invited user sets their password. The token is the only
 * credential; it is single-use (cleared in the same transaction).
 */
export async function acceptInvitation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const { data, error } = parseForm(acceptSchema, formData);
    if (error) return error;

    const [invited] = await db
      .select()
      .from(users)
      .where(eq(users.invitationToken, data.token));
    if (!invited) return businessError("Esta invitación no es válida o ya fue utilizada.");
    if (!invited.isActive) return businessError("Esta cuenta está desactivada. Contacta a tu administrador.");

    const passwordHash = await bcrypt.hash(data.password, 12);
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash, invitationToken: null })
        .where(eq(users.id, invited.id));
      await recordAudit(tx, {
        organizationId: invited.organizationId,
        userId: invited.id,
        entityType: "user",
        entityId: invited.id,
        action: "update",
        metadata: { event: "invitation_accepted" },
      });
    });
  } catch (err) {
    return unexpectedError(err);
  }
  redirect("/login?invited=1");
}
