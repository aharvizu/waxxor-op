"use client";

import { useActionState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlarmClockOff,
  Check,
  CheckCircle2,
  ChevronDown,
  Plus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import {
  buttonClass,
  buttonSecondaryClass,
  cx,
  iconButtonClass,
  inputClass,
} from "@/components/ui";
import { FormAlert } from "@/components/form-feedback";
import type { ActionState } from "@/lib/action-result";
import { OPEN_COMMAND_EVENT } from "@/components/shell/command-menu";
import { Dropdown, MenuLabel, menuItemClass } from "@/components/shell/dropdown";
import { completeActivity, reopenActivity } from "@/app/(app)/activities/actions";
import {
  markConversationAttended,
  markReminder,
  rescheduleWorkItem,
  saveTodayPreferences,
} from "./actions";

function useForm(action: (p: ActionState, f: FormData) => Promise<ActionState>) {
  return useActionState<ActionState, FormData>(action, null);
}

/* ------------------------------------------------------------ header bar */

export function TodayControls({
  scope,
  view,
  filter,
  group,
  date,
  canChooseScope,
}: {
  scope: string;
  view: string;
  filter: string;
  group: string;
  date: string;
  canChooseScope: boolean;
}) {
  return (
    <form
      action={saveTodayPreferences}
      className="flex flex-wrap items-center gap-2"
    >
      <input type="hidden" name="filter" value={filter} />
      <input type="hidden" name="group" value={group} />
      <select
        name="scope"
        key={scope}
        defaultValue={scope}
        aria-label="Alcance"
        disabled={!canChooseScope}
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={cx(inputClass, "h-9 w-auto")}
      >
        <option value="mine">Mi trabajo</option>
        <option value="team">Mi equipo</option>
        <option value="org">Toda la organización</option>
      </select>
      <select
        name="view"
        key={view}
        defaultValue={view}
        aria-label="Vista"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={cx(inputClass, "h-9 w-auto")}
      >
        <option value="list">Lista inteligente</option>
        <option value="agenda">Agenda</option>
        <option value="table">Tabla compacta</option>
      </select>
      <input
        type="date"
        name="date"
        key={date}
        defaultValue={date}
        aria-label="Fecha"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={cx(inputClass, "h-9 w-auto")}
      />
      <RefreshButton />
      <CreateMenu />
      <button
        type="button"
        aria-label="Buscar"
        onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_EVENT))}
        className={iconButtonClass}
      >
        <Search className="size-4" />
      </button>
    </form>
  );
}

function RefreshButton() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      aria-label="Actualizar"
      onClick={() => startTransition(() => router.refresh())}
      className={buttonSecondaryClass}
    >
      <RefreshCw className={cx("size-4", pending && "animate-spin")} /> Actualizar
    </button>
  );
}

function CreateMenu() {
  return (
    <Dropdown
      buttonLabel="Crear"
      buttonClassName={buttonClass}
      button={
        <>
          <Plus className="size-4" /> Crear <ChevronDown className="size-3.5 opacity-70" />
        </>
      }
    >
      <MenuLabel>Crear</MenuLabel>
      <Link href="/activities/new" className={menuItemClass}>
        Actividad
      </Link>
      <Link href="/activities/new?type=meeting" className={menuItemClass}>
        Reunión
      </Link>
      <Link href="/activities/new?type=reminder" className={menuItemClass}>
        Recordatorio / Nota
      </Link>
      <Link href="/helpdesk/new" className={menuItemClass}>
        Ticket
      </Link>
      <Link href="/companies" className={menuItemClass}>
        Empresa
      </Link>
      <Link href="/today?filter=today" className={menuItemClass}>
        Registro de tiempo (desde el elemento)
      </Link>
    </Dropdown>
  );
}

/* -------------------------------------------------------------- reminders */

