"use client";

import { useActionState, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Trash2 } from "lucide-react";
import { DragList } from "@/components/drag-list";
import { FormAlert } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import { buttonSecondaryClass, cx, inputClass, labelClass } from "@/components/ui";
import type { ActionState } from "@/lib/action-result";
import { saveOrganizationSetting } from "../actions";

type FieldConfig = { key: string; visible: boolean; required: boolean; order: number; defaultValue?: string; isCustomField: boolean };
type SectionConfig = { key: string; label: string; collapsed: boolean; order: number; fields: FieldConfig[] };
export type FormConfigValue = { sections: SectionConfig[] };

export type AvailableField = { key: string; label: string; isCustomField: boolean };

/**
 * Part 5 (dynamic config 2026-07-20): no-code form layout editor. Local
 * state until "Guardar" — one submit serializes the whole config into a
 * hidden input for the generic saveOrganizationSetting action (settingKey
 * "tickets.formConfig"), same KV pattern as every other Settings section.
 */
export function FormConfigEditor({
  initial,
  availableFields,
}: {
  initial: FormConfigValue;
  availableFields: AvailableField[];
}) {
  const [sections, setSections] = useState<SectionConfig[]>(
    initial.sections.length > 0 ? initial.sections : [{ key: "general", label: "General", collapsed: false, order: 0, fields: [] }],
  );
  const [state, formAction] = useActionState<ActionState, FormData>(saveOrganizationSetting, null);

  const placedKeys = new Set(sections.flatMap((s) => s.fields.map((f) => f.key)));
  const unplaced = availableFields.filter((f) => !placedKeys.has(f.key));
  const labelFor = (key: string) => availableFields.find((f) => f.key === key)?.label ?? key;

  function addSection() {
    setSections((prev) => [...prev, { key: `section_${Date.now()}`, label: "Nueva sección", collapsed: false, order: prev.length, fields: [] }]);
  }
  function removeSection(sectionKey: string) {
    setSections((prev) => prev.filter((s) => s.key !== sectionKey));
  }
  function renameSection(sectionKey: string, label: string) {
    setSections((prev) => prev.map((s) => (s.key === sectionKey ? { ...s, label } : s)));
  }
  function toggleCollapsed(sectionKey: string) {
    setSections((prev) => prev.map((s) => (s.key === sectionKey ? { ...s, collapsed: !s.collapsed } : s)));
  }
  function addFieldToSection(sectionKey: string, fieldKey: string) {
    const field = availableFields.find((f) => f.key === fieldKey);
    if (!field) return;
    setSections((prev) =>
      prev.map((s) =>
        s.key === sectionKey
          ? { ...s, fields: [...s.fields, { key: field.key, visible: true, required: false, order: s.fields.length, isCustomField: field.isCustomField }] }
          : s,
      ),
    );
  }
  function removeField(sectionKey: string, fieldKey: string) {
    setSections((prev) => prev.map((s) => (s.key === sectionKey ? { ...s, fields: s.fields.filter((f) => f.key !== fieldKey) } : s)));
  }
  function patchField(sectionKey: string, fieldKey: string, patch: Partial<FieldConfig>) {
    setSections((prev) =>
      prev.map((s) =>
        s.key === sectionKey
          ? { ...s, fields: s.fields.map((f) => (f.key === fieldKey ? { ...f, ...patch } : f)) }
          : s,
      ),
    );
  }
  function reorderFields(sectionKey: string, orderedKeys: (string | number)[]) {
    setSections((prev) =>
      prev.map((s) => {
        if (s.key !== sectionKey) return s;
        const byKey = new Map(s.fields.map((f) => [f.key, f]));
        return { ...s, fields: orderedKeys.map((k, i) => ({ ...byKey.get(String(k))!, order: i })) };
      }),
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <FormAlert state={state} />
      <input type="hidden" name="settingKey" value="tickets.formConfig" />
      <input type="hidden" name="sections" value={JSON.stringify(sections.map((s, i) => ({ ...s, order: i })))} />

      <div className="space-y-3">
        {sections.map((section) => (
          <div key={section.key} className="rounded-lg border border-edge bg-surface">
            <div className="flex items-center gap-2 border-b border-edge px-3 py-2">
              <button type="button" onClick={() => toggleCollapsed(section.key)} className="text-muted hover:text-fg">
                {section.collapsed ? <ChevronRight className="size-4" /> : <ChevronDown className="size-4" />}
              </button>
              <input
                value={section.label}
                onChange={(e) => renameSection(section.key, e.target.value)}
                className={cx(inputClass, "h-8 max-w-xs flex-1 text-sm")}
              />
              <button type="button" onClick={() => removeSection(section.key)} className="rounded-md p-1.5 text-muted hover:bg-subtle hover:text-danger">
                <Trash2 className="size-4" />
              </button>
            </div>
            {!section.collapsed ? (
              <div className="space-y-3 p-3">
                {section.fields.length === 0 ? (
                  <p className="text-xs text-muted">Sin campos en esta sección.</p>
                ) : (
                  <DragList
                    items={section.fields.map((f) => ({ ...f, id: f.key }))}
                    onReorder={(ids) => reorderFields(section.key, ids)}
                    renderItem={(field) => (
                      <div className="flex flex-wrap items-center gap-3 rounded-md border border-edge bg-canvas px-2.5 py-1.5">
                        <span className="min-w-32 flex-1 truncate text-sm text-fg">
                          {labelFor(field.key)}
                          {field.isCustomField ? <span className="ml-1 text-[10px] text-faint">(personalizado)</span> : null}
                        </span>
                        <label className="flex items-center gap-1.5 text-xs text-muted">
                          <input type="checkbox" checked={field.visible} onChange={(e) => patchField(section.key, field.key, { visible: e.target.checked })} />
                          Visible
                        </label>
                        <label className="flex items-center gap-1.5 text-xs text-muted">
                          <input type="checkbox" checked={field.required} onChange={(e) => patchField(section.key, field.key, { required: e.target.checked })} />
                          Obligatorio
                        </label>
                        <input
                          placeholder="Valor por defecto"
                          value={field.defaultValue ?? ""}
                          onChange={(e) => patchField(section.key, field.key, { defaultValue: e.target.value })}
                          className={cx(inputClass, "h-7 w-36 text-xs")}
                        />
                        <button type="button" onClick={() => removeField(section.key, field.key)} className="text-muted hover:text-danger">
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    )}
                  />
                )}
                {unplaced.length > 0 ? (
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) addFieldToSection(section.key, e.target.value);
                      e.target.value = "";
                    }}
                    className={cx(inputClass, "h-8 w-auto text-xs")}
                  >
                    <option value="">+ Agregar campo…</option>
                    {unplaced.map((f) => (
                      <option key={f.key} value={f.key}>{f.label}</option>
                    ))}
                  </select>
                ) : null}
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <button type="button" onClick={addSection} className={cx(buttonSecondaryClass, "inline-flex items-center gap-1.5")}>
        <Plus className="size-4" /> Agregar sección
      </button>

      <div>
        <label className={labelClass}>&nbsp;</label>
        <SubmitButton>Guardar formulario</SubmitButton>
      </div>
    </form>
  );
}
