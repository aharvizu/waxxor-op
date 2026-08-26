import type { Metadata } from "next";
import { workItemPriority } from "@/db/schema";
import { getLabels } from "@/lib/labels";
import { getOrgLocale } from "@/lib/get-org-locale";
import { t } from "@/lib/i18n";
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
  const locale = await getOrgLocale(user.organizationId);
  const { activityStatusMeta, ticketPriorityMeta } = getLabels(locale);
  const timeEntryTypes = await getCatalog(user.organizationId, "time_entry_type", { includeInactive: true });
  const canDelete = user.role === "superadmin";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Actividades", "Activities", locale)}
        subtitle={t("Tipos y prioridades configurables.", "Configurable types and priorities.", locale)}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <CardHeader
            title={CATALOG_KINDS.time_entry_type.label}
            description={`${CATALOG_KINDS.time_entry_type.note} ${t(
              '"Technical work", "General", "Meeting" y "Reminder" son del sistema — se pueden recolorear pero no renombrar ni eliminar.',
              '"Technical work", "General", "Meeting" and "Reminder" are system defaults — they can be recolored but not renamed or deleted.',
              locale,
            )}`}
          />
          <CatalogManager
            kind="time_entry_type"
            items={timeEntryTypes}
            hasChildren={false}
            childLabel={null}
            canDelete={canDelete}
            withColor
            addPlaceholder={t("Nuevo tipo de trabajo…", "New work type…", locale)}
          />
        </Card>
        <EnumCatalog
          title={t("Prioridades", "Priorities", locale)}
          values={workItemPriority.enumValues}
          meta={ticketPriorityMeta}
        />
      </div>

      <EnumCatalog
        title={t("Estados", "Statuses", locale)}
        description={t(
          "Ciclo de vida compartido con actividades de proyecto — no configurable hoy.",
          "Lifecycle shared with project activities — not configurable today.",
          locale,
        )}
        values={ACTIVITY_STATUSES}
        meta={activityStatusMeta}
      />
    </div>
  );
}
