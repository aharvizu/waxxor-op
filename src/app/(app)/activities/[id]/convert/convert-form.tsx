"use client";

import { useActionState } from "react";
import { inputClass, labelClass } from "@/components/ui";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SearchableSelect } from "@/components/searchable-select";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-result";
import { TICKET_CHANNELS, TICKET_MODALITIES } from "@/lib/convert-activity";
import { useLocale } from "@/components/locale-provider";
import { t, type Locale } from "@/lib/i18n";
import { convertActivity } from "../../actions";

type Option = { id: number; name: string };

function channelLabel(channel: string, locale: Locale): string {
  switch (channel) {
    case "email":
      return "Email";
    case "phone":
      return t("Teléfono", "Phone", locale);
    case "whatsapp":
      return "WhatsApp";
    case "portal":
      return t("Portal", "Portal", locale);
    case "in_person":
      return t("En persona", "In person", locale);
    case "internal":
      return t("Interno", "Internal", locale);
    default:
      return channel;
  }
}

export function ConvertForm({
  activityId,
  companyId,
  assigneeId,
  priority,
  cancelled,
  inProject,
  companies,
  users,
  categoryOptions,
}: {
  activityId: number;
  companyId: number | null;
  assigneeId: number | null;
  priority: string;
  cancelled: boolean;
  inProject: boolean;
  companies: Option[];
  users: Option[];
  /** Active names from the org's ticket-category catalog (Settings → Tickets). */
  categoryOptions: string[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    convertActivity,
    null,
  );
  const locale = useLocale();
  const failed = state && !state.ok ? state : null;
  const errors = failed?.fieldErrors ?? {};
  const value = (name: string, fallback: string) =>
    failed?.values?.[name] ?? fallback;

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={activityId} />
      <FormAlert state={state} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="companyId" className={labelClass}>
            {t("Cliente", "Client", locale)} {companyId ? "" : t("(obligatorio — la actividad no tiene ninguno)", "(required — the activity has none)", locale)}
          </label>
          <SearchableSelect
            id="companyId"
            name="companyId"
            required
            defaultValue={value("companyId", companyId ? String(companyId) : "")}
            options={[
              { value: "", label: t("Selecciona un cliente…", "Select a client…", locale) },
              ...companies.map((c) => ({ value: String(c.id), label: c.name })),
            ]}
          />
        </div>
        <div>
          <label htmlFor="contact" className={labelClass}>
            {t("Contacto (opcional)", "Contact (optional)", locale)}
          </label>
          <input
            id="contact"
            name="contact"
            placeholder={t("Quién lo reportó", "Who reported it", locale)}
            defaultValue={value("contact", "")}
            className={inputClass}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="category" className={labelClass}>
            {t("Categoría", "Category", locale)}
          </label>
          <SearchableSelect
            id="category"
            name="category"
            required
            defaultValue={value("category", "")}
            aria-invalid={errors.category ? true : undefined}
            aria-describedby={errors.category ? "category-error" : undefined}
            options={[
              { value: "", label: t("— Selecciona —", "— Select —", locale), disabled: true },
              ...categoryOptions.map((c) => ({ value: c, label: c })),
            ]}
          />
          <FieldError id="category-error" errors={errors.category} />
        </div>
        <div>
          <label htmlFor="subcategory" className={labelClass}>
            {t("Subcategoría (opcional)", "Subcategory (optional)", locale)}
          </label>
          <input
            id="subcategory"
            name="subcategory"
            defaultValue={value("subcategory", "")}
            className={inputClass}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="channel" className={labelClass}>
            {t("Canal", "Channel", locale)}
          </label>
          <SearchableSelect
            id="channel"
            name="channel"
            required
            defaultValue={value("channel", "")}
            aria-invalid={errors.channel ? true : undefined}
            options={[
              { value: "", label: t("De dónde vino…", "Where did it come from…", locale) },
              ...TICKET_CHANNELS.map((c) => ({ value: c, label: channelLabel(c, locale) })),
            ]}
          />
          <FieldError id="channel-error" errors={errors.channel} />
        </div>
        <div>
          <label htmlFor="modality" className={labelClass}>
            {t("Modalidad", "Modality", locale)}
          </label>
          <SearchableSelect
            id="modality"
            name="modality"
            required
            defaultValue={value("modality", "remote")}
            options={TICKET_MODALITIES.map((m) => ({
              value: m,
              label: m === "remote" ? t("Remoto", "Remote", locale) : t("En sitio", "On-site", locale),
            }))}
          />
        </div>
        <div>
          <label htmlFor="priority" className={labelClass}>
            {t("Prioridad", "Priority", locale)}
          </label>
          <SearchableSelect
            id="priority"
            name="priority"
            defaultValue={value("priority", priority)}
            options={[
              { value: "low", label: t("Baja", "Low", locale) },
              { value: "medium", label: t("Media", "Medium", locale) },
              { value: "high", label: t("Alta", "High", locale) },
              { value: "critical", label: t("Crítica", "Critical", locale) },
            ]}
          />
        </div>
      </div>
      <div>
        <label htmlFor="assigneeId" className={labelClass}>
          {t("Responsable (opcional)", "Assignee (optional)", locale)}
        </label>
        <SearchableSelect
          id="assigneeId"
          name="assigneeId"
          defaultValue={value("assigneeId", assigneeId ? String(assigneeId) : "")}
          options={[{ value: "", label: t("Sin asignar", "Unassigned", locale) }, ...users.map((u) => ({ value: String(u.id), label: u.name }))]}
        />
      </div>
      {inProject ? (
        <label className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-sm text-fg">
          <input type="checkbox" name="confirmProject" required className="mt-0.5" />
          {t(
            "Esta actividad pertenece a un proyecto — al convertirla dejará de formar parte del proyecto y su lista. Confirmo la conversión.",
            "This activity belongs to a project — converting it will remove it from the project and its list. I confirm the conversion.",
            locale,
          )}
        </label>
      ) : null}
      {cancelled ? (
        <label className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-sm text-fg">
          <input type="checkbox" name="confirmCancelled" required className="mt-0.5" />
          {t(
            "Esta actividad está cancelada — confirmo que aún quiero convertirla en un ticket.",
            "This activity is cancelled — I confirm I still want to convert it into a ticket.",
            locale,
          )}
        </label>
      ) : null}
      <SubmitButton>{t("Convertir en ticket", "Convert to ticket", locale)}</SubmitButton>
    </form>
  );
}
