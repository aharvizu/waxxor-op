import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowRight, Lightbulb } from "lucide-react";
import { HELP_MODULE_LABELS, isStepCompleted } from "@/lib/help";
import { getTutorialBySlug, getUserProgress } from "@/lib/help-data";
import { requireUser } from "@/lib/session";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { CompleteTutorialButton, DismissTutorialButton, GuidedTour, StepChecklistItem } from "../help-forms";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const data = await getTutorialBySlug(slug);
  return { title: data?.tutorial.title ?? "Tutorial" };
}

export default async function TutorialPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const user = await requireUser();
  const { slug } = await params;
  const data = await getTutorialBySlug(slug);
  if (!data || !data.tutorial.isActive) notFound();
  const { tutorial, steps } = data;

  const progress = await getUserProgress(Number(user.id), tutorial.id);
  const completedIds = Array.isArray(progress?.completedStepIds) ? (progress!.completedStepIds as number[]) : [];
  const tips = (tutorial.tips as string[]) ?? [];
  const mistakes = (tutorial.commonMistakes as string[]) ?? [];

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={tutorial.title}
        subtitle={`${HELP_MODULE_LABELS[tutorial.module]} · ${tutorial.objective}`}
        action={
          <Link href={tutorial.moduleHref} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            Ir al módulo <ArrowRight className="size-4" />
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <GuidedTour
          tutorialId={tutorial.id}
          title={tutorial.title}
          steps={steps}
          startIndex={progress?.currentStepIndex ?? 0}
        />
        <CompleteTutorialButton tutorialId={tutorial.id} completed={Boolean(progress?.completedAt)} />
        <DismissTutorialButton tutorialId={tutorial.id} dismissed={Boolean(progress?.dismissedAt)} />
      </div>

      <Card className="mb-6 overflow-hidden">
        <CardHeader title={`Pasos (${completedIds.length}/${steps.length})`} description="Marca cada paso al completarlo — tu progreso se guarda." />
        <div className="px-5">
          {steps.map((step) => (
            <StepChecklistItem key={step.id} tutorialId={tutorial.id} step={step} completed={isStepCompleted(completedIds, step.id)} />
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        {tips.length > 0 ? (
          <Card className="p-5">
            <CardHeader title="Tips" className="mb-3 px-0 pt-0" />
            <ul className="space-y-2 text-sm text-fg">
              {tips.map((t, i) => (
                <li key={i} className="flex items-start gap-2">
                  <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-500" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        {mistakes.length > 0 ? (
          <Card className="p-5">
            <CardHeader title="Errores comunes" className="mb-3 px-0 pt-0" />
            <ul className="space-y-2 text-sm text-fg">
              {mistakes.map((m, i) => (
                <li key={i} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                  {m}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </div>

      <Badge tone="slate" className="mt-6">{HELP_MODULE_LABELS[tutorial.module]}</Badge>
    </div>
  );
}
