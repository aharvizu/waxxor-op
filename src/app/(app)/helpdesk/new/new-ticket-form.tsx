"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { buttonClass, inputClass, labelClass } from "@/components/ui";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { Modal } from "@/components/modal";
import { SearchableSelect } from "@/components/searchable-select";
import { SubmitButton } from "@/components/submit-button";
import { CustomFieldsForm } from "@/components/custom-fields-form";
import type { ActionState } from "@/lib/action-result";
import type { CustomFieldDefinition } from "@/lib/custom-fields";
import { useLocale } from "@/components/locale-provider";
import { t } from "@/lib/i18n";
import { createTicket } from "../actions";

type Option = { id: number; name: string };
type ContactOption = { id: number; name: string; companyId: number };

type NewTicketFormProps = {
  companies: Option[];
  contacts: ContactOption[];
  users: Option[];
  slas: Option[]; // empty for non-superadmins
  /** Active rows from the org's Ticket Priorities catalog (Settings → Tickets). */
  priorities: (Option & { isDefault: boolean })[];
  defaultCompanyId?: number;
  /** Active names from the org's ticket-category catalog (Settings). */
  categoryOptions?: string[];
  /** Active Custom Fields for module "tickets" (Settings → Campos Personalizados). */
  customFields?: CustomFieldDefinition[];
};

export function NewTicketForm({
  companies,
  contacts,
  users,
  slas,
  priorities,
  defaultCompanyId,
  categoryOptions = [],
  customFields = [],
}: NewTicketFormProps) {
  const locale = useLocale();
  const [state, formAction] = useActionState<ActionState, FormData>(createTicket, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const [companyId, setCompanyId] = useState(defaultCompanyId ? String(defaultCompanyId) : "");
  const suggestedContacts = companyId
    ? contacts.filter((c) => c.companyId === Number(companyId))
    : contacts;
  return (
    <form action={formAction} className="space-y-4">
      <FormAlert state={state} />
      <div>
        <label htmlFor="subject" className={labelClass}>
          {t("Asunto", "Subject", locale)}
        </label>
        <input
          id="subject"
          name="subject"
          required
          aria-invalid={errors.subject ? true : undefined}
          className={inputClass}
        />
        <FieldError errors={errors.subject} />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="companyId" className={labelClass}>
            {t("Cliente", "Client", locale)}
          </label>
          <SearchableSelect
            id="companyId"
            name="companyId"
            value={companyId}
            onValueChange={setCompanyId}
            options={[{ value: "", label: t("— Ninguno —", "— None —", locale) }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]}
          />
        </div>
        <div>
          <label htmlFor="priorityId" className={labelClass}>
            {t("Prioridad", "Priority", locale)}
          </label>
          <SearchableSelect
            id="priorityId"
            name="priorityId"
            defaultValue={String(priorities.find((p) => p.isDefault)?.id ?? "")}
            options={priorities.map((p) => ({ value: String(p.id), label: p.name }))}
          />
        </div>
        <div>
          <label htmlFor="assigneeId" className={labelClass}>
            {t("Responsable", "Assignee", locale)}
          </label>
          <SearchableSelect
            id="assigneeId"
            name="assigneeId"
            options={[{ value: "", label: t("Sin asignar", "Unassigned", locale) }, ...users.map((u) => ({ value: String(u.id), label: u.name }))]}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="category" className={labelClass}>
            {t("Categoría", "Category", locale)}
          </label>
          <SearchableSelect
            id="category"
            name="category"
            required
            defaultValue=""
            aria-invalid={errors.category ? true : undefined}
            options={[
              { value: "", label: t("— Seleccionar —", "— Select —", locale), disabled: true },
              ...categoryOptions.map((c) => ({ value: c, label: c })),
            ]}
          />
          <FieldError errors={errors.category} />
        </div>
        <div>
          <label htmlFor="channel" className={labelClass}>
            {t("Canal (opcional)", "Channel (optional)", locale)}
          </label>
          <SearchableSelect
            id="channel"
            name="channel"
            defaultValue=""
            options={[
              { value: "", label: "—" },
              ...["email", "phone", "whatsapp", "portal", "in_person", "internal"].map((c) => ({ value: c, label: c })),
            ]}
          />
        </div>
        <div>
          <label htmlFor="modality" className={labelClass}>
            {t("Modalidad (opcional)", "Modality (optional)", locale)}
          </label>
          <SearchableSelect
            id="modality"
            name="modality"
            defaultValue=""
            options={[
              { value: "", label: "—" },
              { value: "remote", label: "remote" },
              { value: "onsite", label: "onsite" },
            ]}
          />
        </div>
        <div>
          <label htmlFor="contactId" className={labelClass}>
            {t("Contacto (opcional)", "Contact (optional)", locale)}
          </label>
          <SearchableSelect
            key={companyId}
            id="contactId"
            name="contactId"
            defaultValue=""
            options={[{ value: "", label: t("— Ninguno —", "— None —", locale) }, ...suggestedContacts.map((c) => ({ value: String(c.id), label: c.name }))]}
          />
        </div>
        <div>
          <label htmlFor="contact" className={labelClass}>
            {t("Nota de contacto (opcional)", "Contact note (optional)", locale)}
          </label>
          <input id="contact" name="contact" className={inputClass} />
        </div>
        <div>
          <label htmlFor="dueDate" className={labelClass}>
            {t("Fecha agendada (opcional)", "Scheduled date (optional)", locale)}
          </label>
          <input id="dueDate" name="dueDate" type="date" className={inputClass} />
        </div>
      </div>
      {slas.length > 0 ? (
        <div>
          <label htmlFor="slaDefinitionId" className={labelClass}>
            {t(
              "SLA (SuperAdmin — dejar vacío para usar el de la prioridad)",
              "SLA (SuperAdmin — leave empty for the priority default)",
              locale,
            )}
          </label>
          <SearchableSelect
            id="slaDefinitionId"
            name="slaDefinitionId"
            options={[{ value: "", label: t("Automático (según prioridad)", "Automatic (default for priority)", locale) }, ...slas.map((s) => ({ value: String(s.id), label: s.name }))]}
          />
        </div>
      ) : null}
      <div>
        <label htmlFor="description" className={labelClass}>
          {t("Descripción", "Description", locale)}
        </label>
        <textarea id="description" name="description" rows={6} className={inputClass} />
      </div>
      {customFields.length > 0 ? <CustomFieldsForm fields={customFields} errors={errors} /> : null}
      <SubmitButton>{t("Crear ticket", "Create ticket", locale)}</SubmitButton>
    </form>
  );
}

/** Trigger + modal for the Helpdesk list header — creation redirects to the new ticket on success, which closes this by leaving the route. */
export function NewTicketButton(props: NewTicketFormProps) {
  const [open, setOpen] = useState(false);
  const locale = useLocale();
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass}>
        <Plus className="size-4" />
        {t("Nuevo ticket", "New ticket", locale)}
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={t("Nuevo ticket", "New ticket", locale)}
        description={t(
          "Empieza como Nuevo (o Asignado si ya tiene responsable) y toma el SLA de su prioridad automáticamente.",
          "It starts as New (or Assigned when it already has an owner) and gets the SLA for its priority automatically.",
          locale,
        )}
        className="max-w-2xl"
      >
        <NewTicketForm {...props} />
      </Modal>
    </>
  );
}
