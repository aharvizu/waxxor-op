import type { Metadata } from "next";
import { workItemPriority } from "@/db/schema";
import { activityStatusMeta, ticketPriorityMeta } from "@/lib/labels";
import { CATALOG_KINDS } from "@/lib/settings";
import { getCatalog } from "@/lib/settings-data";
import { requireRole } from "@/lib/session";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { EnumCatalog } from "../enum-catalog";
import { CatalogManager } from "../settings-forms";

export const metadata: Metadata = { title: "Configuración · Actividades" };

/** Official activity lifecycle (docs/features/activities.md). */
const ACTIVITY_STATUSES = [
  "pending",
  "in_progress",
  "waiting",
  "blocked",
  "completed",
  "cancelled",
] as const;

export default async function ActivitiesSettingsPage() {
  const user = await requireRole("superadmin", "administrator");
  const [tags, activityTypes, timeEntryTypes] = await Promise.all([
    getCatalog(user.organizationId, "activity_tag", { includeInactive: true }),
    getCatalog(user.organizationId, "activity_type", { includeInactive: true }),
    getCatalog(user.organizationId, "time_entry_type", { includeInactive: true }),
  ]);
  const canDelete = user.role === "superadmin";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Actividades"
        subtitle="Tipos, prioridades y etiquetas configurables."
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <CardHeader
            title={CATALOG_KINDS.activity_type.label}
            description={`${CATALOG_KINDS.activity_type.note} "General", "Meeting" y "Reminder" son del sistema — se pueden recolorear pero no renombrar ni eliminar.`}
          />
          <CatalogManager
            kind="activity_type"
            items={activityTypes}
            hasChildren={false}
            childLabel={null}
            canDelete={canDelete}
            withColor
            addPlaceholder="Nuevo tipo…"
          />
        </Card>
        <EnumCatalog
          title="Prioridades"
          values={workItemPriority.enumValues}
          meta={ticketPriorityMeta}
        />
      </div>

      <Card className="p-5">
        <CardHeader
          title={CATALOG_KINDS.time_entry_type.label}
          description={`${CATALOG_KINDS.time_entry_type.note} "Technical work" es del sistema (valor por defecto) — se puede recolorear pero no renombrar ni eliminar.`}
        />
        <CatalogManager
          kind="time_entry_type"
          items={timeEntryTypes}
          hasChildren={false}
          childLabel={null}
          canDelete={canDelete}
          withColor
          addPlaceholder="Nuevo tipo de trabajo…"
        />
      </Card>

      <EnumCatalog
        title="Estados"
        description="Ciclo de vida compartido con actividades de proyecto — no configurable hoy."
        values={ACTIVITY_STATUSES}
        meta={activityStatusMeta}
      />

      <Card className="p-5">
        <CardHeader
          title={CATALOG_KINDS.activity_tag.label}
          description={CATALOG_KINDS.activity_tag.note}
        />
        <CatalogManager
          kind="activity_tag"
          items={tags}
          hasChildren={false}
          childLabel={null}
          canDelete={canDelete}
          addPlaceholder="Nueva etiqueta…"
        />
      </Card>
    </div>
  );
}
