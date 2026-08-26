import type { Metadata } from "next";
import { projectStatus } from "@/db/schema";
import { getLabels } from "@/lib/labels";
import { getOrgLocale } from "@/lib/get-org-locale";
import { CATALOG_KINDS } from "@/lib/settings";
import { getCatalog, getSetting } from "@/lib/settings-data";
import { requireRole } from "@/lib/session";
import { Card, CardHeader, PageHeader, labelClass } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import { EnumCatalog } from "../enum-catalog";
import { CatalogManager, SettingSectionForm } from "../settings-forms";

export const metadata: Metadata = { title: "Configuración · Proyectos" };

const HEALTH_DEFAULT_OPTIONS = ["not_set", "on_track", "attention"] as const;
const PRIORITY_OPTIONS = ["low", "normal", "high", "urgent"] as const;

export default async function ProjectsSettingsPage() {
  const user = await requireRole("superadmin", "administrator");
  const locale = await getOrgLocale(user.organizationId);
  const { projectHealthMeta, projectPriorityMeta, projectStatusMeta } = getLabels(locale);
  const [defaults, colors, templates] = await Promise.all([
    getSetting(user.organizationId, "projects.defaults"),
    getCatalog(user.organizationId, "project_color", { includeInactive: true }),
    getCatalog(user.organizationId, "project_template", { includeInactive: true }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Proyectos"
        subtitle="Valores por defecto, plantillas, colores y estados del sistema."
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <CardHeader
            title="Valores por defecto"
            description="Se preseleccionan al crear un proyecto; el PM siempre puede cambiarlos."
          />
          <SettingSectionForm settingKey="projects.defaults">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Salud inicial (healthStatus)</label>
                <SearchableSelect
                  name="defaultHealth"
                  defaultValue={defaults.defaultHealth}
                  options={HEALTH_DEFAULT_OPTIONS.map((h) => ({ value: h, label: projectHealthMeta[h]?.label ?? h }))}
                />
              </div>
              <div>
                <label className={labelClass}>Prioridad inicial</label>
                <SearchableSelect
                  name="defaultPriority"
                  defaultValue={defaults.defaultPriority}
                  options={PRIORITY_OPTIONS.map((p) => ({ value: p, label: projectPriorityMeta[p]?.label ?? p }))}
                />
              </div>
            </div>
          </SettingSectionForm>
        </Card>

        <Card className="p-5">
          <CardHeader
            title={CATALOG_KINDS.project_color.label}
            description={CATALOG_KINDS.project_color.note}
          />
          <CatalogManager
            kind="project_color"
            items={colors}
            hasChildren={false}
            childLabel={null}
            canDelete={user.role === "superadmin"}
            withColor
            addPlaceholder="Nombre del color…"
          />
        </Card>
      </div>

      <Card className="p-5">
        <CardHeader
          title={CATALOG_KINDS.project_template.label}
          description={CATALOG_KINDS.project_template.note}
        />
        <CatalogManager
          kind="project_template"
          items={templates}
          hasChildren={false}
          childLabel={null}
          canDelete={user.role === "superadmin"}
          withTemplateLists
          addPlaceholder="Nombre de la plantilla…"
        />
      </Card>

      <EnumCatalog
        title="Estados de proyecto"
        description="Estados compatibles: el ciclo de vida oficial no es configurable hoy (las reglas de completar/archivar dependen de él)."
        values={projectStatus.enumValues}
        meta={projectStatusMeta}
      />
    </div>
  );
}
