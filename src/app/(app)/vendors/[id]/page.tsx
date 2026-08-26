import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, ne } from "drizzle-orm";
import { Building2, Contact as ContactIcon, FileSignature, IdCard, Package, Truck } from "lucide-react";
import { db } from "@/db";
import { services, users } from "@/db/schema";
import { fmtDate, fmtMoney } from "@/lib/format";
import { getLabels } from "@/lib/labels";
import { getOrgLocale } from "@/lib/get-org-locale";
import { getVendor, getVendorContacts, getVendorProducts, getVendorPurchases } from "@/lib/vendor360-data";
import { requireUser } from "@/lib/session";
import { getCatalogNames } from "@/lib/settings-data";
import { Avatar, Badge, buttonClass, Card, CardHeader, EmptyState, PageHeader, THead, Table, Td, Th, cx } from "@/components/ui";
import {
  AddVendorContactButton,
  AddVendorProductForm,
  VendorContactsTable,
  VendorProductsList,
  VendorProfileForm,
} from "../vendor360-forms";

export const metadata: Metadata = { title: "Proveedor" };

const TABS = [
  ["perfil", "Perfil", IdCard],
  ["contactos", "Contactos", ContactIcon],
  ["contratos", "Contratos", FileSignature],
  ["productos", "Productos", Package],
] as const;
type Tab = (typeof TABS)[number][0];

