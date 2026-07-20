import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

/**
 * DB-level invariants for Configuración Dinámica: Vistas, Filtros, Campos
 * Personalizados (server actions/UI are exercised manually — see
 * docs/features/dynamic-configuration.md):
 *   1. custom field definition CRUD (create/update/reorder/archive);
 *   2. custom field values round-trip and validate per type;
 *   3. deleting a field with captured values is blocked (archive instead);
 *   4. saved views CRUD (create/duplicate/rename/favorite/share/reorder);
 *   5. only one default view per (user, module) — setDefaultView demotes siblings;
 *   6. catalog style overrides merge over the hardcoded fallback, with
 *      values the org never customized falling back untouched;
 *   7. the AND/OR filter builder produces a working SQL predicate;
 *   8. organization isolation for views and custom fields.
 * Cleanup is scoped by exact ID — NEVER by organization_id (2026-07-20
 * incident: a blanket-scoped cleanup in verify-sla.ts once wiped real
 * seeded tickets/audit_logs — see that script's header comment).
 */

async function main() {
  const { and, eq } = await import("drizzle-orm");
  const { neon } = await import("@neondatabase/serverless");
  const sqlHttp = neon(process.env.DATABASE_URL!);
  const { db } = await import("../src/db");
  const { catalogItems, companies, organizations, savedViews, tickets, users, workItems } = await import("../src/db/schema");
  const {
    createFieldDefinition,
    deleteFieldDefinition,
    FieldInUseError,
    getFieldDefinitions,
    getValuesForEntity,
    reorderFieldDefinitions,
    setValues,
    toggleFieldActive,
    updateFieldDefinition,
    FieldValidationError,
  } = await import("../src/lib/custom-fields");
  const { buildFilterSql, TICKET_FIELDS } = await import("../src/lib/filters");
  const { getStyledMeta } = await import("../src/lib/catalog-styles");
  const {
    createView,
    deleteView,
    duplicateView,
    ensureInitialViews,
    listViews,
    renameView,
    reorderViews,
    setDefaultView,
    setViewScope,
    toggleFavoriteView,
  } = await import("../src/lib/views");
  const { createWorkItem } = await import("../src/lib/work-items");

  let failures = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    console.log(`${name}: ${ok ? "PASS" : `FAIL ${detail}`}`);
    if (!ok) failures++;
  };

  const [org] = await sqlHttp`select id from organizations where slug = 'watson'`;
  const orgId = org.id as number;
  const [u] = await sqlHttp`select id from users where organization_id = ${orgId} limit 1`;
  const userId = u.id as number;

  // 2026-07-23: an earlier run left 3 of these orgs behind in the real
  // database because a check failure partway through skipped the cleanup
  // section entirely. try/finally below guarantees this row is always
  // removed, even if a later assertion throws.
  const [otherOrg] = await db
    .insert(organizations)
    .values({ name: "DynConfig Verify Other Org", slug: `dynconfig-verify-other-${Date.now()}` })
    .returning({ id: organizations.id });

  try {

  // ------------------------------------------------------- custom fields
  const field = await createFieldDefinition(orgId, userId, {
    module: "tickets",
    key: "verify_priority_reason",
    name: "VERIFY Priority reason",
    fieldType: "select",
    required: true,
    visible: true,
    editable: true,
    options: [{ value: "customer", label: "Customer" }, { value: "internal", label: "Internal" }],
  });
  check("custom field created", field.id > 0);

  const defs = await getFieldDefinitions(orgId, "tickets");
  check("field appears in module registry", defs.some((f) => f.id === field.id));

  await updateFieldDefinition(orgId, userId, field.id, { name: "VERIFY Priority reason (renamed)" });
  const [afterUpdate] = (await getFieldDefinitions(orgId, "tickets")).filter((f) => f.id === field.id);
  check("field update persists", afterUpdate.name === "VERIFY Priority reason (renamed)");

  const field2 = await createFieldDefinition(orgId, userId, {
    module: "tickets",
    key: "verify_notes",
    name: "VERIFY Notes",
    fieldType: "text",
    required: false,
    visible: true,
    editable: true,
  });
  await reorderFieldDefinitions(orgId, "tickets", [field2.id, field.id]);
  const reordered = await getFieldDefinitions(orgId, "tickets");
  const idx2 = reordered.findIndex((f) => f.id === field2.id);
  const idx1 = reordered.findIndex((f) => f.id === field.id);
  check("reorder persists (field2 before field1)", idx2 < idx1 && idx2 !== -1 && idx1 !== -1);

  const nowActive = await toggleFieldActive(orgId, userId, field2.id);
  check("toggle active flips to archived", nowActive === false);
  await toggleFieldActive(orgId, userId, field2.id); // restore for the delete-blocked check below

  // ------------------------------------------------------------- values
  const [company] = await db.insert(companies).values({ organizationId: orgId, name: "VERIFY DynConfig Co" }).returning();
  const sessionUser = { id: String(userId), organizationId: orgId, role: "superadmin" as const };
  const item = await db.transaction((tx) =>
    createWorkItem(tx, sessionUser, { type: "ticket", title: "VERIFY dynconfig ticket", priority: "high", companyId: company.id }),
  );
  const [ticket] = await db
    .insert(tickets)
    .values({ organizationId: orgId, workItemId: item.id, folio: `VERIFY-DYNCFG-${Date.now()}` })
    .returning({ id: tickets.id });

  // field2 (verify_notes) is deliberately left valueless — the "hard delete
  // allowed" check below needs a field that was genuinely never used.
  await setValues(orgId, "tickets", ticket.id, { verify_priority_reason: "customer" });
  const values = await getValuesForEntity(orgId, "tickets", ticket.id);
  check("values round-trip", values.verify_priority_reason === "customer");

  let requiredRejected = false;
  try {
    await setValues(orgId, "tickets", ticket.id, { verify_priority_reason: null });
  } catch (err) {
    requiredRejected = err instanceof FieldValidationError;
  }
  check("required field rejects null", requiredRejected);

  let invalidOptionRejected = false;
  try {
    await setValues(orgId, "tickets", ticket.id, { verify_priority_reason: "not_a_real_option" });
  } catch (err) {
    invalidOptionRejected = err instanceof FieldValidationError;
  }
  check("select field rejects an unknown option", invalidOptionRejected);

  let deleteBlocked = false;
  try {
    await deleteFieldDefinition(orgId, userId, field.id);
  } catch (err) {
    deleteBlocked = err instanceof FieldInUseError;
  }
  check("delete blocked while the field has captured values", deleteBlocked);
  await deleteFieldDefinition(orgId, userId, field2.id); // never had values -> hard delete allowed
  const afterDelete = await getFieldDefinitions(orgId, "tickets");
  check("field with no values was hard-deleted", !afterDelete.some((f) => f.id === field2.id));

  // ------------------------------------------------------------- filters
  const registry = { ...TICKET_FIELDS };
  const filterSql = buildFilterSql({ logic: "AND", conditions: [{ field: "companyId", operator: "eq", value: company.id }] }, registry, "tickets", tickets.id);
  const filteredRows = filterSql
    ? await db.select({ id: tickets.id }).from(tickets).innerJoin(workItems, eq(tickets.workItemId, workItems.id)).where(filterSql)
    : [];
  check("AND/OR filter builder produces a working predicate", filteredRows.some((r) => r.id === ticket.id));

  // --------------------------------------------------------------- views
  const adminRole = "superadmin" as const;
  const view = await createView(orgId, userId, adminRole, { module: "tickets", name: "VERIFY view A", viewType: "table" });
  check("view created", view.id > 0);
  check("view created as personal by default", view.scope === "personal");
  const dup = await duplicateView(orgId, userId, view.id, { name: "VERIFY view A copy" });
  check("view duplicated with a new id", dup.id !== view.id);
  const [dupRowAtCreation] = await db.select().from(savedViews).where(eq(savedViews.id, dup.id));
  const dupSortOrderAtCreation = dupRowAtCreation.sortOrder;
  await renameView(orgId, userId, adminRole, view.id, "VERIFY view A renamed");
  const [renamed] = (await listViews(orgId, userId, "tickets")).filter((v) => v.id === view.id);
  check("view rename persists", renamed.name === "VERIFY view A renamed");

  const fav = await toggleFavoriteView(orgId, userId, view.id);
  check("favorite toggles on", fav === true);
  await setViewScope(orgId, userId, adminRole, view.id, "team");
  const [sharedRow] = (await listViews(orgId, userId, "tickets")).filter((v) => v.id === view.id);
  check("share (team scope) persists", sharedRow.scope === "team");

  await setDefaultView(orgId, userId, view.id);
  await setDefaultView(orgId, userId, dup.id);
  const afterDefaults = await listViews(orgId, userId, "tickets");
  const defaultCount = afterDefaults.filter((v) => v.isDefault && (v.id === view.id || v.id === dup.id)).length;
  check("only one default view survives (siblings demoted)", defaultCount === 1);

  await reorderViews(orgId, userId, "tickets", [dup.id, view.id]);
  const reorderedViews = await listViews(orgId, userId, "tickets");
  const dupOrder = reorderedViews.findIndex((v) => v.id === dup.id);
  const viewOrder = reorderedViews.findIndex((v) => v.id === view.id);
  check("reorder persists (dup before view)", dupOrder !== -1 && viewOrder !== -1 && dupOrder < viewOrder);
  const [dupRowRaw] = await db.select().from(savedViews).where(eq(savedViews.id, dup.id));
  check(
    "reorder is per-viewer (preferences), not a mutation of the shared row itself",
    dupRowRaw.sortOrder === dupSortOrderAtCreation,
  );

  // ------------------------------------------------------- scopes & RBAC
  const [technicianUser] = await db
    .insert(users)
    .values({ organizationId: orgId, name: "VERIFY Technician", email: `verify-technician-${Date.now()}@watson.test`, role: "technician", passwordHash: "x" })
    .returning({ id: users.id });

  let orgScopeBlocked = false;
  try {
    await createView(orgId, technicianUser.id, "technician", { module: "tickets", name: "VERIFY org view (should fail)", viewType: "table", scope: "organization" });
  } catch {
    orgScopeBlocked = true;
  }
  check("non-admin cannot create an organization-scope view", orgScopeBlocked);

  const orgView = await createView(orgId, userId, adminRole, { module: "tickets", name: "VERIFY org view", viewType: "table", scope: "organization" });
  check("admin can create an organization-scope view", orgView.scope === "organization");
  const visibleToTechnician = await listViews(orgId, technicianUser.id, "tickets");
  check("organization-scope view is visible to every org member", visibleToTechnician.some((v) => v.id === orgView.id));

  let systemDeleteBlocked = false;
  await ensureInitialViews(orgId, "tickets", [{ name: "VERIFY System View", viewType: "table" }]);
  const withSystem = await listViews(orgId, userId, "tickets");
  const systemView = withSystem.find((v) => v.scope === "system");
  if (systemView) {
    try {
      await deleteView(orgId, userId, adminRole, systemView.id);
    } catch {
      systemDeleteBlocked = true;
    }
  }
  check("a System view can never be deleted, even by an admin", systemView !== undefined && systemDeleteBlocked);

  // "knowledge" is never wired to ensureInitialViews (out of scope for the
  // Views Engine rollout), so it has no System views — guaranteeing this
  // technician's only *visible* view for the module is the one inserted
  // below, regardless of what earlier runs/manual testing seeded elsewhere.
  let lastViewBlocked = false;
  const [onlyView] = await db
    .insert(savedViews)
    .values({ organizationId: orgId, userId: technicianUser.id, module: "knowledge", scope: "personal", name: "VERIFY only view", viewType: "table", config: {} })
    .returning();
  try {
    await deleteView(orgId, technicianUser.id, "technician", onlyView.id);
  } catch {
    lastViewBlocked = true;
  }
  check("the last remaining view for a module cannot be deleted", lastViewBlocked);
  await db.delete(savedViews).where(eq(savedViews.id, onlyView.id));

  await deleteView(orgId, userId, adminRole, orgView.id);
  if (systemView) await db.delete(savedViews).where(eq(savedViews.id, systemView.id));
  await db.delete(users).where(eq(users.id, technicianUser.id));

  // -------------------------------------------------------- catalog styles
  const fallback = { new: { label: "New", tone: "blue" as const }, closed: { label: "Closed", tone: "slate" as const } };
  const beforeOverride = await getStyledMeta(orgId, "verify_status_style", fallback);
  check("no override -> exact fallback label", beforeOverride.new.label === "New" && beforeOverride.closed.label === "Closed");

  const [styleRow] = await db
    .insert(catalogItems)
    .values({ organizationId: orgId, kind: "verify_status_style", name: "new", color: "green", config: { label: "Nuevo (custom)" } })
    .returning();
  const afterOverride = await getStyledMeta(orgId, "verify_status_style", fallback);
  check("override merges label+tone, untouched value keeps fallback", afterOverride.new.label === "Nuevo (custom)" && afterOverride.new.tone === "green" && afterOverride.closed.label === "Closed");

  // -------------------------------------------------------------- isolation
  const otherOrgViews = await listViews(otherOrg.id, userId, "tickets");
  check("another org sees no views for a user id that only exists in ours", otherOrgViews.length === 0);
  const otherOrgFields = await getFieldDefinitions(otherOrg.id, "tickets");
  check("another org sees no custom fields", otherOrgFields.length === 0);

  // ----------------------------------------------------------------------
  // cleanup — every delete below is scoped by exact id/company, never by
  // organization_id (see header comment).
  await deleteView(orgId, userId, adminRole, dup.id);
  await deleteView(orgId, userId, adminRole, view.id);
  // field.id still has captured values on purpose (that's what the in-use
  // guard check above needs) — clear the value rows directly, then the
  // definition, bypassing deleteFieldDefinition's guard (this is cleanup,
  // not a business-rule exercise).
  await sqlHttp`delete from custom_field_values where field_id = ${field.id}`;
  await db.delete(tickets).where(eq(tickets.id, ticket.id));
  await db.delete(workItems).where(eq(workItems.id, item.id));
  await db.delete(companies).where(eq(companies.id, company.id));
  await sqlHttp`delete from custom_field_definitions where id = ${field.id}`;
  await db.delete(catalogItems).where(and(eq(catalogItems.id, styleRow.id)));
  await db.delete(organizations).where(eq(organizations.id, otherOrg.id));
  } catch (err) {
    // Best-effort: whatever else was mid-flight, this stray org must never
    // survive the run — it has no other rows attached to it, so a plain
    // delete is always safe.
    await db.delete(organizations).where(eq(organizations.id, otherOrg.id)).catch(() => {});
    throw err;
  }

  if (failures > 0) process.exit(1);
  console.log("\nAll checks passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
