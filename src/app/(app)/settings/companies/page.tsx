import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { services, serviceVariants, slaDefinitions, users } from "@/db/schema";
import { getLabels } from "@/lib/labels";
import { getOrgLocale } from "@/lib/get-org-locale";
import { t } from "@/lib/i18n";
import { CATALOG_KINDS } from "@/lib/settings";
import { getCatalog, getSetting } from "@/lib/settings-data";
import { requireRole } from "@/lib/session";
import { Badge, Card, CardHeader, PageHeader, labelClass } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import { CatalogManager, SettingSectionForm } from "../settings-forms";
import { ServicesManager, type ServiceRow } from "./service-forms";

export const metadata: Metadata = { title: "Configuración · Empresas" };

export default async function CompaniesSettingsPage() {
  const user = await requireRole("superadmin", "administrator");
  const locale = await getOrgLocale(user.organizationId);
  const { ticketPriorityMeta } = getLabels(locale);
  const [defaults, internalUsers, defaultSlas, categories, tags, vendorCategories, serviceRows, variantRows] = await Promise.all([
    getSetting(user.organizationId, "companies.defaults"),
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.organizationId, user.organizationId), eq(users.isActive, true)))
      .orderBy(asc(users.name)),
    db
      .select()
      .from(slaDefinitions)
      .where(
        and(
          eq(slaDefinitions.organizationId, user.organizationId),
          eq(slaDefinitions.isDefault, true),
          eq(slaDefinitions.status, "active"),
        ),
      ),
    getCatalog(user.organizationId, "company_category", { includeInactive: true }),
    getCatalog(user.organizationId, "company_tag", { includeInactive: true }),
    getCatalog(user.organizationId, "vendor_category", { includeInactive: true }),
    db.select().from(services).where(eq(services.organizationId, user.organizationId)).orderBy(asc(services.name)),
    db.select().from(serviceVariants).where(eq(serviceVariants.organizationId, user.organizationId)).orderBy(asc(serviceVariants.name)),
  ]);
  const serviceCatalog: ServiceRow[] = serviceRows.map((s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    description: s.description,
    scope: s.scope,
    defaultRemoteRate: s.defaultRemoteRate,
    defaultOnsiteRate: s.defaultOnsiteRate,
    defaultFixedPrice: s.defaultFixedPrice,
    isRenewable: s.isRenewable,
    status: s.status,
    variants: variantRows
      .filter((v) => v.serviceId === s.id)
      .map((v) => ({
        id: v.id,
        name: v.name,
        sku: v.sku,
        description: v.description,
        defaultRemoteRate: v.defaultRemoteRate,
        defaultOnsiteRate: v.defaultOnsiteRate,
        defaultFixedPrice: v.defaultFixedPrice,
        status: v.status,
      })),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Empresas", "Companies", locale)}
        subtitle={t(
          "Parámetros por defecto, SLA por defecto y catálogos de clasificación.",
          "Default parameters, default SLA, and classification catalogs.",
          locale,
        )}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <CardHeader
            title={t("Parámetros por defecto", "Default parameters", locale)}
            description={t(
              "Se preseleccionan al crear una empresa nueva; siempre editables por empresa.",
              "Preselected when creating a new company; always editable per company.",
              locale,
            )}
          />
          <SettingSectionForm settingKey="companies.defaults">
            <div>
              <label className={labelClass}>{t("Responsable de cuenta por defecto", "Default account owner", locale)}</label>
              <SearchableSelect
                name="defaultAccountOwnerId"
                defaultValue={defaults.defaultAccountOwnerId ? String(defaults.defaultAccountOwnerId) : ""}
                options={[{ value: "", label: t("Sin valor por defecto", "No default value", locale) }, ...internalUsers.map((u) => ({ value: String(u.id), label: u.name }))]}
              />
            </div>
            <div>
              <label className={labelClass}>{t("Técnico por defecto", "Default technician", locale)}</label>
              <SearchableSelect
                name="defaultTechnicianId"
                defaultValue={defaults.defaultTechnicianId ? String(defaults.defaultTechnicianId) : ""}
                options={[{ value: "", label: t("Sin valor por defecto", "No default value", locale) }, ...internalUsers.map((u) => ({ value: String(u.id), label: u.name }))]}
              />
            </div>
          </SettingSectionForm>
        </Card>

        <Card className="p-5">
          <CardHeader
            title={t("SLA por defecto", "Default SLA", locale)}
            description={t(
              "El SLA por defecto es por prioridad de ticket y se administra en Configuración → SLA (solo SuperAdmin, regla R7).",
              "The default SLA is set per ticket priority and managed under Settings → SLA (SuperAdmin only, rule R7).",
              locale,
            )}
          />
          {defaultSlas.length === 0 ? (
            <p className="text-sm text-muted">{t("No hay definiciones SLA por defecto activas.", "There are no active default SLA definitions.", locale)}</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {defaultSlas.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2">
                  <span className="text-fg">{d.name}</span>
                  <Badge tone={ticketPriorityMeta[d.priority]?.tone ?? "slate"}>
                    {ticketPriorityMeta[d.priority]?.label ?? d.priority}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-muted">
            {t(
              "También puede fijarse SLA en el catálogo de servicios y por servicio contratado.",
              "SLA can also be set in the service catalog and per contracted service.",
              locale,
            )}{" "}
            <Link href="/settings/sla" className="text-primary hover:underline">{t("Administrar SLA →", "Manage SLA →", locale)}</Link>
          </p>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="p-5">
          <CardHeader
            title={CATALOG_KINDS.company_category.label}
            description={CATALOG_KINDS.company_category.note}
          />
          <CatalogManager
            kind="company_category"
            items={categories}
            hasChildren={false}
            childLabel={null}
            canDelete={user.role === "superadmin"}
            addPlaceholder={t("Nueva categoría…", "New category…", locale)}
          />
        </Card>
        <Card className="p-5">
          <CardHeader
            title={CATALOG_KINDS.company_tag.label}
            description={CATALOG_KINDS.company_tag.note}
          />
          <CatalogManager
            kind="company_tag"
            items={tags}
            hasChildren={false}
            childLabel={null}
            canDelete={user.role === "superadmin"}
            addPlaceholder={t("Nueva etiqueta…", "New tag…", locale)}
          />
        </Card>
        <Card className="p-5">
          <CardHeader
            title={CATALOG_KINDS.vendor_category.label}
            description={CATALOG_KINDS.vendor_category.note}
          />
          <CatalogManager
            kind="vendor_category"
            items={vendorCategories}
            hasChildren={false}
            childLabel={null}
            canDelete={user.role === "superadmin"}
            addPlaceholder={t("Nueva categoría…", "New category…", locale)}
          />
        </Card>
      </div>

      <Card className="p-5">
        <CardHeader
          title={t("Catálogo de servicios", "Service catalog", locale)}
          description={t(
            "Servicios que ofrece la organización (Microsoft 365, Backup, Soporte, …) y sus variantes/SKU (ej. licenciamientos) — se eligen al contratar un servicio para una empresa, en su ficha.",
            "Services the organization offers (Microsoft 365, Backup, Support, …) and their variants/SKUs (e.g. licensing) — chosen when contracting a service for a company, on its record.",
            locale,
          )}
        />
        <ServicesManager services={serviceCatalog} />
      </Card>
    </div>
  );
}