export function ReminderMarkButtons({
  ruleKey,
  entityType,
  entityId,
  canDismiss,
  canResolve,
}: {
  ruleKey: string;
  entityType: string;
  entityId: number;
  canDismiss: boolean;
  canResolve: boolean;
}) {
  const [state, formAction] = useForm(markReminder);
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <form action={formAction} className="flex items-center gap-1">
        <input type="hidden" name="ruleKey" value={ruleKey} />
        <input type="hidden" name="entityType" value={entityType} />
        <input type="hidden" name="entityId" value={entityId} />
        <input type="hidden" name="mark" value="snoozed" />
        <select
          name="snoozeDays"
          defaultValue="1"
          aria-label="Posponer días"
          className={cx(inputClass, "h-7 w-auto px-1.5 text-xs")}
        >
          <option value="1">1d</option>
          <option value="3">3d</option>
          <option value="7">7d</option>
        </select>
        <button
          type="submit"
          title="Posponer alerta"
          aria-label="Posponer"
          className="flex size-7 items-center justify-center rounded-md text-faint hover:bg-subtle hover:text-fg"
        >
          <AlarmClockOff className="size-3.5" />
        </button>
      </form>
      {canDismiss ? (
        <form action={formAction}>
          <input type="hidden" name="ruleKey" value={ruleKey} />
          <input type="hidden" name="entityType" value={entityType} />
          <input type="hidden" name="entityId" value={entityId} />
          <input type="hidden" name="mark" value="dismissed" />
          <button
            type="submit"
            title="Descartar"
            aria-label="Descartar"
            className="flex size-7 items-center justify-center rounded-md text-faint hover:bg-danger/10 hover:text-danger"
          >
            <X className="size-3.5" />
          </button>
        </form>
      ) : null}
      {canResolve ? (
        <form action={formAction}>
          <input type="hidden" name="ruleKey" value={ruleKey} />
          <input type="hidden" name="entityType" value={entityType} />
          <input type="hidden" name="entityId" value={entityId} />
          <input type="hidden" name="mark" value="resolved" />
          <button
            type="submit"
            title="Marcar como resuelto"
            aria-label="Resolver"
            className="flex size-7 items-center justify-center rounded-md text-faint hover:bg-success/10 hover:text-success"
          >
            <Check className="size-3.5" />
          </button>
        </form>
      ) : null}
      {state && !state.ok ? <FormAlert state={state} /> : null}
    </div>
  );
}

/* --------------------------------------------------------- inline actions */

export function CompleteActivityButton({ activityId }: { activityId: number }) {
  const [state, formAction] = useForm(completeActivity);
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={activityId} />
      <button
        type="submit"
        title="Completar actividad"
        aria-label="Completar"
        className="flex size-7 items-center justify-center rounded-md text-faint hover:bg-success/10 hover:text-success"
      >
        <CheckCircle2 className="size-4" />
      </button>
      {state && !state.ok ? <FormAlert state={state} /> : null}
    </form>
  );
}

export function ReopenActivityButton({ activityId }: { activityId: number }) {
  const [state, formAction] = useForm(reopenActivity);
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={activityId} />
      <button type="submit" className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>
        Reabrir
      </button>
      {state && !state.ok ? <FormAlert state={state} /> : null}
    </form>
  );
}

export function RescheduleControl({
  kind,
  id,
  dueDate,
}: {
  kind: "ticket" | "activity";
  id: number;
  dueDate: string | null;
}) {
  const [state, formAction] = useForm(rescheduleWorkItem);
  return (
    <form action={formAction} className="flex items-center gap-1">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="id" value={id} />
      <input
        type="date"
        name="dueDate"
        key={dueDate ?? "none"}
        defaultValue={dueDate ?? ""}
        aria-label="Posponer fecha"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className={cx(inputClass, "h-7 w-auto px-1.5 text-xs")}
      />
      {state && !state.ok ? <FormAlert state={state} /> : null}
    </form>
  );
}

export function AttendConversationButton({ conversationId }: { conversationId: number }) {
  const [state, formAction] = useForm(markConversationAttended);
  return (
    <form action={formAction}>
      <input type="hidden" name="conversationId" value={conversationId} />
      <button type="submit" className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>
        <Check className="size-3.5" /> Atendida
      </button>
      {state && !state.ok ? <FormAlert state={state} /> : null}
    </form>
  );
}
