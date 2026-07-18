import type { Metadata } from "next";
import { activityType, workItemPriority } from "@/db/schema";
import { activityStatusMeta, activityTypeMeta, ticketPriorityMeta } from "@/lib/labels";
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
  const tags = await getCatalog(user.organizationId, "activity_tag", { includeInactive: true });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Actividades"
        subtitle="Tipos y prioridades del sistema; etiquetas configurables."
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <EnumCatalog
          title="Tipos de actividad"
          description="Incluye Reunión y Recordatorio (los usa el botón Crear de Hoy y las recurrencias)."
          values={activityType.enumValues}
          meta={activityTypeMeta}
        />
        <EnumCatalog
          title="Prioridades"
          values={workItemPriority.enumValues}
          meta={ticketPriorityMeta}
        />
      </div>

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
          canDelete={user.role === "superadmin"}
          addPlaceholder="Nueva etiqueta…"
        />
      </Card>
    </div>
  );
}
