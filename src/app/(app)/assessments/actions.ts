"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/db";
import { assessments, companies } from "@/db/schema";
import { type ActionState, businessError, unexpectedError } from "@/lib/action-result";
import { sanitizeAnswers } from "@/lib/assessments/questionnaire";
import { recordAudit } from "@/lib/audit";
import { requireUser } from "@/lib/session";

const optionalText = (max: number) =>
  z
    .string()
    .optional()
    .transform((v) => (v ?? "").trim().slice(0, max) || null);

const headerSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  companyId: z
    .string()
    .optional()
    .transform((v) => (v && Number.isInteger(Number(v)) && Number(v) > 0 ? Number(v) : null)),
  clientName: z.string().trim().min(1, "Indica la empresa o el prospecto.").max(120),
  contactName: optionalText(120),
  contactEmail: optionalText(160),
  contactPhone: optionalText(40),
  conductedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida."),
  status: z.enum(["draft", "completed"]),
  notes: optionalText(4000),
});

/**
 * Crea o actualiza un levantamiento. Las respuestas viajan como JSON en
 * `answers` y se filtran contra el cuestionario en código (sanitizeAnswers):
 * solo se guardan claves y opciones que existen. Ninguna pregunta es
 * obligatoria — un levantamiento a medias se guarda y se completa después.
 */
export async function saveAssessment(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const orgId = user.organizationId;

  const { answers: answersRaw, ...fields } = Object.fromEntries(formData) as Record<string, string>;
  const parsed = headerSchema.safeParse(fields);
  if (!parsed.success) return businessError([...new Set(parsed.error.issues.map((i) => i.message))].join(" "));
  const data = parsed.data;

  let answers;
  try {
    answers = sanitizeAnswers(JSON.parse(answersRaw ?? "{}"));
  } catch {
    return businessError("No se pudieron leer las respuestas. Recarga la página e inténtalo de nuevo.");
  }

  let savedId: number;
  try {
    savedId = await db.transaction(async (tx) => {
      if (data.companyId !== null) {
        const [company] = await tx
          .select({ id: companies.id })
          .from(companies)
          .where(and(eq(companies.id, data.companyId), eq(companies.organizationId, orgId)));
        if (!company) throw new Error("company-not-found");
      }
      const values = {
        companyId: data.companyId,
        clientName: data.clientName,
        contactName: data.contactName,
        contactEmail: data.contactEmail,
        contactPhone: data.contactPhone,
        conductedOn: data.conductedOn,
        status: data.status,
        notes: data.notes,
        answers,
      };
      if (data.id === undefined) {
        const [created] = await tx
          .insert(assessments)
          .values({ ...values, organizationId: orgId, createdById: Number(user.id) })
          .returning({ id: assessments.id });
        await recordAudit(tx, {
          organizationId: orgId,
          userId: Number(user.id),
          entityType: "assessment",
          entityId: created.id,
          action: "create",
          metadata: { clientName: data.clientName, answered: Object.keys(answers).length },
        });
        return created.id;
      }
      const [existing] = await tx
        .select({ id: assessments.id, status: assessments.status })
        .from(assessments)
        .where(and(eq(assessments.id, data.id), eq(assessments.organizationId, orgId)));
      if (!existing) throw new Error("assessment-not-found");
      await tx.update(assessments).set({ ...values, updatedAt: new Date() }).where(eq(assessments.id, existing.id));
      await recordAudit(tx, {
        organizationId: orgId,
        userId: Number(user.id),
        entityType: "assessment",
        entityId: existing.id,
        action: "update",
        field: "answers",
        oldValue: existing.status,
        newValue: data.status,
        metadata: { answered: Object.keys(answers).length },
      });
      return existing.id;
    });
  } catch (err) {
    if (err instanceof Error && err.message === "company-not-found") return businessError("La empresa seleccionada no existe.");
    if (err instanceof Error && err.message === "assessment-not-found") return businessError("El levantamiento no existe.");
    return unexpectedError(err);
  }

  revalidatePath("/assessments");
  redirect(`/assessments/${savedId}`);
}
