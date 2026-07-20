import { inputClass, labelClass } from "@/components/ui";
import type { CustomFieldDefinition } from "@/lib/custom-fields";

/**
 * Renders the active Custom Fields for a module as form inputs, one per
 * field (name="cf_<key>"), grouped by groupName in declaration order. Used
 * by the Tickets create/edit forms (pilot module) — reusable as-is once
 * other modules wire their forms. Values round-trip through
 * setValues()/getValuesForEntity() in src/lib/custom-fields.ts.
 */
export function CustomFieldsForm({
  fields,
  values = {},
  errors = {},
}: {
  fields: CustomFieldDefinition[];
  values?: Record<string, unknown>;
  errors?: Record<string, string[]>;
}) {
  const visible = fields.filter((f) => f.visible);
  if (visible.length === 0) return null;

  const groups = new Map<string, CustomFieldDefinition[]>();
  for (const f of visible) {
    const key = f.groupName?.trim() || "";
    groups.set(key, [...(groups.get(key) ?? []), f]);
  }

  return (
    <div className="space-y-5">
      {[...groups.entries()].map(([group, groupFields]) => (
        <div key={group || "_default"} className="space-y-3">
          {group ? <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">{group}</h3> : null}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {groupFields.map((f) => (
              <CustomFieldInput key={f.id} field={f} value={values[f.key]} error={errors[`cf_${f.key}`]} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function CustomFieldInput({ field, value, error }: { field: CustomFieldDefinition; value: unknown; error?: string[] }) {
  const name = `cf_${field.key}`;
  const disabled = !field.editable;
  const options = (field.options ?? []) as { value: string; label: string }[];
  const str = value === null || value === undefined ? "" : String(value);

  let control: React.ReactNode;
  switch (field.fieldType) {
    case "textarea":
      control = <textarea name={name} defaultValue={str} rows={3} disabled={disabled} placeholder={field.placeholder ?? ""} className={inputClass} />;
      break;
    case "checkbox":
      control = (
        <label className="flex items-center gap-2 text-sm text-fg">
          <input type="checkbox" name={name} value="true" defaultChecked={value === true} disabled={disabled} className="size-4 rounded border-edge" />
          {field.placeholder ?? "Sí"}
        </label>
      );
      break;
    case "select":
    case "radio":
      control = (
        <select name={name} defaultValue={str} disabled={disabled} className={inputClass}>
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
      break;
    case "multiselect":
      control = (
        <select name={name} multiple defaultValue={Array.isArray(value) ? (value as string[]) : []} disabled={disabled} className={inputClass}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      );
      break;
    case "number":
    case "decimal":
    case "currency":
      control = <input type="number" step={field.fieldType === "number" ? 1 : "any"} name={name} defaultValue={str} disabled={disabled} placeholder={field.placeholder ?? ""} className={inputClass} />;
      break;
    case "date":
      control = <input type="date" name={name} defaultValue={str} disabled={disabled} className={inputClass} />;
      break;
    case "time":
      control = <input type="time" name={name} defaultValue={str} disabled={disabled} className={inputClass} />;
      break;
    case "datetime":
      control = <input type="datetime-local" name={name} defaultValue={str} disabled={disabled} className={inputClass} />;
      break;
    case "color":
      control = <input type="color" name={name} defaultValue={str || "#7c3aed"} disabled={disabled} className="h-9 w-16 cursor-pointer rounded-lg border border-edge bg-surface p-1" />;
      break;
    case "email":
      control = <input type="email" name={name} defaultValue={str} disabled={disabled} placeholder={field.placeholder ?? ""} className={inputClass} />;
      break;
    case "url":
      control = <input type="url" name={name} defaultValue={str} disabled={disabled} placeholder={field.placeholder ?? "https://…"} className={inputClass} />;
      break;
    case "phone":
      control = <input type="tel" name={name} defaultValue={str} disabled={disabled} placeholder={field.placeholder ?? ""} className={inputClass} />;
      break;
    case "user":
    case "company":
    case "contact":
      // Rendered as a plain numeric-id input for now — the pilot doesn't wire
      // module-specific pickers here; the value still round-trips correctly.
      control = <input type="number" name={name} defaultValue={str} disabled={disabled} placeholder="ID" className={inputClass} />;
      break;
    default:
      control = <input type="text" name={name} defaultValue={str} disabled={disabled} maxLength={field.maxLength ?? undefined} placeholder={field.placeholder ?? ""} className={inputClass} />;
  }

  return (
    <div>
      <label htmlFor={name} className={labelClass}>
        {field.name}
        {field.required ? <span className="ml-0.5 text-danger">*</span> : null}
      </label>
      {control}
      {field.helpText ? <p className="mt-1 text-xs text-faint">{field.helpText}</p> : null}
      {error ? <p className="mt-1 text-xs text-danger">{error[0]}</p> : null}
    </div>
  );
}
