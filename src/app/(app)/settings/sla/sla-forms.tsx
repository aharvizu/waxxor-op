"use client";

import { useState, useActionState } from "react";
import { Pencil, Power } from "lucide-react";
import {
  Badge,
  buttonSecondaryClass,
  cx,
  inputClass,
  labelClass,
} from "@/components/ui";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SearchableSelect } from "@/components/searchable-select";
import { SubmitButton } from "@/components/submit-button";
import { useLocale } from "@/components/locale-provider";
import { t, type Locale } from "@/lib/i18n";
import type { ActionState } from "@/lib/action-result";
import type { TicketPriorityRow } from "@/lib/ticket-catalogs";
import { formatMinutes } from "@/lib/time-entries";
import {
  createSlaDefinition,
  saveCalendar,
  toggleSlaDefinition,
  updateSlaDefinition,
} from "./actions";

function DefinitionFields({
  errors,
  defaults,
  priorities,
  locale,
}: {
  errors: Record<string, string[]>;
  defaults?: {
    name: string;
    description: string | null;
    priorityId: number;
    firstResponseMinutes: number;
    resolutionMinutes: number;
    businessHoursOnly: boolean;
    isDefault: boolean;
  };
  priorities: TicketPriorityRow[];
  locale: Locale;
}) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>{t("Nombre", "Name", locale)}</label>
          <input
            name="name"
            required
            placeholder={t("ej. Crítico 24/7", "e.g. Critical 24/7", locale)}
            defaultValue={defaults?.name ?? ""}
            aria-invalid={errors.name ? true : undefined}
            className={inputClass}
          />
          <FieldError errors={errors.name} />
        </div>
        <div>
          <label className={labelClass}>{t("Prioridad a la que aplica", "Priority it applies to", locale)}</label>
          <SearchableSelect
            name="priorityId"
            defaultValue={String(defaults?.priorityId ?? priorities[0]?.id ?? "")}
            options={priorities.map((p) => ({ value: String(p.id), label: p.name }))}
          />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>{t("Primera respuesta (minutos)", "First response (minutes)", locale)}</label>
          <input
            name="firstResponseMinutes"
            type="number"
            min="1"
            required
            defaultValue={defaults?.firstResponseMinutes ?? ""}
            aria-invalid={errors.firstResponseMinutes ? true : undefined}
            className={inputClass}
          />
          <FieldError errors={errors.firstResponseMinutes} />
        </div>
        <div>
          <label className={labelClass}>{t("Resolución (minutos)", "Resolution (minutes)", locale)}</label>
          <input
            name="resolutionMinutes"
            type="number"
            min="1"
            required
            defaultValue={defaults?.resolutionMinutes ?? ""}
            aria-invalid={errors.resolutionMinutes ? true : undefined}
            className={inputClass}
          />
          <FieldError errors={errors.resolutionMinutes} />
        </div>
      </div>
      <div>
        <label className={labelClass}>{t("Descripción (opcional)", "Description (optional)", locale)}</label>
        <input name="description" defaultValue={defaults?.description ?? ""} className={inputClass} />
      </div>
      <div className="flex flex-wrap gap-5 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="businessHoursOnly"
            defaultChecked={defaults?.businessHoursOnly ?? false}
          />
          {t("Solo horario laboral (usa el calendario de abajo)", "Business hours only (uses the work calendar below)", locale)}
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="isDefault" defaultChecked={defaults?.isDefault ?? false} />
          {t("Predeterminado para esta prioridad", "Default for this priority", locale)}
        </label>
      </div>
    </>
  );
}

export function CreateDefinitionForm({ priorities }: { priorities: TicketPriorityRow[] }) {
  const locale = useLocale();
  const [state, formAction] = useActionState<ActionState, FormData>(
    createSlaDefinition,
    null,
  );
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={formAction} className="space-y-4">
      <FormAlert state={state} />
      <DefinitionFields errors={errors} priorities={priorities} locale={locale} />
      <SubmitButton>{t("Crear SLA", "Create SLA", locale)}</SubmitButton>
    </form>
  );
}

