"use client";

import { useActionState, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronLeft, ChevronRight, X } from "lucide-react";
import { buttonClass, buttonSecondaryClass, cx } from "@/components/ui";
import type { ActionState } from "@/lib/action-result";
import { completeTutorial, dismissTutorial, setTutorialPosition, toggleTutorialStep } from "./actions";

export type StepData = {
  id: number;
  position: number;
  title: string;
  body: string;
  screenshotPlaceholder: string | null;
};

/* --------------------------------------------------------------- checklist */

export function StepChecklistItem({
  tutorialId,
  step,
  completed,
}: {
  tutorialId: number;
  step: StepData;
  completed: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(toggleTutorialStep, null);
  return (
    <form action={formAction} className="flex items-start gap-3 border-b border-edge py-3 last:border-b-0">
      <input type="hidden" name="tutorialId" value={tutorialId} />
      <input type="hidden" name="stepId" value={step.id} />
      <button
        type="submit"
        aria-pressed={completed}
        aria-label={completed ? "Marcar como pendiente" : "Marcar como hecho"}
        className={cx(
          "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
          completed ? "border-success bg-success text-white" : "border-edge-strong text-transparent",
        )}
      >
        <Check className="size-3.5" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <p className={cx("text-sm font-medium", completed ? "text-muted line-through" : "text-fg")}>
          {step.position}. {step.title}
        </p>
        <p className="mt-0.5 text-sm text-muted">{step.body}</p>
        {step.screenshotPlaceholder ? (
          <div className="mt-2 flex h-24 items-center justify-center rounded-lg border border-dashed border-edge-strong bg-subtle text-xs text-faint">
            {step.screenshotPlaceholder}
          </div>
        ) : null}
      </div>
      {state && !state.ok ? <span className="text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

/* ---------------------------------------------------------- complete/dismiss */

export function CompleteTutorialButton({ tutorialId, completed }: { tutorialId: number; completed: boolean }) {
  const [state, formAction] = useActionState<ActionState, FormData>(completeTutorial, null);
  if (completed) return <span className="text-sm font-medium text-success">✓ Completado</span>;
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="tutorialId" value={tutorialId} />
      <button type="submit" className={buttonClass}>Marcar como completado</button>
      {state && !state.ok ? <span className="text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

export function DismissTutorialButton({ tutorialId, dismissed }: { tutorialId: number; dismissed: boolean }) {
  const [state, formAction] = useActionState<ActionState, FormData>(dismissTutorial, null);
  if (dismissed) return <span className="text-xs text-faint">No se mostrará como pendiente.</span>;
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="tutorialId" value={tutorialId} />
      <button type="submit" className="text-xs text-muted hover:text-fg hover:underline">
        No volver a mostrar
      </button>
      {state && !state.ok ? <span className="text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

/* --------------------------------------------------------------- guided tour */

/**
 * Lightweight step-sequence overlay — not DOM-anchored tooltips (would need a
 * positioning engine beyond this sprint's scope), but a focused, one-step-at-a-
 * time walkthrough of the same content as the checklist. Position persists via
 * setTutorialPosition so "continuar donde quedó" works from Today/Help alike.
 */
export function GuidedTour({
  tutorialId,
  title,
  steps,
  startIndex,
}: {
  tutorialId: number;
  title: string;
  steps: StepData[];
  startIndex: number;
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(Math.min(startIndex, steps.length - 1));

  async function go(next: number) {
    const clamped = Math.max(0, Math.min(next, steps.length - 1));
    setIndex(clamped);
    const fd = new FormData();
    fd.set("tutorialId", String(tutorialId));
    fd.set("stepIndex", String(clamped));
    await setTutorialPosition(null, fd);
  }

  if (steps.length === 0) return null;
  const step = steps[index];

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonSecondaryClass}>
        Iniciar recorrido guiado
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/50 p-4"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              role="dialog"
              aria-modal="true"
              aria-label={`Recorrido: ${title}`}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-xl border border-edge bg-surface p-5 shadow-overlay"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wide text-faint uppercase">
                  Paso {index + 1} de {steps.length}
                </span>
                <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar" className="text-faint hover:text-fg">
                  <X className="size-4" />
                </button>
              </div>
              <h3 className="mb-2 text-base font-semibold text-fg">{step.title}</h3>
              <p className="mb-3 text-sm text-muted">{step.body}</p>
              {step.screenshotPlaceholder ? (
                <div className="mb-4 flex h-28 items-center justify-center rounded-lg border border-dashed border-edge-strong bg-subtle text-xs text-faint">
                  {step.screenshotPlaceholder}
                </div>
              ) : null}
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => go(index - 1)}
                  disabled={index === 0}
                  className={cx(buttonSecondaryClass, "disabled:opacity-40")}
                >
                  <ChevronLeft className="size-4" /> Anterior
                </button>
                {index === steps.length - 1 ? (
                  <button type="button" onClick={() => setOpen(false)} className={buttonClass}>
                    Terminar
                  </button>
                ) : (
                  <button type="button" onClick={() => go(index + 1)} className={buttonClass}>
                    Siguiente <ChevronRight className="size-4" />
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
