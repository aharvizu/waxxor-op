import type { Metadata } from "next";
import { workItemPriority, ticketBillingModality } from "@/db/schema";
import { ticketBillingMeta, ticketPriorityMeta, ticketStatusMeta } from "@/lib/labels";
import { CATALOG_KINDS } from "@/lib/settings";
import { getCatalog } from "@/lib/settings-data";
import { requireRole } from "@/lib/session";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { EnumCatalog } from "../enum-catalog";
import { CatalogManager } from "../settings-forms";

export const metadata: Metadata = { title: "Configuración · Tickets" };

/** Official ticket lifecycle statuses (docs/features/tickets.md). */
const TICKET_STATUSES = [
  "new",
  "assigned",
  "in_progress",
  "waiting_customer",
  "waiting_third_party",
  "scheduled",
  "resolved",
  "pending_confirmation",
  "closed",
  "reopened",
  "cancelled",
] as const;

export default async function TicketsSettingsPage() {
  const user = await requireRole("superadmin", "administrator");
  const categories = await getCatalog(user.organizationId, "ticket_category", {
    includeInactive: true,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tickets"
        subtitle="Categorías y subcategorías configurables; prioridades, modalidades y estados del sistema."
      />

      <Card className="p-5">
        <CardHeader
          title={CATALOG_KINDS.ticket_category.label}
          description={CATALOG_KINDS.ticket_category.note}
        />
        <CatalogManager
          kind="ticket_category"
          items={categories}
          hasChildren
          childLabel={CATALOG_KINDS.ticket_category.childLabel}
          canDelete={user.role === "superadmin"}
          addPlaceholder="Nueva categoría…"
        />
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <EnumCatalog
          title="Prioridades"
          description="Las usa la asignación automática de SLA por prioridad."
          values={workItemPriority.enumValues}
          meta={ticketPriorityMeta}
        />
        <EnumCatalog
          title="Modalidades de cobro"
          description="Determinan el cálculo del monto (remota/en sitio por hora, precio fijo)."
          values={ticketBillingModality.enumValues}
          meta={ticketBillingMeta}
        />
      </div>

      <EnumCatalog
        title="Estados del ciclo de vida"
        description="Estados configurables: no compatibles hoy — el ciclo de vida oficial (SLA, confirmación, reapertura) depende de estos estados."
        values={TICKET_STATUSES}
        meta={ticketStatusMeta}
      />
    </div>
  );
}
