import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { helpTutorialSteps, helpTutorials, userTutorialProgress } from "@/db/schema";
import type { HelpModuleKey } from "@/lib/help";

/** Reads for /help. Global content (see schema.ts comment) + per-user progress. */

export async function listTutorials(opts: { includeInactive?: boolean } = {}) {
  const conditions = opts.includeInactive ? [] : [eq(helpTutorials.isActive, true)];
  return db
    .select()
    .from(helpTutorials)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(helpTutorials.module), asc(helpTutorials.sortOrder));
}

export async function getTutorialsWithProgress(userId: number, opts: { includeInactive?: boolean } = {}) {
  const tutorials = await listTutorials(opts);
  if (tutorials.length === 0) return [];
  const progressRows = await db
    .select()
    .from(userTutorialProgress)
    .where(eq(userTutorialProgress.userId, userId));
  const progressByTutorial = new Map(progressRows.map((p) => [p.tutorialId, p]));
  return tutorials.map((t) => ({ tutorial: t, progress: progressByTutorial.get(t.id) ?? null }));
}

export async function getTutorialBySlug(slug: string) {
  const [tutorial] = await db.select().from(helpTutorials).where(eq(helpTutorials.slug, slug));
  if (!tutorial) return null;
  const steps = await db
    .select()
    .from(helpTutorialSteps)
    .where(eq(helpTutorialSteps.tutorialId, tutorial.id))
    .orderBy(asc(helpTutorialSteps.position));
  return { tutorial, steps };
}

export async function getUserProgress(userId: number, tutorialId: number) {
  const [row] = await db
    .select()
    .from(userTutorialProgress)
    .where(
      and(eq(userTutorialProgress.userId, userId), eq(userTutorialProgress.tutorialId, tutorialId)),
    );
  return row ?? null;
}

/** Most recently touched, not-yet-completed tutorial — for Today's "continue learning" card. */
export async function getContinueLearning(userId: number) {
  const [row] = await db
    .select({
      tutorialId: userTutorialProgress.tutorialId,
      slug: helpTutorials.slug,
      title: helpTutorials.title,
      currentStepIndex: userTutorialProgress.currentStepIndex,
      updatedAt: userTutorialProgress.updatedAt,
    })
    .from(userTutorialProgress)
    .innerJoin(helpTutorials, eq(userTutorialProgress.tutorialId, helpTutorials.id))
    .where(
      and(
        eq(userTutorialProgress.userId, userId),
        eq(helpTutorials.isActive, true),
        isNull(userTutorialProgress.completedAt),
      ),
    )
    .orderBy(userTutorialProgress.updatedAt)
    .limit(1);
  return row ?? null;
}


export function recommendedForModule(
  all: Awaited<ReturnType<typeof getTutorialsWithProgress>>,
  moduleKey: HelpModuleKey | null,
  limit = 3,
) {
  if (!moduleKey) return [];
  return all.filter((t) => t.tutorial.module === moduleKey).slice(0, limit);
}
