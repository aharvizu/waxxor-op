"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, ArchiveRestore, CheckCircle2, Paperclip, Pencil, RotateCcw, Trash2 } from "lucide-react";
import {
  buttonClass,
  buttonDangerClass,
  buttonSecondaryClass,
  buttonSuccessClass,
  cx,
  inputClass,
} from "@/components/ui";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SearchableSelect } from "@/components/searchable-select";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-result";
import { ACTIVITY_WORKFLOW_STATUSES } from "@/lib/activities";
import { getLabels } from "@/lib/labels";
import { useLocale } from "@/components/locale-provider";
import {
  archiveActivity,
  completeActivity,
  deleteActivity,
  deleteActivityAttachment,
  deleteActivityMessage,
  editActivityMessage,
  logActivityMessage,
  reopenActivity,
  restoreActivity,
  updateActivityWorkflow,
  uploadActivityAttachment,
} from "./actions";

type Option = { id: number; name: string };

/**
 * Status + assignee, compact and inline — lives in the top action row next
 * to the other options instead of its own sidebar card, auto-submitting on
 * change (same pattern as the Helpdesk row-action dropdowns) instead of a
 * separate "Update" button (2026-07-28).
 */
export function WorkflowCard({
  activityId,
  status,
  assigneeId,
  users,
  archived,
}: {
  activityId: number;
  status: string;
  assigneeId: number | null;
  users: Option[];
  archived: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    updateActivityWorkflow,
    null,
  );
  const { activityStatusMeta } = getLabels(useLocale());

  return (
    <div>
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={activityId} />
        <SearchableSelect
          name="status"
          key={status}
          defaultValue={status}
          disabled={archived}
          aria-label="Status"
          submitOnChange
          className="h-9 w-auto disabled:opacity-50"
          options={ACTIVITY_WORKFLOW_STATUSES.map((s) => ({ value: s, label: activityStatusMeta[s]?.label ?? s }))}
        />
        <SearchableSelect
          name="assigneeId"
          key={assigneeId ?? "none"}
          defaultValue={assigneeId ? String(assigneeId) : ""}
          disabled={archived}
          aria-label="Assignee"
          submitOnChange
          className="h-9 w-auto disabled:opacity-50"
          options={[{ value: "", label: "Unassigned" }, ...users.map((u) => ({ value: String(u.id), label: u.name }))]}
        />
      </form>
      {state && !state.ok ? <FormAlert state={state} className="mt-2" /> : null}
    </div>
  );
}

function TransitionButton({
  action,
  activityId,
  className,
  children,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  activityId: number;
  className: string;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={activityId} />
      {state && !state.ok ? <FormAlert state={state} /> : null}
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}

/** Complete/Reopen + Archive/Restore quick actions. */
export function TransitionButtons({
  activityId,
  completed,
  archived,
}: {
  activityId: number;
  completed: boolean;
  archived: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {archived ? (
        <TransitionButton
          action={restoreActivity}
          activityId={activityId}
          className={buttonClass}
        >
          <ArchiveRestore /> Restore
        </TransitionButton>
      ) : (
        <>
          {completed ? (
            <TransitionButton
              action={reopenActivity}
              activityId={activityId}
              className={buttonSecondaryClass}
            >
              <RotateCcw /> Reopen
            </TransitionButton>
          ) : (
            <TransitionButton
              action={completeActivity}
              activityId={activityId}
              className={buttonSuccessClass}
            >
              <CheckCircle2 /> Complete
            </TransitionButton>
          )}
          <TransitionButton
            action={archiveActivity}
            activityId={activityId}
            className={buttonSecondaryClass}
          >
            <Archive /> Archive
          </TransitionButton>
        </>
      )}
    </div>
  );
}

/** SuperAdmin-only permanent delete — blocked server-side when the activity has real history (see actions.ts). Redirects to the list on success since this deletes the very entity the page is showing. */
export function DeleteActivityButton({ activityId }: { activityId: number }) {
  const router = useRouter();
  const [state, formAction] = useActionState<ActionState, FormData>(deleteActivity, null);

  useEffect(() => {
    if (state?.ok) router.push("/activities");
  }, [state, router]);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!window.confirm("¿Eliminar esta actividad permanentemente? Esta acción no se puede deshacer.")) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={activityId} />
      <button type="submit" className={buttonDangerClass}>
        <Trash2 /> Delete
      </button>
      {state && !state.ok ? <FormAlert state={state} className="mt-2 w-full" /> : null}
    </form>
  );
}

/* -------------------------------------------------------------- files */

export function ActivityUploadForm({ activityId }: { activityId: number }) {
  const [state, formAction] = useActionState<ActionState, FormData>(uploadActivityAttachment, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const [fileName, setFileName] = useState<string | null>(null);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="id" value={activityId} />
      <label className={cx(buttonSecondaryClass, "h-9 cursor-pointer")}>
        Elegir archivo
        <input
          type="file"
          name="file"
          required
          className="hidden"
          onChange={(e) => setFileName(e.currentTarget.files?.[0]?.name ?? null)}
        />
      </label>
      <span className="text-sm text-muted">{fileName ?? "Ningún archivo seleccionado"}</span>
      <SubmitButton>
        <Paperclip /> Adjuntar
      </SubmitButton>
      <FormAlert state={state} className="w-full" />
      <FieldError errors={errors.file} />
    </form>
  );
}