function TabLink({
  href,
  active,
  icon: Icon,
  children,
}: {
  href: string;
  active: boolean;
  icon: typeof Truck;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cx(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
        active ? "bg-subtle font-medium text-fg" : "text-muted hover:bg-subtle hover:text-fg",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden />
      {children}
    </Link>
  );
}

export default async function VendorDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const user = await requireUser();
  const locale = await getOrgLocale(user.organizationId);
  const { vendorStatusMeta } = getLabels(locale);
  const { id } = await params;
  const { tab: rawTab } = await searchParams;
  const vendorId = Number(id);
  if (!Number.isInteger(vendorId)) notFound();

  const vendor = await getVendor(user.organizationId, vendorId);
  if (!vendor) notFound();

  const tab: Tab = TABS.some(([t]) => t === rawTab) ? (rawTab as Tab) : "perfil";

  const [internalUsers, categoryOptions] = await Promise.all([
    db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(and(eq(users.organizationId, user.organizationId), ne(users.role, "client")))
      .orderBy(asc(users.name)),
    getCatalogNames(user.organizationId, "vendor_category"),
  ]);

  return (
    <div>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Avatar name={vendor.name} size="md" square />
            {vendor.name}
            <Badge tone={vendorStatusMeta[vendor.status]?.tone ?? "slate"}>{vendorStatusMeta[vendor.status]?.label ?? vendor.status}</Badge>
          </span>
        }
        subtitle={vendor.category ?? vendor.legalName ?? undefined}
        action={
          <Link href="/vendors" className={buttonClass}>
            Volver
          </Link>
        }
      />

      <div className="flex flex-col gap-6 lg:flex-row">
        <nav aria-label="Secciones del proveedor" className="lg:w-56 lg:shrink-0">
          <ul className="flex flex-wrap gap-1 lg:flex-col">
            {TABS.map(([key, label, Icon]) => (
              <li key={key}>
                <TabLink href={`/vendors/${vendorId}?tab=${key}`} active={tab === key} icon={Icon}>
                  {label}
                </TabLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 flex-1">
          {tab === "perfil" ? (
            <VendorProfileForm vendor={vendor} internalUsers={internalUsers} categoryOptions={categoryOptions} />
          ) : null}
          {tab === "contactos" ? <ContactosTab vendorId={vendorId} orgId={user.organizationId} /> : null}
          {tab === "contratos" ? <ContratosTab vendorId={vendorId} orgId={user.organizationId} /> : null}
          {tab === "productos" ? (
            <ProductosTab vendorId={vendorId} orgId={user.organizationId} canManage={user.role === "superadmin" || user.role === "administrator"} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

async function ContactosTab({ vendorId, orgId }: { vendorId: number; orgId: number }) {
  const contacts = await getVendorContacts(orgId, vendorId);
  return (
    <div className="space-y-6">
      <AddVendorContactButton vendorId={vendorId} />
      {contacts.length === 0 ? (
        <EmptyState icon={<ContactIcon />} title="Sin contactos registrados">
          Agrega el primer contacto de este proveedor.
        </EmptyState>
      ) : (
        <VendorContactsTable vendorId={vendorId} contacts={contacts} />
      )}
    </div>
  );
}

async function ContratosTab({ vendorId, orgId }: { vendorId: number; orgId: number }) {
  const rows = await getVendorPurchases(orgId, vendorId);
  return (
    <Card className="overflow-hidden">
      <CardHeader title="Contratos de clientes" description="Servicios contratados de clientes que registran a este proveedor como origen." />
      {rows.length === 0 ? (
        <EmptyState icon={<Building2 />} title="Sin servicios ligados">
          Cuando registres un servicio contratado en la pestaña &quot;Servicios&quot; de una Empresa y elijas este proveedor,
          aparecerá aquí.
        </EmptyState>
      ) : (
        <Table>
          <THead>
            <tr>
              <Th>Cliente</Th>
              <Th>Servicio</Th>
              <Th>Cantidad</Th>
              <Th>Costo</Th>
              <Th>Renovación</Th>
            </tr>
          </THead>
          <tbody className="divide-y divide-edge-strong">
            {rows.map(({ cs, companyName, serviceName, variantName }) => (
              <tr key={cs.id}>
                <Td className="font-medium text-fg">
                  <Link href={`/companies/${cs.companyId}`} className="hover:text-primary hover:underline">
                    {companyName}
                  </Link>
                </Td>
                <Td className="text-muted">
                  {serviceName}
                  {variantName ? <span className="ml-1.5">· {variantName}</span> : null}
                </Td>
                <Td className="tabular-nums text-muted">{cs.quantity ?? "—"}</Td>
                <Td className="tabular-nums text-muted">{cs.cost ? fmtMoney(cs.cost) : "—"}</Td>
                <Td className="text-muted">{cs.renewalDate ? fmtDate(cs.renewalDate) : "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </Card>
  );
}

/** Catalog products/services this vendor offers by default — separate from Contratos, which is what clients actually bought. Editable by SuperAdmin/Administrator only (same gate as the Services catalog itself); other roles get a read-only list. */
async function ProductosTab({ vendorId, orgId, canManage }: { vendorId: number; orgId: number; canManage: boolean }) {
  const [products, allServices] = await Promise.all([
    getVendorProducts(orgId, vendorId),
    canManage
      ? db
          .select({ id: services.id, name: services.name })
          .from(services)
          .where(and(eq(services.organizationId, orgId), eq(services.status, "active")))
          .orderBy(asc(services.name))
      : Promise.resolve([]),
  ]);
  return (
    <div className="space-y-6">
      {canManage ? (
        <Card className="p-5">
          <CardHeader title="Agregar producto o servicio" description="Del catálogo general (Configuración → Empresas) — el mismo que usa una Empresa al contratar un servicio." className="mb-4 px-0 pt-0" />
          {allServices.length === 0 ? (
            <p className="text-sm text-muted">
              Aún no hay servicios en el catálogo de la organización.{" "}
              <Link href="/settings/companies" className="text-primary hover:underline">
                Créalos en Configuración → Empresas
              </Link>
              .
            </p>
          ) : (
            <AddVendorProductForm vendorId={vendorId} serviceOptions={allServices} />
          )}
        </Card>
      ) : null}

      {products.length === 0 ? (
        <EmptyState icon={<Package />} title="Sin productos identificados">
          {canManage
            ? "Agrega los productos o servicios que este proveedor ofrece, tomándolos del catálogo general."
            : "Este proveedor aún no tiene productos identificados."}
        </EmptyState>
      ) : canManage ? (
        <VendorProductsList vendorId={vendorId} rows={products} />
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <THead>
              <tr>
                <Th>Servicio</Th>
                <Th>Categoría</Th>
              </tr>
            </THead>
            <tbody className="divide-y divide-edge-strong">
              {products.map((s) => (
                <tr key={s.id}>
                  <Td className="font-medium text-fg">{s.name}</Td>
                  <Td className="text-muted">{s.category ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
