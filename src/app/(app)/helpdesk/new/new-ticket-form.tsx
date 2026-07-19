"use client";

import { useActionState, useState } from "react";
import { inputClass, labelClass } from "@/components/ui";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-result";
import { createTicket } from "../actions";

type Option = { id: number; name: string };
type ContactOption = { id: number; name: string; companyId: number };

export function NewTicketForm({
  companies,
  contacts,
  users,
  slas,
  defaultCompanyId,
  categoryOptions = [],
}: {
  companies: Option[];
  contacts: ContactOption[];
  users: Option[];
  slas: Option[]; // empty for non-superadmins
  defaultCompanyId?: number;
  /** Active names from the org's ticket-category catalog (Settings). */
  categoryOptions?: string[];
}) {
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
          <label htmlFor="priority" className={labelClass}>
            Priority
          </label>
          <select id="priority" name="priority" defaultValue="medium" className={inputClass}>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
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
            Category (optional)
          </label>
          <input id="category" name="category" list="ticket-category-options" className={inputClass} />
          {categoryOptions.length > 0 ? (
            <datalist id="ticket-category-options">
              {categoryOptions.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          ) : null}
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
      <SubmitButton>Create ticket</SubmitButton>
    </form>
  );
}