export function DeleteActivityAttachmentButton({
  attachmentId,
  activityId,
}: {
  attachmentId: number;
  activityId: number;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(deleteActivityAttachment, null);
  return (
    <form action={formAction}>
      <input type="hidden" name="attachmentId" value={attachmentId} />
      <input type="hidden" name="activityId" value={activityId} />
      <button
        type="submit"
        aria-label="Eliminar adjunto"
        className="flex size-7 items-center justify-center rounded-md text-faint hover:bg-danger/10 hover:text-danger"
      >
        <Trash2 className="size-3.5" />
      </button>
      {state && !state.ok ? <FormAlert state={state} /> : null}
    </form>
  );
}

/* -------------------------------------------------------- conversation */

export function ActivityComposer({ activityId }: { activityId: number }) {
  const [state, formAction] = useActionState<ActionState, FormData>(logActivityMessage, null);
  const [kind, setKind] = useState<"outbound" | "inbound" | "note" | "call">("outbound");
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-dashed border-edge-strong p-4">
      <input type="hidden" name="id" value={activityId} />
      <FormAlert state={state} />
      <div className="flex flex-wrap gap-2 text-sm">
        {(
          [
            ["outbound", "Mensaje al cliente"],
            ["inbound", "Mensaje recibido"],
            ["note", "Nota interna"],
            ["call", "Llamada"],
          ] as const
        ).map(([v, label]) => (
          <label
            key={v}
            className={cx(
              "cursor-pointer rounded-md border px-2.5 py-1 transition-colors",
              kind === v
                ? "border-primary/40 bg-primary-soft text-primary"
                : "border-edge text-muted hover:bg-subtle",
            )}
          >
            <input
              type="radio"
              name="kind"
              value={v}
              checked={kind === v}
              onChange={() => setKind(v)}
              className="sr-only"
            />
            {label}
          </label>
        ))}
        {kind !== "note" && kind !== "call" ? (
          <SearchableSelect
            name="channel"
            defaultValue="manual"
            aria-label="Canal"
            className="h-8 w-auto text-xs"
            options={[
              { value: "manual", label: "manual" },
              { value: "whatsapp", label: "whatsapp" },
              { value: "email", label: "email" },
              { value: "phone", label: "phone" },
              { value: "portal", label: "portal" },
            ]}
          />
        ) : null}
      </div>
      <textarea
        name="body"
        rows={3}
        required
        placeholder={kind === "note" ? "Nota interna (nunca visible al cliente)…" : "Qué se dijo…"}
        aria-invalid={errors.body ? true : undefined}
        className={inputClass}
      />
      <FieldError errors={errors.body} />
      <SubmitButton>{kind === "note" ? "Agregar nota" : "Registrar interacción"}</SubmitButton>
    </form>
  );
}

export function ActivityMessageActions({
  messageId,
  activityId,
  body,
}: {
  messageId: number;
  activityId: number;
  body: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editState, editAction] = useActionState<ActionState, FormData>(editActivityMessage, null);
  const [deleteState, deleteAction] = useActionState<ActionState, FormData>(deleteActivityMessage, null);

  return (
    <div>
      <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          aria-label="Editar mensaje"
          onClick={() => setEditing((v) => !v)}
          className="flex size-6 items-center justify-center rounded text-faint hover:bg-primary-soft hover:text-primary"
        >
          <Pencil className="size-3" />
        </button>
        <form action={deleteAction}>
          <input type="hidden" name="messageId" value={messageId} />
          <input type="hidden" name="activityId" value={activityId} />
          <button
            type="submit"
            aria-label="Eliminar mensaje"
            className="flex size-6 items-center justify-center rounded text-faint hover:bg-danger/10 hover:text-danger"
          >
            <Trash2 className="size-3" />
          </button>
        </form>
      </span>
      {deleteState && !deleteState.ok ? <FormAlert state={deleteState} className="mt-1" /> : null}
      {editing ? (
        <form action={editAction} className="mt-2 space-y-2">
          <input type="hidden" name="messageId" value={messageId} />
          <input type="hidden" name="activityId" value={activityId} />
          <textarea name="body" rows={2} defaultValue={body} required className={inputClass} />
          <span className="flex gap-1.5">
            <SubmitButton className="h-7 px-2 text-xs">Guardar</SubmitButton>
            <button type="button" onClick={() => setEditing(false)} className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>
              Cancelar
            </button>
          </span>
          {editState && !editState.ok ? <FormAlert state={editState} className="mt-1" /> : null}
        </form>
      ) : null}
    </div>
  );
}
