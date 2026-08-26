import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { services, serviceVariants, slaDefinitions, users } from "@/db/schema";
import { getLabels } from "@/lib/labels";
import { getOrgLocale } from "@/lib/get-org-locale";
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
        title="Empresas"
        subtitle="Parámetros por defecto, SLA por defecto y catálogos de clasificación."
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <CardHeader
            title="Parámetros por defecto"
            description="Se preseleccionan al crear una empresa nueva; siempre editables por empresa."
          />
          <SettingSectionForm settingKey="companies.defaults">
            <div>
              <label className={labelClass}>Responsable de cuenta por defecto</label>
              <SearchableSelect
                name="defaultAccountOwnerId"
                defaultValue={defaults.defaultAccountOwnerId ? String(defaults.defaultAccountOwnerId) : ""}
                options={[{ value: "", label: "Sin valor por defecto" }, ...internalUsers.map((u) => ({ value: String(u.id), label: u.name }))]}
              />
            </div>
            <div>
              <label className={labelClass}>Técnico por defecto</label>
              <SearchableSelect
                name="defaultTechnicianId"
                defaultValue={defaults.defaultTechnicianId ? String(defaults.defaultTechnicianId) : ""}
                options={[{ value: "", label: "Sin valor por defecto" }, ...internalUsers.map((u) => ({ value: String(u.id), label: u.name }))]}
              />
            </div>
          </SettingSectionForm>
        </Card>

        <Card className="p-5">
          <CardHeader
            title="SLA por defecto"
            description="El SLA por defecto es por prioridad de ticket y se administra en Configuración → SLA (solo SuperAdmin, regla R7)."
          />
          {defaultSlas.length === 0 ? (
            <p className="text-sm text-muted">No hay definiciones SLA por defecto activas.</p>
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
            También puede fijarse SLA en el catálogo de servicios y por servicio contratado.{" "}
            <Link href="/settings/sla" className="text-primary hover:underline">Administrar SLA →</Link>
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
            addPlaceholder="Nueva categoría…"
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
            addPlaceholder="Nueva etiqueta…"
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
            addPlaceholder="Nueva categoría…"
          />
        </Card>
      </div>

      <Card className="p-5">
        <CardHeader
          title="Catálogo de servicios"
          description="Servicios que ofrece la organización (Microsoft 365, Backup, Soporte, …) y sus variantes/SKU (ej. licenciamientos) — se eligen al contratar un servicio para una empresa, en su ficha."
        />
        <ServicesManager services={serviceCatalog} />
      </Card>
    </div>
  );
}
