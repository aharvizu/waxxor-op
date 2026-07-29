import type { Metadata } from "next";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { companies, contacts, users } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { PageHeader } from "@/components/ui";
import {
  CONTACT_FIELDS,
  CONTACT_OPEN_TICKETS_SQL,
  CONTACT_QUICK_FILTERS,
  buildFieldRegistry,
  buildFilterSql,
  contactQuickFilterSql,
  filterGroupSchema,
  toPublicFields,
  type ContactQuickFilterKey,
  type FilterGroup,
} from "@/lib/filters";
import { getLastViewId } from "@/lib/last-view";
import { ensureInitialViews, listViews, savedViewConfigSchema } from "@/lib/views";
import { NewContactButton } from "./contact-form";
import { ContactsViewContent } from "./contacts-view-content";
import type { ContactRow } from "./contact-views";

export const metadata: Metadata = { title: "Contactos" };

const BASE_PATH = "/contacts";

type Search = { view?: string; quick?: string; filters?: string; q?: string };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const params = await searchParams;
  const userId = Number(user.id);

  await ensureInitialViews(user.organizationId, "contacts", [
    { name: "Todos", viewType: "table" },
    { name: "Activos", viewType: "table", quick: "active" },
    { name: "Principales", viewType: "table", quick: "primary" },
    { name: "Con tickets abiertos", viewType: "table", quick: "open_tickets" },
  ]);
  const views = await listViews(user.organizationId, userId, "contacts");

  const lastViewId = await getLastViewId("contacts");
  const requestedViewId = Number(params.view);
  const activeView =
    views.find((v) => v.id === requestedViewId) ??
    (lastViewId ? views.find((v) => v.id === lastViewId) : undefined) ??
    views.find((v) => v.isDefault) ??
    views[0];

  const viewConfig = savedViewConfigSchema.parse(activeView.config);
  const quick = (params.quick as ContactQuickFilterKey | undefined) ?? (viewConfig.quick as ContactQuickFilterKey | null) ?? null;
  const search = params.q ?? viewConfig.search ?? "";
  let filters: FilterGroup | null = viewConfig.filters ?? null;
  if (params.filters) {
    const parsed = filterGroupSchema.safeParse(JSON.parse(params.filters));
    if (parsed.success) filters = parsed.data;
  }

  const fieldRegistry = await buildFieldRegistry(CONTACT_FIELDS, []);

  const conditions = [eq(contacts.organizationId, user.organizationId)];
  const filterSql = buildFilterSql(filters, fieldRegistry, "contacts", contacts.id);
  if (filterSql) conditions.push(filterSql);
  if (quick) {
    const qSql = contactQuickFilterSql(quick);
    if (qSql) conditions.push(qSql);
  }
  if (search.trim()) {
    const term = `%${search.trim()}%`;
    conditions.push(
      sql`(
        ${contacts.firstName} || ' ' || ${contacts.lastName} ilike ${term}
        or coalesce(${contacts.email}, '') ilike ${term}
        or coalesce(${contacts.phone}, '') ilike ${term}
        or coalesce(${contacts.mobile}, '') ilike ${term}
        or coalesce(${contacts.jobTitle}, '') ilike ${term}
        or ${companies.name} ilike ${term}
      )`,
    );
  }

  const rows: ContactRow[] = await db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      jobTitle: contacts.jobTitle,
      department: contacts.department,
      email: contacts.email,
      phone: contacts.phone,
      mobile: contacts.mobile,
      contactType: contacts.contactType,
      isPrimary: contacts.isPrimary,
      isActive: contacts.isActive,
      companyId: contacts.companyId,
      companyName: companies.name,
      openTickets: CONTACT_OPEN_TICKETS_SQL,
      createdAt: contacts.createdAt,
      updatedAt: contacts.updatedAt,
    })
    .from(contacts)
    .innerJoin(companies, eq(contacts.companyId, companies.id))
    .where(and(...conditions))
    .orderBy(asc(contacts.lastName))
    .limit(200);

  const companyOptions = await db
    .select({ id: companies.id, name: companies.name })
    .from(companies)
    .where(eq(companies.organizationId, user.organizationId))
    .orderBy(asc(companies.name));

  const orgUsers = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(and(eq(users.organizationId, user.organizationId), ne(users.role, "client")))
    .orderBy(asc(users.name));

  return (
    <div>
      <PageHeader
        title="Contactos"
        subtitle="Personas de contacto en cada empresa."
        action={<NewContactButton companies={companyOptions} />}
      />

      <ContactsViewContent
        views={views}
        activeViewId={activeView.id}
        currentUserId={userId}
        currentUserRole={user.role}
        orgUsers={orgUsers}
        basePath={BASE_PATH}
        rows={rows}
        fields={toPublicFields(fieldRegistry)}
        quickFilters={CONTACT_QUICK_FILTERS}
        activeQuick={quick}
        activeFilters={filters}
        activeSearch={search}
      />
    </div>
  );
}
