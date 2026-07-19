"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { helpTutorialSteps, helpTutorials, userTutorialProgress } from "@/db/schema";
import { type ActionState, businessError, parseForm, success, unexpectedError } from "@/lib/action-result";
import { requireUser } from "@/lib/session";

class NotFoundError extends Error {}

function fail(err: unknown): ActionState {
  if (err instanceof NotFoundError) return businessError("El tutorial ya no existe.");
  return unexpectedError(err);
}

async function ensureProgress(userId: number, tutorialId: number) {
  const [existing] = await db
    .select()
    .from(userTutorialProgress)
    .where(and(eq(userTutorialProgress.userId, userId), eq(userTutorialProgress.tutorialId, tutorialId)));
  if (existing) return existing;
  const [created] = await db
    .insert(userTutorialProgress)
    .values({ userId, tutorialId })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [raced] = await db
    .select()
    .from(userTutorialProgress)
    .where(and(eq(userTutorialProgress.userId, userId), eq(userTutorialProgress.tutorialId, tutorialId)));
  return raced;
}

const stepSchema = z.object({
  tutorialId: z.coerce.number().int().positive(),
  stepId: z.coerce.number().int().positive(),
});

/** Toggles a step in the checklist; "continuar donde quedó" reads currentStepIndex. */
export async function toggleTutorialStep(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(stepSchema, formData);
  if (error) return error;

  let slug = "";
  try {
    const [tutorial] = await db.select().from(helpTutorials).where(eq(helpTutorials.id, data.tutorialId));
    if (!tutorial) throw new NotFoundError();
    slug = tutorial.slug;
    const [step] = await db.select().from(helpTutorialSteps).where(and(eq(helpTutorialSteps.id, data.stepId), eq(helpTutorialSteps.tutorialId, data.tutorialId)));
    if (!step) throw new NotFoundError();
    const allSteps = await db.select({ id: helpTutorialSteps.id }).from(helpTutorialSteps).where(eq(helpTutorialSteps.tutorialId, data.tutorialId));

    const progress = await ensureProgress(Number(user.id), data.tutorialId);
    const completed = new Set<number>(Array.isArray(progress?.completedStepIds) ? (progress!.completedStepIds as number[]) : []);
    if (completed.has(data.stepId)) completed.delete(data.stepId);
    else completed.add(data.stepId);

    const allDone = allSteps.length > 0 && allSteps.every((s) => completed.has(s.id));
    await db
      .update(userTutorialProgress)
      .set({
        completedStepIds: [...completed],
        currentStepIndex: Math.min(completed.size, allSteps.length - 1),
        completedAt: allDone ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(userTutorialProgress.id, progress!.id));
  } catch (err) {
    return fail(err);
  }
  if (slug) revalidatePath(`/help/${slug}`);
  revalidatePath("/help");
  return success();
}

const positionSchema = z.object({
  tutorialId: z.coerce.number().int().positive(),
  stepIndex: z.coerce.number().int().min(0),
});

/** Used by the guided tour to persist "continuar donde quedó" as the user advances. */
export async function setTutorialPosition(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(positionSchema, formData);
  if (error) return error;
  const progress = await ensureProgress(Number(user.id), data.tutorialId);
  await db
    .update(userTutorialProgress)
    .set({ currentStepIndex: data.stepIndex, updatedAt: new Date() })
    .where(eq(userTutorialProgress.id, progress!.id));
  revalidatePath("/help");
  return success();
}

const tutorialIdSchema = z.object({ tutorialId: z.coerce.number().int().positive() });

/** "No volver a mostrar" — marks the tutorial dismissed without requiring completion. */
export async function dismissTutorial(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(tutorialIdSchema, formData);
  if (error) return error;
  const progress = await ensureProgress(Number(user.id), data.tutorialId);
  await db
    .update(userTutorialProgress)
    .set({ dismissedAt: new Date(), updatedAt: new Date() })
    .where(eq(userTutorialProgress.id, progress!.id));
  revalidatePath("/help");
  return success();
}

/** Marks a tutorial fully completed directly (e.g. "Marcar como completado" button). */
export async function completeTutorial(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(tutorialIdSchema, formData);
  if (error) return error;
  const allSteps = await db.select({ id: helpTutorialSteps.id }).from(helpTutorialSteps).where(eq(helpTutorialSteps.tutorialId, data.tutorialId));
  const progress = await ensureProgress(Number(user.id), data.tutorialId);
  await db
    .update(userTutorialProgress)
    .set({ completedStepIds: allSteps.map((s) => s.id), completedAt: new Date(), updatedAt: new Date() })
    .where(eq(userTutorialProgress.id, progress!.id));
  revalidatePath("/help");
  return success();
}
