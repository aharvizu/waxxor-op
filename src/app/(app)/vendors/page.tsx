import type { Metadata } from "next";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { vendorContacts, vendors, users } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import {
  VENDOR_ACTIVE_PURCHASES_SQL,
  VENDOR_FIELDS,
  VENDOR_QUICK_FILTERS,
  buildFieldRegistry,
  buildFilterSql,
  filterGroupSchema,
  toPublicFields,
  vendorQuickFilterSql,
  type FilterGroup,
  type VendorQuickFilterKey,
} from "@/lib/filters";
import { getLastViewId } from "@/lib/last-view";
import { ensureInitialViews, listViews, savedViewConfigSchema } from "@/lib/views";
import { NewVendorButton } from "./vendor-form";
import { VendorsViewContent } from "./vendors-view-content";
import type { VendorRow } from "./vendor-views";

export const metadata: Metadata = { title: "Proveedores" };

const BASE_PATH = "/vendors";

type Search = { view?: string; quick?: string; filters?: string; q?: string };

export default async function VendorsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const params = await searchParams;
  const userId = Number(user.id);

  await ensureInitialViews(user.organizationId, "vendors", [
    { name: "Todos", viewType: "table" },
    { name: "Activos", viewType: "table", quick: "active" },
    { name: "Con compras activas", viewType: "table", quick: "with_purchases" },
  ]);
  const views = await listViews(user.organizationId, userId, "vendors");

  const lastViewId = await getLastViewId("vendors");
  const requestedViewId = Number(params.view);
  const activeView =
    views.find((v) => v.id === requestedViewId) ??
    (lastViewId ? views.find((v) => v.id === lastViewId) : undefined) ??
    views.find((v) => v.isDefault) ??
    views[0];

  const viewConfig = savedViewConfigSchema.parse(activeView.config);
  const quick = (params.quick as VendorQuickFilterKey | undefined) ?? (viewConfig.quick as VendorQuickFilterKey | null) ?? null;
  const search = params.q ?? viewConfig.search ?? "";
  let filters: FilterGroup | null = viewConfig.filters ?? null;
  if (params.filters) {
    const parsed = filterGroupSchema.safeParse(JSON.parse(params.filters));
    if (parsed.success) filters = parsed.data;
  }

  const fieldRegistry = await buildFieldRegistry(VENDOR_FIELDS, []);

  const conditions = [eq(vendors.organizationId, user.organizationId)];
  const filterSql = buildFilterSql(filters, fieldRegistry, "vendors", vendors.id);
  if (filterSql) conditions.push(filterSql);
  if (quick) {
    const qSql = vendorQuickFilterSql(quick, userId);
    if (qSql) conditions.push(qSql);
  }
  if (search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(
      sql`(
        ${vendors.name} ilike ${term}
        or coalesce(${vendors.legalName}, '') ilike ${term}
        or coalesce(${vendors.category}, '') ilike ${term}
        or coalesce(${vendors.email}, '') ilike ${term}
        or coalesce(${vendors.phone}, '') ilike ${term}
        or exists (select 1 from ${vendorContacts} c where c.vendor_id = ${vendors.id}
          and (c.first_name || ' ' || c.last_name ilike ${term}
            or coalesce(c.email, '') ilike ${term}
            or coalesce(c.phone, '') ilike ${term}))
      )`,
    );
  }

  const rawRows = await db
    .select({
      id: vendors.id,
      name: vendors.name,
      status: vendors.status,
      category: vendors.category,
      website: vendors.website,
      email: vendors.email,
      phone: vendors.phone,
      city: vendors.city,
      country: vendors.country,
      accountOwnerName: users.name,
      activePurchases: VENDOR_ACTIVE_PURCHASES_SQL,
      createdAt: vendors.createdAt,
      updatedAt: vendors.updatedAt,
    })
    .from(vendors)
    .leftJoin(users, eq(vendors.accountOwnerId, users.id))
    .where(and(...conditions))
    .orderBy(asc(vendors.name))
    .limit(200);

  const rows: VendorRow[] = rawRows;

  const orgUsers = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.organizationId, user.organizationId), ne(users.role, "client")))
    .orderBy(asc(users.name));

  return (
    <div>
      <PageHeader
        title="Proveedores"
        subtitle="Empresas que nos surten productos y servicios — licenciamiento, hardware, conectividad."
        action={<NewVendorButton />}
      />

      <VendorsViewContent
        views={views}
        activeViewId={activeView.id}
        currentUserId={userId}
        currentUserRole={user.role}
        orgUsers={orgUsers}
        basePath={BASE_PATH}
        rows={rows}
        fields={toPublicFields(fieldRegistry)}
        quickFilters={VENDOR_QUICK_FILTERS}
        activeQuick={quick}
        activeFilters={filters}
        activeSearch={search}
      />
    </div>
  );
}
