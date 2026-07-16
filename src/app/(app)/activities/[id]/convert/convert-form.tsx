"use client";

import { useActionState } from "react";
import { inputClass, labelClass } from "@/components/ui";
import { FieldError, FormAlert } from "@/components/form-feedback";
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
  clientId,
  assigneeId,
  priority,
  cancelled,
  clients,
  users,
}: {
  activityId: number;
  clientId: number | null;
  assigneeId: number | null;
  priority: string;
  cancelled: boolean;
  clients: Option[];
  users: Option[];
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
          <label htmlFor="clientId" className={labelClass}>
            Client {clientId ? "" : "(required — the activity has none)"}
          </label>
          <select
            id="clientId"
            name="clientId"
            required
            defaultValue={value("clientId", clientId ? String(clientId) : "")}
            className={inputClass}
          >
            <option value="">Select a client…</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
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
          <input
            id="category"
            name="category"
            required
            placeholder="e.g. Networking"
            defaultValue={value("category", "")}
            aria-invalid={errors.category ? true : undefined}
            aria-describedby={errors.category ? "category-error" : undefined}
            className={inputClass}
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
          <select
            id="channel"
            name="channel"
            required
            defaultValue={value("channel", "")}
            aria-invalid={errors.channel ? true : undefined}
            className={inputClass}
          >
            <option value="">Where did it come from…</option>
            {TICKET_CHANNELS.map((c) => (
              <option key={c} value={c}>
                {channelLabels[c] ?? c}
              </option>
            ))}
          </select>
          <FieldError id="channel-error" errors={errors.channel} />
        </div>
        <div>
          <label htmlFor="modality" className={labelClass}>
            Modality
          </label>
          <select
            id="modality"
            name="modality"
            required
            defaultValue={value("modality", "remote")}
            className={inputClass}
          >
            {TICKET_MODALITIES.map((m) => (
              <option key={m} value={m}>
                {m === "remote" ? "Remote" : "On-site"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="priority" className={labelClass}>
            Priority
          </label>
          <select
            id="priority"
            name="priority"
            defaultValue={value("priority", priority)}
            className={inputClass}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="assigneeId" className={labelClass}>
          Assignee (optional)
        </label>
        <select
          id="assigneeId"
          name="assigneeId"
          defaultValue={value("assigneeId", assigneeId ? String(assigneeId) : "")}
          className={inputClass}
        >
          <option value="">Unassigned</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
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
