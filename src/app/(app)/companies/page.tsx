import type { Metadata } from "next";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { clientServices, companies, contacts, services, users } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import {
  COMPANY_ACTIVE_SERVICES_SQL,
  COMPANY_FIELDS,
  COMPANY_LAST_TOUCH_SQL,
  COMPANY_NEXT_RENEWAL_SQL,
  COMPANY_OPEN_TICKETS_SQL,
  COMPANY_PENDING_BILLING_SQL,
  COMPANY_QUICK_FILTERS,
  buildFieldRegistry,
  buildFilterSql,
  companyQuickFilterSql,
  filterGroupSchema,
  toPublicFields,
  type CompanyQuickFilterKey,
  type FilterGroup,
} from "@/lib/filters";
import { getLastViewId } from "@/lib/last-view";
import { ensureInitialViews, listViews, savedViewConfigSchema } from "@/lib/views";
import { NewCompanyButton } from "./company-form";
import { CompaniesViewContent } from "./companies-view-content";
import type { CompanyRow } from "./company-views";

export const metadata: Metadata = { title: "Empresas" };

const BASE_PATH = "/companies";

type Search = { view?: string; quick?: string; filters?: string; q?: string };

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const params = await searchParams;
  const userId = Number(user.id);

  await ensureInitialViews(user.organizationId, "companies", [
    { name: "Todas", viewType: "table" },
    { name: "Renovación ≤ 30 días", viewType: "table", quick: "renewal" },
    { name: "Tickets abiertos", viewType: "table", quick: "open_tickets" },
    { name: "Facturación pendiente", viewType: "table", quick: "pending_billing" },
  ]);
  const views = await listViews(user.organizationId, userId, "companies");

  const lastViewId = await getLastViewId("companies");
  const requestedViewId = Number(params.view);
  const activeView =
    views.find((v) => v.id === requestedViewId) ??
    (lastViewId ? views.find((v) => v.id === lastViewId) : undefined) ??
    views.find((v) => v.isDefault) ??
    views[0];

  const viewConfig = savedViewConfigSchema.parse(activeView.config);
  const quick = (params.quick as CompanyQuickFilterKey | undefined) ?? (viewConfig.quick as CompanyQuickFilterKey | null) ?? null;
  const search = params.q ?? viewConfig.search ?? "";
  let filters: FilterGroup | null = viewConfig.filters ?? null;
  if (params.filters) {
    const parsed = filterGroupSchema.safeParse(JSON.parse(params.filters));
    if (parsed.success) filters = parsed.data;
  }

  const fieldRegistry = await buildFieldRegistry(COMPANY_FIELDS, []);

  const conditions = [eq(companies.organizationId, user.organizationId)];
  const filterSql = buildFilterSql(filters, fieldRegistry, "companies", companies.id);
  if (filterSql) conditions.push(filterSql);
  if (quick) {
    const qSql = companyQuickFilterSql(quick, userId);
    if (qSql) conditions.push(qSql);
  }
  if (search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(
      sql`(
        ${companies.name} ilike ${term}
        or coalesce(${companies.legalName}, '') ilike ${term}
        or coalesce(${companies.industry}, '') ilike ${term}
        or coalesce(${companies.email}, '') ilike ${term}
        or coalesce(${companies.phone}, '') ilike ${term}
        or exists (select 1 from ${contacts} c where c.company_id = ${companies.id}
          and (c.first_name || ' ' || c.last_name ilike ${term}
            or coalesce(c.email, '') ilike ${term}
            or coalesce(c.phone, '') ilike ${term}
            or coalesce(c.mobile, '') ilike ${term}))
        or exists (select 1 from ${clientServices} cs join ${services} s on s.id = cs.service_id
          where cs.company_id = ${companies.id} and s.name ilike ${term})
      )`,
    );
  }

  const rawRows = await db
    .select({
      id: companies.id,
      name: companies.name,
      status: companies.status,
      industry: companies.industry,
      website: companies.website,
      email: companies.email,
      phone: companies.phone,
      city: companies.city,
      state: companies.state,
      country: companies.country,
      primaryContact: sql<string | null>`(select c.first_name || ' ' || c.last_name
        from ${contacts} c where c.id = ${companies.primaryContactId})`,
      accountOwnerName: users.name,
      activeServices: COMPANY_ACTIVE_SERVICES_SQL,
      openTickets: COMPANY_OPEN_TICKETS_SQL,
      pendingBilling: COMPANY_PENDING_BILLING_SQL,
      nextRenewal: COMPANY_NEXT_RENEWAL_SQL,
      lastTouchAt: COMPANY_LAST_TOUCH_SQL,
      createdAt: companies.createdAt,
      updatedAt: companies.updatedAt,
    })
    .from(companies)
    .leftJoin(users, eq(companies.accountOwnerId, users.id))
    .where(and(...conditions))
    .orderBy(asc(companies.name))
    .limit(200);

  const rows: CompanyRow[] = rawRows;

  const orgUsers = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.organizationId, user.organizationId), ne(users.role, "client")))
    .orderBy(asc(users.name));

  return (
    <div>
      <PageHeader
        title="Empresas"
        subtitle="Cada cuenta a la que das soporte, cotizas y reportas."
        action={<NewCompanyButton />}
      />

      <CompaniesViewContent
        views={views}
        activeViewId={activeView.id}
        currentUserId={userId}
        currentUserRole={user.role}
        orgUsers={orgUsers}
        basePath={BASE_PATH}
        rows={rows}
        fields={toPublicFields(fieldRegistry)}
        quickFilters={COMPANY_QUICK_FILTERS}
        activeQuick={quick}
        activeFilters={filters}
        activeSearch={search}
      />
    </div>
  );
}
