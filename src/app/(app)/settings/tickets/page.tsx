import type { Metadata } from "next";
import { getStyledMeta } from "@/lib/catalog-styles";
import { getFieldDefinitions } from "@/lib/custom-fields";
import { ticketBillingMeta, ticketPriorityMeta, ticketStatusMeta } from "@/lib/labels";
import { CATALOG_KINDS } from "@/lib/settings";
import { getCatalog, getSetting } from "@/lib/settings-data";
import { requireRole } from "@/lib/session";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { CatalogManager, SettingSectionForm } from "../settings-forms";
import { EnumStyleManager } from "../enum-style-manager";
import { FormConfigEditor, type AvailableField } from "./form-config-editor";
import { ViewSettingsEditor } from "./view-settings-editor";

export const metadata: Metadata = { title: "Configuración · Tickets" };

/** Official ticket lifecycle statuses (docs/features/tickets.md). Cosmetic
 * style only — the workflow itself is unchanged, see enum-style-manager.tsx. */
const TICKET_STATUSES = [
  "new", "assigned", "in_progress", "waiting_customer", "waiting_third_party",
  "scheduled", "resolved", "pending_confirmation", "closed", "reopened", "cancelled",
] as const;
const TICKET_PRIORITIES = ["low", "medium", "high", "critical"] as const;
const TICKET_BILLING_STATUSES = [
  "pending_review", "included_in_contract", "billable", "contract_overage",
  "fixed_price", "no_charge", "included_in_monthly_charge", "charged",
] as const;

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
  const [
    categories,
    statusStyles,
    priorityStyles,
    billingStyles,
    statusRows,
    priorityRows,
    billingRows,
    customFields,
    formConfig,
    viewSettings,
    defaults,
  ] = await Promise.all([
    getCatalog(user.organizationId, "ticket_category", { includeInactive: true }),
    getStyledMeta(user.organizationId, "ticket_status_style", ticketStatusMeta),
    getStyledMeta(user.organizationId, "ticket_priority_style", ticketPriorityMeta),
    getStyledMeta(user.organizationId, "ticket_billing_status_style", ticketBillingMeta),
    getCatalog(user.organizationId, "ticket_status_style", { includeInactive: true }),
    getCatalog(user.organizationId, "ticket_priority_style", { includeInactive: true }),
    getCatalog(user.organizationId, "ticket_billing_status_style", { includeInactive: true }),
    getFieldDefinitions(user.organizationId, "tickets", { activeOnly: true }),
    getSetting(user.organizationId, "tickets.formConfig"),
    getSetting(user.organizationId, "tickets.viewSettings"),
    getSetting(user.organizationId, "tickets.defaults"),
  ]);

  const availableFields: AvailableField[] = [
    ...STANDARD_TICKET_FIELDS,
    ...customFields.map((f) => ({ key: f.key, label: f.name, isCustomField: true })),
  ];
  const fieldOptions = availableFields.map((f) => ({ key: f.key, label: f.label }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tickets"
        subtitle="Categorías, estilos, valores por defecto, formularios y vistas — todo configurable sin código."
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
        <h2 className="mb-3 text-sm font-semibold text-fg">Estilos (etiqueta, color, ícono, orden)</h2>
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          <EnumStyleManager
            kind="ticket_status_style"
            title="Estados"
            description="El flujo de trabajo no cambia — solo su presentación."
            values={TICKET_STATUSES}
            styled={statusStyles}
            existingRows={statusRows}
          />
          <EnumStyleManager
            kind="ticket_priority_style"
            title="Prioridades"
            description="Usadas también por la asignación automática de SLA."
            values={TICKET_PRIORITIES}
            styled={priorityStyles}
            existingRows={priorityRows}
          />
          <EnumStyleManager
            kind="ticket_billing_status_style"
            title="Estatus de cobro"
            description="Determinan el color/etiqueta mostrados, no el cálculo del monto."
            values={TICKET_BILLING_STATUSES}
            styled={billingStyles}
            existingRows={billingRows}
          />
        </div>
      </div>

      <Card className="p-5">
        <CardHeader
          title="Valores por defecto"
          description="Prioridad preseleccionada al crear un ticket nuevo."
          className="mb-3 px-0 pt-0"
        />
        <SettingSectionForm settingKey="tickets.defaults">
          <div className="max-w-xs">
            <label className="mb-1.5 block text-sm font-medium text-fg">Prioridad por defecto</label>
            <select
              name="defaultPriority"
              defaultValue={defaults.defaultPriority}
              className="w-full rounded-lg border border-edge bg-surface px-3 py-2 text-sm"
            >
              {TICKET_PRIORITIES.map((p) => (
                <option key={p} value={p}>{ticketPriorityMeta[p]?.label ?? p}</option>
              ))}
            </select>
          </div>
        </SettingSectionForm>
      </Card>

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
