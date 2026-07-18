"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Paperclip, Pencil, Pin, Star, Trash2 } from "lucide-react";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import {
  buttonDangerClass,
  buttonSecondaryClass,
  cx,
  inputClass,
  labelClass,
} from "@/components/ui";
import type { ActionState } from "@/lib/action-result";
import {
  addConversationParticipant,
  createConversation,
  deleteInboxMessage,
  editInboxMessage,
  linkConversation,
  markConversationRead,
  markConversationUnread,
  sendInboxMessage,
  setConversationStatus,
  toggleFavoriteConversation,
  togglePinConversation,
} from "./actions";

export type Option = { id: number; name: string };

const CHANNEL_OPTIONS = [
  { value: "internal", label: "Interno" },
  { value: "whatsapp", label: "WhatsApp (registro)" },
  { value: "email", label: "Email (registro)" },
  { value: "teams", label: "Teams (registro)" },
  { value: "phone", label: "Teléfono (registro)" },
  { value: "manual", label: "Otro" },
];

/* ------------------------------------------------------------- composer */

export function Composer({
  conversationId,
  internalUsers,
  archived,
}: {
  conversationId: number;
  internalUsers: Option[];
  archived: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(sendInboxMessage, null);
  const [kind, setKind] = useState<"reply" | "note" | "inbound">("reply");
  const [showMentions, setShowMentions] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      setShowMentions(false);
    }
  }, [state]);

  if (archived) {
    return (
      <p className="border-t border-edge px-4 py-3 text-sm text-muted">
        Conversación archivada — restáurala para escribir.
      </p>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="space-y-2 border-t border-edge p-4">
      <FormAlert state={state} />
      <input type="hidden" name="conversationId" value={conversationId} />
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {(
          [
            ["reply", "Responder"],
            ["note", "Nota interna"],
            ["inbound", "Registrar entrante"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setKind(k)}
            className={cx(
              "rounded-full border px-3 py-1 transition-colors",
              kind === k
                ? "border-primary bg-primary-soft font-medium text-primary"
                : "border-edge text-muted hover:text-fg",
            )}
          >
            {label}
          </button>
        ))}
        {kind !== "note" ? (
          <select name="channel" defaultValue="internal" className={cx(inputClass, "h-7 w-auto text-xs")}>
            {CHANNEL_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        ) : (
          <input type="hidden" name="channel" value="internal" />
        )}
      </div>
      <input type="hidden" name="kind" value={kind} />
      <textarea
        name="body"
        rows={3}
        required
        placeholder={
          kind === "note"
            ? "Nota interna — nunca visible fuera del equipo…"
            : kind === "inbound"
              ? "Registra lo que escribió el cliente…"
              : "Escribe tu respuesta…"
        }
        className={cx(inputClass, kind === "note" && "border-amber-300 bg-amber-50/40 dark:bg-amber-400/5")}
      />
      <FieldError errors={errors.body} />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className={cx(buttonSecondaryClass, "h-8 cursor-pointer px-2 text-xs")}>
            <Paperclip className="size-3.5" aria-hidden /> Adjuntar
            <input type="file" name="files" multiple className="hidden" />
          </label>
          <button
            type="button"
            onClick={() => setShowMentions((v) => !v)}
            className={cx(buttonSecondaryClass, "h-8 px-2 text-xs")}
          >
            @ Mencionar
          </button>
        </div>
        <SubmitButton className="h-8">
          {kind === "note" ? "Guardar nota" : kind === "inbound" ? "Registrar" : "Enviar"}
        </SubmitButton>
      </div>
      {showMentions ? (
        <div className="max-h-28 space-y-1 overflow-y-auto rounded-lg border border-edge p-2">
          {internalUsers.map((u) => (
            <label key={u.id} className="flex items-center gap-2 text-sm text-fg">
              <input type="checkbox" name="mentionUserIds" value={u.id} />
              {u.name}
            </label>
          ))}
        </div>
      ) : null}
    </form>
  );
}

/* -------------------------------------------------------- message actions */

export function MessageActions({
  messageId,
  conversationId,
  body,
}: {
  messageId: number;
  conversationId: number;
  body: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editState, editAction] = useActionState<ActionState, FormData>(editInboxMessage, null);
  const [deleteState, deleteAction] = useActionState<ActionState, FormData>(deleteInboxMessage, null);

  useEffect(() => {
    if (editState?.ok) setEditing(false);
  }, [editState]);

  if (editing) {
    return (
      <form action={editAction} className="mt-1 space-y-1.5">
        <input type="hidden" name="messageId" value={messageId} />
        <input type="hidden" name="conversationId" value={conversationId} />
        <textarea name="body" rows={2} defaultValue={body} required className={inputClass} />
        <span className="flex gap-1.5">
          <SubmitButton className="h-7 px-2 text-xs">Guardar</SubmitButton>
          <button type="button" onClick={() => setEditing(false)} className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>
            Cancelar
          </button>
        </span>
        {editState && !editState.ok ? <span className="text-xs text-danger">{editState.message}</span> : null}
      </form>
    );
  }

  return (
    <span className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      <button
        type="button"
        onClick={() => setEditing(true)}
        title="Editar"
        className="text-faint hover:text-fg"
      >
        <Pencil className="size-3.5" aria-hidden />
      </button>
      <form action={deleteAction} className="inline-flex">
        <input type="hidden" name="messageId" value={messageId} />
        <input type="hidden" name="conversationId" value={conversationId} />
        <button type="submit" title="Eliminar" className="text-faint hover:text-danger">
          <Trash2 className="size-3.5" aria-hidden />
        </button>
      </form>
      {deleteState && !deleteState.ok ? (
        <span className="text-xs text-danger">{deleteState.message}</span>
      ) : null}
    </span>
  );
}

/* ------------------------------------------------------- header controls */

function ActionIconForm({
  action,
  conversationId,
  title,
  active,
  children,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  conversationId: number;
  title: string;
  active?: boolean;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  return (
    <form action={formAction} className="inline-flex">
      <input type="hidden" name="conversationId" value={conversationId} />
      <button
        type="submit"
        title={state && !state.ok ? state.message : title}
        className={cx(
          "flex size-7 items-center justify-center rounded-lg border border-edge transition-colors",
          active ? "bg-primary-soft text-primary" : "text-muted hover:text-fg",
        )}
      >
        {children}
      </button>
    </form>
  );
}

export function ConversationControls({
  conversationId,
  pinned,
  favorite,
  hasUnread,
}: {
  conversationId: number;
  pinned: boolean;
  favorite: boolean;
  hasUnread: boolean;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <ActionIconForm
        action={togglePinConversation}
        conversationId={conversationId}
        title={pinned ? "Quitar fijado" : "Fijar conversación"}
        active={pinned}
      >
        <Pin className="size-3.5" aria-hidden />
      </ActionIconForm>
      <ActionIconForm
        action={toggleFavoriteConversation}
        conversationId={conversationId}
        title={favorite ? "Quitar de favoritas" : "Marcar favorita"}
        active={favorite}
      >
        <Star className="size-3.5" aria-hidden />
      </ActionIconForm>
      <MarkUnreadButton conversationId={conversationId} hasUnread={hasUnread} />
    </span>
  );
}

function MarkUnreadButton({ conversationId, hasUnread }: { conversationId: number; hasUnread: boolean }) {
  return hasUnread ? (
    <ReadStateForm conversationId={conversationId} action={markConversationRead} label="Marcar leída" />
  ) : (
    <ReadStateForm conversationId={conversationId} action={markConversationUnread} label="Marcar no leída" />
  );
}

function ReadStateForm({
  conversationId,
  action,
  label,
}: {
  conversationId: number;
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  label: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  return (
    <form action={formAction} className="inline-flex">
      <input type="hidden" name="conversationId" value={conversationId} />
      <button
        type="submit"
        className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}
        title={state && !state.ok ? state.message : undefined}
      >
        {label}
      </button>
    </form>
  );
}

export function StatusSelectForm({
  conversationId,
  status,
}: {
  conversationId: number;
  status: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(setConversationStatus, null);
  const formRef = useRef<HTMLFormElement>(null);
  return (
    <form ref={formRef} action={formAction} className="inline-flex items-center gap-1.5">
      <input type="hidden" name="conversationId" value={conversationId} />
      <select
        name="status"
        defaultValue={status}
        onChange={() => formRef.current?.requestSubmit()}
        className={cx(inputClass, "h-7 w-auto text-xs")}
      >
        <option value="open">Abierta</option>
        <option value="pending">Pendiente</option>
        <option value="closed">Cerrada</option>
        <option value="archived">Archivada</option>
      </select>
      {state && !state.ok ? <span className="text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

/** Marks the conversation read once when the chat is opened. */
export function AutoMarkRead({ conversationId, hasUnread }: { conversationId: number; hasUnread: boolean }) {
  const [, formAction] = useActionState<ActionState, FormData>(markConversationRead, null);
  const fired = useRef(false);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (hasUnread && !fired.current) {
      fired.current = true;
      ref.current?.requestSubmit();
    }
  }, [hasUnread, conversationId]);
  return (
    <form ref={ref} action={formAction} className="hidden">
      <input type="hidden" name="conversationId" value={conversationId} />
    </form>
  );
}

/* -------------------------------------------------- create / link / people */

export function NewConversationForm({
  clients,
  projects,
  prefill,
}: {
  clients: Option[];
  projects: Option[];
  prefill?: { clientId?: number; projectId?: number; workItemId?: number; ticketId?: number };
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(createConversation, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={formAction} className="space-y-3">
      <FormAlert state={state} />
      {prefill?.workItemId ? <input type="hidden" name="workItemId" value={prefill.workItemId} /> : null}
      {prefill?.ticketId ? <input type="hidden" name="ticketId" value={prefill.ticketId} /> : null}
      <div>
        <label className={labelClass}>Asunto</label>
        <input name="subject" maxLength={200} className={inputClass} />
        <FieldError errors={errors.subject} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Cliente (opcional)</label>
          <select name="clientId" defaultValue={prefill?.clientId ?? ""} className={inputClass}>
            <option value="">— Sin cliente —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Proyecto (opcional)</label>
          <select name="projectId" defaultValue={prefill?.projectId ?? ""} className={inputClass}>
            <option value="">— Sin proyecto —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className={labelClass}>Primer mensaje (opcional)</label>
        <textarea name="body" rows={3} className={inputClass} />
      </div>
      <SubmitButton>Crear conversación</SubmitButton>
    </form>
  );
}

export function LinkConversationForm({
  conversationId,
  clients,
  projects,
  current,
}: {
  conversationId: number;
  clients: Option[];
  projects: Option[];
  current: {
    clientId: number | null;
    contactId: number | null;
    ticketId: number | null;
    workItemId: number | null;
    projectId: number | null;
  };
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(linkConversation, null);
  return (
    <form action={formAction} className="space-y-2">
      <FormAlert state={state} />
      <input type="hidden" name="id" value={conversationId} />
      {current.contactId ? <input type="hidden" name="contactId" value={current.contactId} /> : null}
      {current.ticketId ? <input type="hidden" name="ticketId" value={current.ticketId} /> : null}
      {current.workItemId ? <input type="hidden" name="workItemId" value={current.workItemId} /> : null}
      <div className="grid grid-cols-1 gap-2">
        <select name="clientId" defaultValue={current.clientId ?? ""} className={cx(inputClass, "h-8 text-xs")}>
          <option value="">— Sin cliente —</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <select name="projectId" defaultValue={current.projectId ?? ""} className={cx(inputClass, "h-8 text-xs")}>
          <option value="">— Sin proyecto —</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>
      <SubmitButton className="h-7 px-2 text-xs">Actualizar vínculos</SubmitButton>
    </form>
  );
}

export function AddParticipantForm({
  conversationId,
  candidates,
}: {
  conversationId: number;
  candidates: Option[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(addConversationParticipant, null);
  if (candidates.length === 0) return null;
  return (
    <form action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="conversationId" value={conversationId} />
      <select name="userId" className={cx(inputClass, "h-7 w-auto text-xs")}>
        {candidates.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
      <SubmitButton className="h-7 px-2 text-xs">Agregar</SubmitButton>
      {state && !state.ok ? <span className="text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}
