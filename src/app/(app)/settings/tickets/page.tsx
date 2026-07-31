import type { Metadata } from "next";
import { getFieldDefinitions } from "@/lib/custom-fields";
import { CATALOG_KINDS } from "@/lib/settings";
import { getCatalog, getSetting } from "@/lib/settings-data";
import { requireRole } from "@/lib/session";
import {
  countTicketsByBillingStatus,
  countTicketsByPriority,
  countTicketsByStatus,
  listTicketBillingStatuses,
  listTicketPriorities,
  listTicketStatuses,
} from "@/lib/ticket-catalogs";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { CatalogManager } from "../settings-forms";
import { TicketCatalogManager, TicketCatalogSection, type TicketCatalogRow } from "./catalog-manager";
import { FormConfigEditor, type AvailableField } from "./form-config-editor";
import { ViewSettingsEditor } from "./view-settings-editor";

export const metadata: Metadata = { title: "Configuración · Tickets" };

const STANDARD_TICKET_FIELDS: AvailableField[] = [
  { key: "subject", label: "Asunto", isCustomField: false },
  { key: "description", label: "Descripción", isCustomField: false },
  { key: "priority", label: "Prioridad", isCustomField: false },
  { key: "companyId", label: "Empresa", isCustomField: false },
  { key: "contactId", label: "Contacto", isCustomField: false },
  { key: "assigneeId", label: "Responsable", isCustomField: false },
  { key: "category", label: "Categoría", isCustomField: false },
  { key: "subcategory", label: "Subcategoría", isCustomField: false },
  { key: "channel", label: "Canal", isCustomField: false },
  { key: "modality", label: "Modalidad", isCustomField: false },
  { key: "slaDefinitionId", label: "SLA", isCustomField: false },
];

export default async function TicketsSettingsPage() {
  const user = await requireRole("superadmin", "administrator");
  const [categories, statuses, priorities, billingStatuses, customFields, formConfig, viewSettings] = await Promise.all([
    getCatalog(user.organizationId, "ticket_category", { includeInactive: true }),
    listTicketStatuses(user.organizationId, { includeInactive: true }),
    listTicketPriorities(user.organizationId, { includeInactive: true }),
    listTicketBillingStatuses(user.organizationId, { includeInactive: true }),
    getFieldDefinitions(user.organizationId, "tickets", { activeOnly: true }),
    getSetting(user.organizationId, "tickets.formConfig"),
    getSetting(user.organizationId, "tickets.viewSettings"),
  ]);

  const [statusUsage, priorityUsage, billingUsage] = await Promise.all([
    Promise.all(statuses.map((s) => countTicketsByStatus(user.organizationId, s.id))),
    Promise.all(priorities.map((p) => countTicketsByPriority(user.organizationId, p.id))),
    Promise.all(billingStatuses.map((b) => countTicketsByBillingStatus(user.organizationId, b.id))),
  ]);

  const statusRows: TicketCatalogRow[] = statuses.map((s, i) => ({ ...s, usageCount: statusUsage[i] }));
  const priorityRows: TicketCatalogRow[] = priorities.map((p, i) => ({ ...p, usageCount: priorityUsage[i] }));
  const billingRows: TicketCatalogRow[] = billingStatuses.map((b, i) => ({ ...b, usageCount: billingUsage[i] }));

  const availableFields: AvailableField[] = [
    ...STANDARD_TICKET_FIELDS,
    ...customFields.map((f) => ({ key: f.key, label: f.name, isCustomField: true })),
  ];
  const fieldOptions = availableFields.map((f) => ({ key: f.key, label: f.label }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tickets"
        subtitle="Catálogos, valores por defecto, formularios y vistas — todo configurable sin código."
      />

      <Card className="p-5">
        <CardHeader
          title={CATALOG_KINDS.ticket_category.label}
          description={CATALOG_KINDS.ticket_category.note}
          className="mb-3 px-0 pt-0"
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

      <div>
        <h2 className="mb-1 text-sm font-semibold text-fg">Catálogos dinámicos</h2>
        <p className="mb-3 text-sm text-muted">
          Estados, prioridades y estatus de cobro administrables — crea valores personalizados, cámbialos de orden,
          define el predeterminado y reasigna tickets antes de eliminar uno. Los valores de sistema (marcados
          &quot;Sistema&quot;) no se pueden eliminar, solo desactivar.
        </p>
        <div className="space-y-3">
          <TicketCatalogSection
            title="Estados"
            description="Workflows y SLA operan sobre la categoría semántica, no el nombre."
            count={statusRows.length}
            defaultOpen
          >
            <TicketCatalogManager kind="status" items={statusRows} addPlaceholder="Nuevo estado…" />
          </TicketCatalogSection>
          <TicketCatalogSection
            title="Prioridades"
            description="Asocia una regla de SLA en Configuración → SLA si aplica."
            count={priorityRows.length}
          >
            <TicketCatalogManager kind="priority" items={priorityRows} addPlaceholder="Nueva prioridad…" />
          </TicketCatalogSection>
          <TicketCatalogSection
            title="Estatus de cobro"
            description="Clasificación administrativa — no modifica importes ni tarifas."
            count={billingRows.length}
          >
            <TicketCatalogManager kind="billing" items={billingRows} addPlaceholder="Nuevo estatus de cobro…" />
          </TicketCatalogSection>
        </div>
      </div>

      <Card className="p-5">
        <CardHeader
          title="Formularios"
          description="Muestra/oculta campos, cámbialos de orden, márcalos obligatorios y agrúpalos en secciones."
          className="mb-3 px-0 pt-0"
        />
        <FormConfigEditor initial={formConfig} availableFields={availableFields} />
      </Card>

      <Card className="p-5">
        <CardHeader
          title="Vistas"
          description="Columnas, orden, vista inicial, agrupación y filtros globales por defecto para nuevos usuarios."
          className="mb-3 px-0 pt-0"
        />
        <ViewSettingsEditor initial={viewSettings} fieldOptions={fieldOptions} />
      </Card>
    </div>
  );
}
