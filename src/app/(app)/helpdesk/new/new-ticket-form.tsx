"use client";

import { useActionState, useState } from "react";
import { Plus } from "lucide-react";
import { buttonClass, inputClass, labelClass } from "@/components/ui";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import { CustomFieldsForm } from "@/components/custom-fields-form";
import type { ActionState } from "@/lib/action-result";
import type { CustomFieldDefinition } from "@/lib/custom-fields";
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
          Subject
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
            Client
          </label>
          <select
            id="companyId"
            name="companyId"
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className={inputClass}
          >
            <option value="">— None —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="priorityId" className={labelClass}>
            Priority
          </label>
          <select id="priorityId" name="priorityId" defaultValue={priorities.find((p) => p.isDefault)?.id ?? ""} className={inputClass}>
            {priorities.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="assigneeId" className={labelClass}>
            Assignee
          </label>
          <select id="assigneeId" name="assigneeId" className={inputClass}>
            <option value="">Unassigned</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div>
          <label htmlFor="category" className={labelClass}>
            Category
          </label>
          <select
            id="category"
            name="category"
            required
            defaultValue=""
            aria-invalid={errors.category ? true : undefined}
            className={inputClass}
          >
            <option value="" disabled>
              — Select —
            </option>
            {categoryOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <FieldError errors={errors.category} />
        </div>
        <div>
          <label htmlFor="channel" className={labelClass}>
            Channel (optional)
          </label>
          <select id="channel" name="channel" defaultValue="" className={inputClass}>
            <option value="">—</option>
            {["email", "phone", "whatsapp", "portal", "in_person", "internal"].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="contactId" className={labelClass}>
            Contact (optional)
          </label>
          <select id="contactId" name="contactId" defaultValue="" className={inputClass}>
            <option value="">— None —</option>
            {suggestedContacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="contact" className={labelClass}>
            Contact note (optional)
          </label>
          <input id="contact" name="contact" className={inputClass} />
        </div>
      </div>
      {slas.length > 0 ? (
        <div>
          <label htmlFor="slaDefinitionId" className={labelClass}>
            SLA (SuperAdmin — leave empty for the priority default)
          </label>
          <select id="slaDefinitionId" name="slaDefinitionId" className={inputClass}>
            <option value="">Automatic (default for priority)</option>
            {slas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div>
        <label htmlFor="description" className={labelClass}>
          Description
        </label>
        <textarea id="description" name="description" rows={6} className={inputClass} />
      </div>
      {customFields.length > 0 ? <CustomFieldsForm fields={customFields} errors={errors} /> : null}
      <SubmitButton>Create ticket</SubmitButton>
    </form>
  );
}

/** Trigger + modal for the Helpdesk list header — creation redirects to the new ticket on success, which closes this by leaving the route. */
export function NewTicketButton(props: NewTicketFormProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass}>
        <Plus className="size-4" />
        Nuevo ticket
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Nuevo ticket"
        description="Empieza como Nuevo (o Asignado si ya tiene responsable) y toma el SLA de su prioridad automáticamente."
        className="max-w-2xl"
      >
        <NewTicketForm {...props} />
      </Modal>
    </>
  );
}
