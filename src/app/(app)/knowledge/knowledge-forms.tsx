"use client";

import { useActionState } from "react";
import { Star } from "lucide-react";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import { cx, inputClass, labelClass } from "@/components/ui";
import type { ActionState } from "@/lib/action-result";
import {
  archiveArticle,
  createArticle,
  publishArticle,
  requestChanges,
  restoreArticle,
  submitForReview,
  toggleFavoriteArticle,
  updateArticle,
} from "./actions";

export type Option = { id: number; name: string };

export function ArticleForm({
  categories,
  article,
  submitLabel = "Crear artículo",
}: {
  categories: Option[];
  article?: {
    id: number;
    title: string;
    categoryId: number | null;
    problem: string | null;
    cause: string | null;
    solution: string | null;
    steps: string[];
    notes: string | null;
    tags: string[];
  };
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    article ? updateArticle : createArticle,
    null,
  );
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={formAction} className="space-y-4">
      <FormAlert state={state} />
      {article ? <input type="hidden" name="id" value={article.id} /> : null}
      <div>
        <label className={labelClass}>Título</label>
        <input name="title" required defaultValue={article?.title} className={inputClass} />
        <FieldError errors={errors.title} />
      </div>
      <div>
        <label className={labelClass}>Categoría</label>
        <select name="categoryId" defaultValue={article?.categoryId ?? ""} className={inputClass}>
          <option value="">— Sin categoría —</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className={labelClass}>Problema</label>
        <textarea name="problem" rows={2} defaultValue={article?.problem ?? ""} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Causa</label>
        <textarea name="cause" rows={2} defaultValue={article?.cause ?? ""} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Solución</label>
        <textarea name="solution" rows={4} defaultValue={article?.solution ?? ""} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Pasos (uno por línea)</label>
        <textarea name="steps" rows={4} defaultValue={article?.steps?.join("\n") ?? ""} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Notas</label>
        <textarea name="notes" rows={2} defaultValue={article?.notes ?? ""} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>Etiquetas (separadas por coma)</label>
        <input name="tags" defaultValue={article?.tags?.join(", ") ?? ""} className={inputClass} />
      </div>
      {article ? (
        <div>
          <label className={labelClass}>Resumen del cambio (opcional)</label>
          <input name="changeSummary" placeholder="p. ej. Corregí el paso 3" className={inputClass} />
        </div>
      ) : null}
      <SubmitButton>{submitLabel}</SubmitButton>
    </form>
  );
}

export function FavoriteButton({ articleId, isFavorite }: { articleId: number; isFavorite: boolean }) {
  const [state, formAction] = useActionState<ActionState, FormData>(toggleFavoriteArticle, null);
  return (
    <form action={formAction} className="inline-flex">
      <input type="hidden" name="id" value={articleId} />
      <button
        type="submit"
        title={isFavorite ? "Quitar de favoritos" : "Marcar como favorito"}
        className={cx(
          "flex size-8 items-center justify-center rounded-lg border border-edge transition-colors",
          isFavorite ? "bg-primary-soft text-primary" : "text-muted hover:text-fg",
        )}
      >
        <Star className="size-4" aria-hidden />
      </button>
      {state && !state.ok ? <span className="ml-2 text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

function WorkflowActionForm({
  articleId,
  action,
  label,
  danger,
  withNotes,
}: {
  articleId: number;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  label: string;
  danger?: boolean;
  withNotes?: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={articleId} />
      {withNotes ? (
        <textarea name="notes" rows={2} placeholder="Motivo / notas de revisión" className={inputClass} />
      ) : null}
      <button
        type="submit"
        className={cx(danger ? "text-danger" : "text-primary", "text-sm font-medium hover:underline")}
      >
        {label}
      </button>
      {state && !state.ok ? <p className="text-xs text-danger">{state.message}</p> : null}
    </form>
  );
}

export function ArticleWorkflowPanel({
  articleId,
  status,
  canReview,
  canPublish,
}: {
  articleId: number;
  status: string;
  canReview: boolean;
  canPublish: boolean;
}) {
  return (
    <div className="space-y-3">
      {status === "draft" ? (
        <WorkflowActionForm articleId={articleId} action={submitForReview} label="Enviar a revisión →" />
      ) : null}
      {status === "in_review" && canReview ? (
        <WorkflowActionForm articleId={articleId} action={requestChanges} label="Solicitar cambios (regresa a borrador)" withNotes danger />
      ) : null}
      {(status === "draft" || status === "in_review") && canPublish ? (
        <WorkflowActionForm articleId={articleId} action={publishArticle} label="Publicar →" />
      ) : null}
      {status === "published" && canPublish ? (
        <WorkflowActionForm articleId={articleId} action={archiveArticle} label="Archivar" danger />
      ) : null}
      {status === "archived" && canPublish ? (
        <WorkflowActionForm articleId={articleId} action={restoreArticle} label="Restaurar a borrador" />
      ) : null}
    </div>
  );
}
