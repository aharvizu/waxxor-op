import type { Metadata } from "next";
import { getFieldDefinitions } from "@/lib/custom-fields";
import { getOrgLocale } from "@/lib/get-org-locale";
import { t, type Locale } from "@/lib/i18n";
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

function getStandardTicketFields(locale: Locale): AvailableField[] {
  return [
    { key: "subject", label: t("Asunto", "Subject", locale), isCustomField: false },
    { key: "description", label: t("Descripción", "Description", locale), isCustomField: false },
    { key: "priority", label: t("Prioridad", "Priority", locale), isCustomField: false },
    { key: "companyId", label: t("Empresa", "Company", locale), isCustomField: false },
    { key: "contactId", label: t("Contacto", "Contact", locale), isCustomField: false },
    { key: "assigneeId", label: t("Responsable", "Assignee", locale), isCustomField: false },
    { key: "category", label: t("Categoría", "Category", locale), isCustomField: false },
    { key: "subcategory", label: t("Subcategoría", "Subcategory", locale), isCustomField: false },
    { key: "channel", label: t("Canal", "Channel", locale), isCustomField: false },
    { key: "modality", label: t("Modalidad", "Modality", locale), isCustomField: false },
    { key: "slaDefinitionId", label: "SLA", isCustomField: false },
  ];
}

export default async function TicketsSettingsPage() {
  const user = await requireRole("superadmin", "administrator");
  const locale = await getOrgLocale(user.organizationId);
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
    ...getStandardTicketFields(locale),
    ...customFields.map((f) => ({ key: f.key, label: f.name, isCustomField: true })),
  ];
  const fieldOptions = availableFields.map((f) => ({ key: f.key, label: f.label }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tickets"
        subtitle={t(
          "Catálogos, valores por defecto, formularios y vistas — todo configurable sin código.",
          "Catalogs, defaults, forms, and views — all configurable without code.",
          locale,
        )}
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
          addPlaceholder={t("Nueva categoría…", "New category…", locale)}
        />
      </Card>

      <div>
        <h2 className="mb-1 text-sm font-semibold text-fg">{t("Catálogos dinámicos", "Dynamic catalogs", locale)}</h2>
        <p className="mb-3 text-sm text-muted">
          {t(
            "Estados, prioridades y estatus de cobro administrables — crea valores personalizados, cámbialos de orden, define el predeterminado y reasigna tickets antes de eliminar uno. Los valores de sistema (marcados “Sistema”) no se pueden eliminar, solo desactivar.",
            "Manageable statuses, priorities, and billing statuses — create custom values, reorder them, set the default, and reassign tickets before deleting one. System values (marked “System”) can't be deleted, only deactivated.",
            locale,
          )}
        </p>
        <div className="space-y-3">
          <TicketCatalogSection
            title={t("Estados", "Statuses", locale)}
            description={t(
              "Workflows y SLA operan sobre la categoría semántica, no el nombre.",
              "Workflows and SLAs operate on the semantic category, not the name.",
              locale,
            )}
            count={statusRows.length}
            defaultOpen
          >
            <TicketCatalogManager kind="status" items={statusRows} addPlaceholder={t("Nuevo estado…", "New status…", locale)} />
          </TicketCatalogSection>
          <TicketCatalogSection
            title={t("Prioridades", "Priorities", locale)}
            description={t(
              "Asocia una regla de SLA en Configuración → SLA si aplica.",
              "Associate an SLA rule in Settings → SLA if applicable.",
              locale,
            )}
            count={priorityRows.length}
          >
            <TicketCatalogManager kind="priority" items={priorityRows} addPlaceholder={t("Nueva prioridad…", "New priority…", locale)} />
          </TicketCatalogSection>
          <TicketCatalogSection
            title={t("Estatus de cobro", "Billing statuses", locale)}
            description={t(
              "Clasificación administrativa — no modifica importes ni tarifas.",
              "Administrative classification — doesn't change amounts or rates.",
              locale,
            )}
            count={billingRows.length}
          >
            <TicketCatalogManager kind="billing" items={billingRows} addPlaceholder={t("Nuevo estatus de cobro…", "New billing status…", locale)} />
          </TicketCatalogSection>
        </div>
      </div>

      <Card className="p-5">
        <CardHeader
          title={t("Formularios", "Forms", locale)}
          description={t(
            "Muestra/oculta campos, cámbialos de orden, márcalos obligatorios y agrúpalos en secciones.",
            "Show/hide fields, reorder them, mark them required, and group them into sections.",
            locale,
          )}
          className="mb-3 px-0 pt-0"
        />
        <FormConfigEditor initial={formConfig} availableFields={availableFields} />
      </Card>

      <Card className="p-5">
        <CardHeader
          title={t("Vistas", "Views", locale)}
          description={t(
            "Columnas, orden, vista inicial, agrupación y filtros globales por defecto para nuevos usuarios.",
            "Columns, order, initial view, grouping, and default global filters for new users.",
            locale,
          )}
          className="mb-3 px-0 pt-0"
        />
        <ViewSettingsEditor initial={viewSettings} fieldOptions={fieldOptions} />
      </Card>
    </div>
  );
}
