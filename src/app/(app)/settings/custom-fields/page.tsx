import type { Metadata } from "next";
import Link from "next/link";
import { getFieldDefinitions, type ConfigModule } from "@/lib/custom-fields";
import { requireRole } from "@/lib/session";
import { Card, CardHeader, PageHeader, cx } from "@/components/ui";
import { CustomFieldCreateForm, CustomFieldList } from "./custom-field-forms";

export const metadata: Metadata = { title: "Configuración · Campos Personalizados" };

const MODULE_LABELS: Record<ConfigModule, string> = {
  activities: "Actividades",
  tickets: "Tickets",
  projects: "Proyectos",
  companies: "Empresas",
  contacts: "Contactos",
  reports: "Reportes",
  knowledge: "Base de conocimiento",
  recurring: "Recurrentes",
};

/** Only Tickets renders custom fields in its forms/table/filters today (pilot module). */
const WIRED_MODULES: ConfigModule[] = ["tickets"];

export default async function CustomFieldsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ module?: string }>;
}) {
  const user = await requireRole("superadmin", "administrator");
  const { module: rawModule } = await searchParams;
  const moduleKey: ConfigModule =
    rawModule && rawModule in MODULE_LABELS ? (rawModule as ConfigModule) : "tickets";

  const fields = await getFieldDefinitions(user.organizationId, moduleKey);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Campos Personalizados"
        subtitle="Motor genérico de campos por módulo — aparecen en formularios, tablas, vistas, filtros y búsqueda."
      />

      <div className="flex flex-wrap items-center gap-1 rounded-lg border border-edge bg-surface p-1 shadow-card">
        {(Object.keys(MODULE_LABELS) as ConfigModule[]).map((m) => (
          <Link
            key={m}
            href={`/settings/custom-fields?module=${m}`}
            aria-current={moduleKey === m ? "page" : undefined}
            className={cx(
              "rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors duration-150",
              moduleKey === m ? "bg-primary-soft text-primary" : "text-muted hover:bg-subtle hover:text-fg",
            )}
          >
            {MODULE_LABELS[m]}
            {!WIRED_MODULES.includes(m) ? <span className="ml-1 text-[10px] text-faint">(prep.)</span> : null}
          </Link>
        ))}
      </div>

      {!WIRED_MODULES.includes(moduleKey) ? (
        <div role="status" className="rounded-lg border border-edge bg-subtle px-4 py-2.5 text-xs text-muted">
          Los campos de este módulo se guardan y pueden administrarse aquí, pero todavía no aparecen en su
          formulario/tabla/filtros — eso llega con una fase posterior de {MODULE_LABELS[moduleKey]}. Solo Tickets
          está conectado hoy (módulo piloto).
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <CardHeader title={`Campos de ${MODULE_LABELS[moduleKey]}`} className="mb-3 px-0 pt-0" />
          <CustomFieldList module={moduleKey} fields={fields} canDelete={user.role === "superadmin"} />
        </Card>
        <Card className="h-fit p-5">
          <CardHeader title="Agregar campo" className="mb-3 px-0 pt-0" />
          <CustomFieldCreateForm module={moduleKey} />
        </Card>
      </div>
    </div>
  );
}
