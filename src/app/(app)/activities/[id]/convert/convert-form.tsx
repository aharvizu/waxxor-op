"use client";

import { useActionState } from "react";
import { inputClass, labelClass } from "@/components/ui";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SearchableSelect } from "@/components/searchable-select";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-result";
import { TICKET_CHANNELS, TICKET_MODALITIES } from "@/lib/convert-activity";
import { convertActivity } from "../../actions";

type Option = { id: number; name: string };

const channelLabels: Record<string, string> = {
  email: "Email",
  phone: "Phone",
  whatsapp: "WhatsApp",
  portal: "Portal",
  in_person: "In person",
  internal: "Internal",
};

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
            Client {companyId ? "" : "(required — the activity has none)"}
          </label>
          <SearchableSelect
            id="companyId"
            name="companyId"
            required
            defaultValue={value("companyId", companyId ? String(companyId) : "")}
            options={[
              { value: "", label: "Select a client…" },
              ...companies.map((c) => ({ value: String(c.id), label: c.name })),
            ]}
          />
        </div>
        <div>
          <label htmlFor="contact" className={labelClass}>
            Contact (optional)
          </label>
          <input
            id="contact"
            name="contact"
            placeholder="Who reported it"
            defaultValue={value("contact", "")}
            className={inputClass}
          />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="category" className={labelClass}>
            Category
          </label>
          <SearchableSelect
            id="category"
            name="category"
            required
            defaultValue={value("category", "")}
            aria-invalid={errors.category ? true : undefined}
            aria-describedby={errors.category ? "category-error" : undefined}
            options={[
              { value: "", label: "— Select —", disabled: true },
              ...categoryOptions.map((c) => ({ value: c, label: c })),
            ]}
          />
          <FieldError id="category-error" errors={errors.category} />
        </div>
        <div>
          <label htmlFor="subcategory" className={labelClass}>
            Subcategory (optional)
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
            Channel
          </label>
          <SearchableSelect
            id="channel"
            name="channel"
            required
            defaultValue={value("channel", "")}
            aria-invalid={errors.channel ? true : undefined}
            options={[
              { value: "", label: "Where did it come from…" },
              ...TICKET_CHANNELS.map((c) => ({ value: c, label: channelLabels[c] ?? c })),
            ]}
          />
          <FieldError id="channel-error" errors={errors.channel} />
        </div>
        <div>
          <label htmlFor="modality" className={labelClass}>
            Modality
          </label>
          <SearchableSelect
            id="modality"
            name="modality"
            required
            defaultValue={value("modality", "remote")}
            options={TICKET_MODALITIES.map((m) => ({ value: m, label: m === "remote" ? "Remote" : "On-site" }))}
          />
        </div>
        <div>
          <label htmlFor="priority" className={labelClass}>
            Priority
          </label>
          <SearchableSelect
            id="priority"
            name="priority"
            defaultValue={value("priority", priority)}
            options={[
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
              { value: "critical", label: "Critical" },
            ]}
          />
        </div>
      </div>
      <div>
        <label htmlFor="assigneeId" className={labelClass}>
          Assignee (optional)
        </label>
        <SearchableSelect
          id="assigneeId"
          name="assigneeId"
          defaultValue={value("assigneeId", assigneeId ? String(assigneeId) : "")}
          options={[{ value: "", label: "Unassigned" }, ...users.map((u) => ({ value: String(u.id), label: u.name }))]}
        />
      </div>
      {inProject ? (
        <label className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-sm text-fg">
          <input type="checkbox" name="confirmProject" required className="mt-0.5" />
          Esta actividad pertenece a un proyecto — al convertirla dejará de formar
          parte del proyecto y su lista. Confirmo la conversión.
        </label>
      ) : null}
      {cancelled ? (
        <label className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2.5 text-sm text-fg">
          <input type="checkbox" name="confirmCancelled" required className="mt-0.5" />
          This activity is cancelled — I confirm I still want to convert it into a
          ticket.
        </label>
      ) : null}
      <SubmitButton>Convert to ticket</SubmitButton>
    </form>
  );
}
