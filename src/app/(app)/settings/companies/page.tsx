import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { slaDefinitions, users } from "@/db/schema";
import { ticketPriorityMeta } from "@/lib/labels";
import { CATALOG_KINDS } from "@/lib/settings";
import { getCatalog, getSetting } from "@/lib/settings-data";
import { requireRole } from "@/lib/session";
import { Badge, Card, CardHeader, PageHeader, inputClass, labelClass } from "@/components/ui";
import { CatalogManager, SettingSectionForm } from "../settings-forms";

export const metadata: Metadata = { title: "Configuración · Empresas" };

export default async function CompaniesSettingsPage() {
  const user = await requireRole("superadmin", "administrator");
  const [defaults, internalUsers, defaultSlas, categories, tags] = await Promise.all([
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
  ]);

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
              <select
                name="defaultAccountOwnerId"
                defaultValue={defaults.defaultAccountOwnerId ?? ""}
                className={inputClass}
              >
                <option value="">Sin valor por defecto</option>
                {internalUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Técnico por defecto</label>
              <select
                name="defaultTechnicianId"
                defaultValue={defaults.defaultTechnicianId ?? ""}
                className={inputClass}
              >
                <option value="">Sin valor por defecto</option>
                {internalUsers.map((u) => (
                  <option key={u.id} value={u.id}>{u.name}</option>
                ))}
              </select>
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
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
      </div>
    </div>
  );
}
