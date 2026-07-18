"use client";

import { useActionState } from "react";
import { inputClass, labelClass } from "@/components/ui";
import { FormAlert } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import type { ActionState } from "@/lib/action-result";
import { reportTypeMeta } from "@/lib/labels";
import { REPORT_TYPES } from "@/lib/reports";
import { saveReportTemplate } from "../actions";

export function TemplateEditor({
  template,
  defaultSectionsJson,
}: {
  template?: {
    id: number;
    name: string;
    reportType: string;
    description: string | null;
    includeLogo: boolean;
    includeCover: boolean;
    includeExecutiveSummary: boolean;
    includeConclusions: boolean;
    includeRecommendations: boolean;
  };
  defaultSectionsJson: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveReportTemplate, null);
  return (
    <form action={formAction} className="space-y-3">
      {template ? <input type="hidden" name="id" value={template.id} /> : null}
      <FormAlert state={state} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelClass}>Nombre</label>
          <input name="name" required defaultValue={template?.name ?? ""} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Tipo</label>
          <select name="reportType" defaultValue={template?.reportType ?? "monthly_service"} className={inputClass}>
            {REPORT_TYPES.map((t) => (
              <option key={t} value={t}>{reportTypeMeta[t]?.label ?? t}</option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className={labelClass}>Descripción</label>
        <input name="description" defaultValue={template?.description ?? ""} className={inputClass} />
      </div>
      <div className="flex flex-wrap gap-4 text-sm text-fg">
        <label className="flex items-center gap-2"><input type="checkbox" name="includeCover" defaultChecked={template?.includeCover ?? true} /> Portada</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="includeLogo" defaultChecked={template?.includeLogo ?? true} /> Logo</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="includeExecutiveSummary" defaultChecked={template?.includeExecutiveSummary ?? true} /> Resumen ejecutivo</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="includeConclusions" defaultChecked={template?.includeConclusions ?? true} /> Conclusiones</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="includeRecommendations" defaultChecked={template?.includeRecommendations ?? false} /> Recomendaciones</label>
      </div>
      <div>
        <label className={labelClass}>
          Secciones (JSON: key, title, enabled, intro — ordénalas moviendo los elementos)
        </label>
        <textarea name="sectionsJson" rows={8} defaultValue={defaultSectionsJson} className={`${inputClass} font-mono text-xs`} />
      </div>
      <SubmitButton>{template ? "Guardar plantilla" : "Crear plantilla"}</SubmitButton>
    </form>
  );
}