export function DefinitionRow({
  definition,
  priority,
  priorities,
}: {
  definition: {
    id: number;
    name: string;
    description: string | null;
    priorityId: number;
    firstResponseMinutes: number;
    resolutionMinutes: number;
    businessHoursOnly: boolean;
    isDefault: boolean;
    status: string;
  };
  priority: TicketPriorityRow | undefined;
  priorities: TicketPriorityRow[];
}) {
  const locale = useLocale();
  const [editing, setEditing] = useState(false);
  const [editState, editAction] = useActionState<ActionState, FormData>(
    updateSlaDefinition,
    null,
  );
  const [toggleState, toggleAction] = useActionState<ActionState, FormData>(
    toggleSlaDefinition,
    null,
  );
  const errors = editState && !editState.ok ? (editState.fieldErrors ?? {}) : {};
  const d = definition;

  return (
    <li
      className={cx(
        "rounded-lg border border-edge bg-subtle px-4 py-3",
        d.status === "inactive" && "opacity-55",
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
          <span className="font-medium text-fg">{d.name}</span>
          {priority?.color ? (
            <span
              className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
              style={{ backgroundColor: `${priority.color}22`, color: priority.color }}
            >
              {priority.name}
            </span>
          ) : (
            <Badge tone="slate">{priority?.name ?? "—"}</Badge>
          )}
          <span className="text-muted tabular-nums">
            FR {formatMinutes(d.firstResponseMinutes)} · Res {formatMinutes(d.resolutionMinutes)}
          </span>
          <Badge tone="slate">{d.businessHoursOnly ? t("Horario laboral", "Business hours", locale) : "24/7"}</Badge>
          {d.isDefault ? <Badge tone="purple">{t("Predeterminado", "Default", locale)}</Badge> : null}
          {d.status === "inactive" ? <Badge tone="red">{t("Inactivo", "Inactive", locale)}</Badge> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            aria-label={t("Editar definición", "Edit definition", locale)}
            onClick={() => setEditing((v) => !v)}
            className="flex size-7 items-center justify-center rounded-md text-faint transition-colors hover:bg-primary-soft hover:text-primary"
          >
            <Pencil className="size-3.5" />
          </button>
          <form action={toggleAction}>
            <input type="hidden" name="id" value={d.id} />
            <button
              type="submit"
              aria-label={d.status === "active" ? t("Desactivar", "Deactivate", locale) : t("Activar", "Activate", locale)}
              title={d.status === "active" ? t("Desactivar", "Deactivate", locale) : t("Activar", "Activate", locale)}
              className="flex size-7 items-center justify-center rounded-md text-faint transition-colors hover:bg-subtle hover:text-fg"
            >
              <Power className="size-3.5" />
            </button>
          </form>
        </div>
      </div>
      {d.description ? <p className="mt-1 text-sm text-muted">{d.description}</p> : null}
      {toggleState && !toggleState.ok ? (
        <FormAlert state={toggleState} className="mt-2" />
      ) : null}

      {editing ? (
        <form action={editAction} className="mt-3 space-y-3 border-t border-edge pt-3">
          <input type="hidden" name="id" value={d.id} />
          <FormAlert state={editState} />
          <DefinitionFields errors={errors} defaults={d} priorities={priorities} locale={locale} />
          <div className="flex items-center gap-2">
            <SubmitButton>{t("Guardar", "Save", locale)}</SubmitButton>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className={buttonSecondaryClass}
            >
              {t("Cancelar", "Cancel", locale)}
            </button>
          </div>
        </form>
      ) : null}
    </li>
  );
}

const DAY_LABELS: [number, string, string][] = [
  [1, "Lun", "Mon"], [2, "Mar", "Tue"], [3, "Mié", "Wed"], [4, "Jue", "Thu"], [5, "Vie", "Fri"], [6, "Sáb", "Sat"], [7, "Dom", "Sun"],
];

function toTime(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

export function CalendarForm({
  calendar,
  timezones,
}: {
  calendar: {
    timezone: string;
    workDays: number[];
    workStartMinute: number;
    workEndMinute: number;
  };
  /** Full IANA list — computed server-side (page.tsx) and passed down so client hydration always agrees with the server render (see doc comment there). */
  timezones: string[];
}) {
  const locale = useLocale();
  const [state, formAction] = useActionState<ActionState, FormData>(saveCalendar, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  return (
    <form action={formAction} className="space-y-4">
      <FormAlert state={state} />
      <div>
        <label className={labelClass}>{t("Zona horaria (IANA)", "Timezone (IANA)", locale)}</label>
        <SearchableSelect
          name="timezone"
          required
          defaultValue={calendar.timezone}
          aria-invalid={errors.timezone ? true : undefined}
          options={[
            ...(!timezones.includes(calendar.timezone) ? [{ value: calendar.timezone, label: calendar.timezone }] : []),
            ...timezones.map((tz) => ({ value: tz, label: tz })),
          ]}
        />
        <FieldError errors={errors.timezone} />
      </div>
      <div>
        <span className={labelClass}>{t("Días laborales", "Working days", locale)}</span>
        <div className="flex flex-wrap gap-3 text-sm">
          {DAY_LABELS.map(([n, es, en]) => (
            <label key={n} className="flex items-center gap-1.5">
              <input
                type="checkbox"
                name="workDays"
                value={n}
                defaultChecked={calendar.workDays.includes(n)}
              />
              {t(es, en, locale)}
            </label>
          ))}
        </div>
        <FieldError errors={errors.workDays} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>{t("Inicio del día", "Day starts", locale)}</label>
          <input
            name="workStartTime"
            type="time"
            defaultValue={toTime(calendar.workStartMinute)}
            className={inputClass}
            onChange={(e) => {
              const hidden = e.currentTarget.form?.elements.namedItem(
                "workStartMinute",
              ) as HTMLInputElement | null;
              if (hidden) {
                const [h, m] = e.currentTarget.value.split(":").map(Number);
                hidden.value = String(h * 60 + m);
              }
            }}
          />
          <input type="hidden" name="workStartMinute" defaultValue={calendar.workStartMinute} />
        </div>
        <div>
          <label className={labelClass}>{t("Fin del día", "Day ends", locale)}</label>
          <input
            name="workEndTime"
            type="time"
            defaultValue={toTime(calendar.workEndMinute)}
            className={inputClass}
            onChange={(e) => {
              const hidden = e.currentTarget.form?.elements.namedItem(
                "workEndMinute",
              ) as HTMLInputElement | null;
              if (hidden) {
                const [h, m] = e.currentTarget.value.split(":").map(Number);
                hidden.value = String(h * 60 + m);
              }
            }}
          />
          <input type="hidden" name="workEndMinute" defaultValue={calendar.workEndMinute} />
          <FieldError errors={errors.workEndMinute} />
        </div>
      </div>
      <SubmitButton>{t("Guardar calendario", "Save calendar", locale)}</SubmitButton>
    </form>
  );
}
