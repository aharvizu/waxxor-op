import { and, eq, inArray, ne } from "drizzle-orm";
import { db, type DbExecutor } from "@/db";
import {
  ticketBillingStatuses,
  ticketPriorities,
  ticketStatuses,
  tickets,
  slaDefinitions,
  workItems,
} from "@/db/schema";
import { recordAudit } from "./audit";

/**
 * The Ticket Status / Priority / Billing Status Catalog Engine (2026-07-22
 * sprint). Three dedicated, org-scoped tables (not the generic catalog_items
 * table — these need isDefault/isSystem/semanticKey, which freeform catalogs
 * don't), sharing one CRUD/reassignment/mirror-sync engine so there aren't
 * three independently-built systems.
 *
 * The legacy `work_items.status`/`work_items.priority`/`tickets.billingStatus`
 * Postgres enum columns are never dropped: they're a mirror, always kept in
 * sync with the catalog-driven values below, because (a) Postgres enums are
 * closed sets and cannot hold an admin-created custom value, and (b)
 * `work_items.status`/`priority` are shared with Activities, which are out of
 * scope this sprint and must keep working completely unchanged. Every
 * function here that changes a ticket's status/priority/billing status also
 * updates its mirror — see syncStatusMirror/syncPriorityMirror/syncBillingMirror.
 */

export type TicketStatusRow = typeof ticketStatuses.$inferSelect;
export type TicketPriorityRow = typeof ticketPriorities.$inferSelect;
export type TicketBillingStatusRow = typeof ticketBillingStatuses.$inferSelect;

export const TICKET_STATUS_CATEGORIES = [
  "open",
  "in_progress",
  "waiting",
  "resolved",
  "closed",
  "cancelled",
] as const;
export type TicketStatusCategoryValue = (typeof TICKET_STATUS_CATEGORIES)[number];
export const TICKET_STATUS_CATEGORY_LABELS: Record<TicketStatusCategoryValue, string> = {
  open: "Abierto",
  in_progress: "En progreso",
  waiting: "En espera",
  resolved: "Resuelto",
  closed: "Cerrado",
  cancelled: "Cancelado",
};

export const TICKET_BILLING_CATEGORIES = [
  "not_billable",
  "included",
  "pending",
  "approved",
  "billed",
  "rejected",
] as const;
export type TicketBillingCategoryValue = (typeof TICKET_BILLING_CATEGORIES)[number];
export const TICKET_BILLING_CATEGORY_LABELS: Record<TicketBillingCategoryValue, string> = {
  not_billable: "No cobrable",
  included: "Incluido en contrato",
  pending: "Pendiente",
  approved: "Aprobado",
  billed: "Facturado",
  rejected: "Rechazado",
};

/* ------------------------------------------------------------------ */
/* Legacy enum mirror mapping                                          */
/* ------------------------------------------------------------------ */

type LegacyStatus = (typeof workItems.status.enumValues)[number];
type LegacyPriority = (typeof workItems.priority.enumValues)[number];
type LegacyBilling = (typeof tickets.billingStatus.enumValues)[number];

/** System rows' semanticKey → the exact legacy enum value they replace. */
const STATUS_SEMANTIC_TO_LEGACY: Record<string, LegacyStatus> = {
  NEW: "new",
  ASSIGNED: "assigned",
  IN_PROGRESS: "in_progress",
  WAITING_CUSTOMER: "waiting_customer",
  WAITING_THIRD_PARTY: "waiting_third_party",
  SCHEDULED: "scheduled",
  RESOLVED: "resolved",
  PENDING_CONFIRMATION: "pending_confirmation",
  CLOSED: "closed",
  REOPENED: "reopened",
  CANCELLED: "cancelled",
};
/** Custom rows (no semanticKey) mirror via their category's representative legacy value. */
const STATUS_CATEGORY_TO_LEGACY: Record<TicketStatusCategoryValue, LegacyStatus> = {
  open: "new",
  in_progress: "in_progress",
  waiting: "waiting_customer",
  resolved: "resolved",
  closed: "closed",
  cancelled: "cancelled",
};

export function legacyStatusFor(row: Pick<TicketStatusRow, "semanticKey" | "category">): LegacyStatus {
  return (row.semanticKey && STATUS_SEMANTIC_TO_LEGACY[row.semanticKey]) || STATUS_CATEGORY_TO_LEGACY[row.category];
}

const PRIORITY_SEMANTIC_TO_LEGACY: Record<string, LegacyPriority> = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
};
const SYSTEM_PRIORITY_LEVELS: { legacy: LegacyPriority; level: number }[] = [
  { legacy: "low", level: 1 },
  { legacy: "medium", level: 2 },
  { legacy: "high", level: 3 },
  { legacy: "critical", level: 4 },
];
/** Custom priorities mirror via the nearest system priority by severity level. */
function nearestLegacyPriority(level: number): LegacyPriority {
  let best = SYSTEM_PRIORITY_LEVELS[0];
  let bestDiff = Infinity;
  for (const p of SYSTEM_PRIORITY_LEVELS) {
    const diff = Math.abs(p.level - level);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = p;
    }
  }
  return best.legacy;
}
export function legacyPriorityFor(row: Pick<TicketPriorityRow, "semanticKey" | "level">): LegacyPriority {
  return (row.semanticKey && PRIORITY_SEMANTIC_TO_LEGACY[row.semanticKey]) || nearestLegacyPriority(row.level);
}

const BILLING_SEMANTIC_TO_LEGACY: Record<string, LegacyBilling> = {
  PENDING_REVIEW: "pending_review",
  INCLUDED_IN_CONTRACT: "included_in_contract",
  BILLABLE: "billable",
  CONTRACT_OVERAGE: "contract_overage",
  FIXED_PRICE: "fixed_price",
  NO_CHARGE: "no_charge",
  INCLUDED_IN_MONTHLY_CHARGE: "included_in_monthly_charge",
  CHARGED: "charged",
};
const BILLING_CATEGORY_TO_LEGACY: Record<TicketBillingCategoryValue, LegacyBilling> = {
  not_billable: "no_charge",
  included: "included_in_contract",
  pending: "pending_review",
  approved: "billable",
  billed: "charged",
  rejected: "no_charge",
};
export function legacyBillingFor(row: Pick<TicketBillingStatusRow, "semanticKey" | "category">): LegacyBilling {
  return (row.semanticKey && BILLING_SEMANTIC_TO_LEGACY[row.semanticKey]) || BILLING_CATEGORY_TO_LEGACY[row.category];
}

/** Applied everywhere a ticket's status/priority/billing status changes (including bulk reassignment before delete). */
export async function syncStatusMirror(tx: DbExecutor, workItemId: number, status: TicketStatusRow): Promise<void> {
  await tx.update(workItems).set({ status: legacyStatusFor(status), updatedAt: new Date() }).where(eq(workItems.id, workItemId));
}
export async function syncPriorityMirror(tx: DbExecutor, workItemId: number, priority: TicketPriorityRow): Promise<void> {
  await tx.update(workItems).set({ priority: legacyPriorityFor(priority), updatedAt: new Date() }).where(eq(workItems.id, workItemId));
}
export async function syncBillingMirror(tx: DbExecutor, ticketId: number, billing: TicketBillingStatusRow): Promise<void> {
  await tx.update(tickets).set({ billingStatus: legacyBillingFor(billing) }).where(eq(tickets.id, ticketId));
}

/* ------------------------------------------------------------------ */
/* System seed data (used by the one-off migration/backfill script)    */
/* ------------------------------------------------------------------ */

export const SYSTEM_TICKET_STATUSES = [
  { slug: "new", name: "New", color: "#3b82f6", category: "open" as const, semanticKey: "NEW", sortOrder: 0, isDefault: true },
  { slug: "assigned", name: "Assigned", color: "#8b5cf6", category: "open" as const, semanticKey: "ASSIGNED", sortOrder: 1, isDefault: false },
  { slug: "in_progress", name: "In progress", color: "#a855f7", category: "in_progress" as const, semanticKey: "IN_PROGRESS", sortOrder: 2, isDefault: false },
  { slug: "waiting_customer", name: "Waiting customer", color: "#f59e0b", category: "waiting" as const, semanticKey: "WAITING_CUSTOMER", sortOrder: 3, isDefault: false },
  { slug: "waiting_third_party", name: "Waiting third party", color: "#f59e0b", category: "waiting" as const, semanticKey: "WAITING_THIRD_PARTY", sortOrder: 4, isDefault: false },
  { slug: "scheduled", name: "Scheduled", color: "#3b82f6", category: "open" as const, semanticKey: "SCHEDULED", sortOrder: 5, isDefault: false },
  { slug: "resolved", name: "Resolved", color: "#10b981", category: "resolved" as const, semanticKey: "RESOLVED", sortOrder: 6, isDefault: false },
  { slug: "pending_confirmation", name: "Pending confirmation", color: "#f59e0b", category: "resolved" as const, semanticKey: "PENDING_CONFIRMATION", sortOrder: 7, isDefault: false },
  { slug: "closed", name: "Closed", color: "#64748b", category: "closed" as const, semanticKey: "CLOSED", sortOrder: 8, isDefault: false },
  { slug: "reopened", name: "Reopened", color: "#ef4444", category: "open" as const, semanticKey: "REOPENED", sortOrder: 9, isDefault: false },
  { slug: "cancelled", name: "Cancelled", color: "#64748b", category: "cancelled" as const, semanticKey: "CANCELLED", sortOrder: 10, isDefault: false },
];

export const SYSTEM_TICKET_PRIORITIES = [
  { slug: "low", name: "Low", color: "#64748b", level: 1, semanticKey: "LOW", sortOrder: 0, isDefault: false },
  { slug: "medium", name: "Medium", color: "#3b82f6", level: 2, semanticKey: "MEDIUM", sortOrder: 1, isDefault: true },
  { slug: "high", name: "High", color: "#f59e0b", level: 3, semanticKey: "HIGH", sortOrder: 2, isDefault: false },
  { slug: "critical", name: "Critical", color: "#ef4444", level: 4, semanticKey: "CRITICAL", sortOrder: 3, isDefault: false },
];

export const SYSTEM_TICKET_BILLING_STATUSES = [
  { slug: "pending_review", name: "Pending review", color: "#f59e0b", category: "pending" as const, semanticKey: "PENDING_REVIEW", sortOrder: 0, isDefault: true },
  { slug: "included_in_contract", name: "In contract", color: "#3b82f6", category: "included" as const, semanticKey: "INCLUDED_IN_CONTRACT", sortOrder: 1, isDefault: false },
  { slug: "billable", name: "Billable", color: "#10b981", category: "approved" as const, semanticKey: "BILLABLE", sortOrder: 2, isDefault: false },
  { slug: "contract_overage", name: "Contract overage", color: "#8b5cf6", category: "approved" as const, semanticKey: "CONTRACT_OVERAGE", sortOrder: 3, isDefault: false },
  { slug: "fixed_price", name: "Fixed price", color: "#a855f7", category: "approved" as const, semanticKey: "FIXED_PRICE", sortOrder: 4, isDefault: false },
  { slug: "no_charge", name: "No charge", color: "#64748b", category: "not_billable" as const, semanticKey: "NO_CHARGE", sortOrder: 5, isDefault: false },
  { slug: "included_in_monthly_charge", name: "Monthly charge", color: "#3b82f6", category: "included" as const, semanticKey: "INCLUDED_IN_MONTHLY_CHARGE", sortOrder: 6, isDefault: false },
  { slug: "charged", name: "Charged", color: "#10b981", category: "billed" as const, semanticKey: "CHARGED", sortOrder: 7, isDefault: false },
];

/* ------------------------------------------------------------------ */
/* Lookups                                                             */
/* ------------------------------------------------------------------ */

export async function listTicketStatuses(orgId: number, opts: { includeInactive?: boolean } = {}): Promise<TicketStatusRow[]> {
  const where = opts.includeInactive
    ? eq(ticketStatuses.organizationId, orgId)
    : and(eq(ticketStatuses.organizationId, orgId), eq(ticketStatuses.isActive, true));
  return db.select().from(ticketStatuses).where(where).orderBy(ticketStatuses.sortOrder, ticketStatuses.name);
}
export async function listTicketPriorities(orgId: number, opts: { includeInactive?: boolean } = {}): Promise<TicketPriorityRow[]> {
  const where = opts.includeInactive
    ? eq(ticketPriorities.organizationId, orgId)
    : and(eq(ticketPriorities.organizationId, orgId), eq(ticketPriorities.isActive, true));
  return db.select().from(ticketPriorities).where(where).orderBy(ticketPriorities.sortOrder, ticketPriorities.name);
}
export async function listTicketBillingStatuses(orgId: number, opts: { includeInactive?: boolean } = {}): Promise<TicketBillingStatusRow[]> {
  const where = opts.includeInactive
    ? eq(ticketBillingStatuses.organizationId, orgId)
    : and(eq(ticketBillingStatuses.organizationId, orgId), eq(ticketBillingStatuses.isActive, true));
  return db.select().from(ticketBillingStatuses).where(where).orderBy(ticketBillingStatuses.sortOrder, ticketBillingStatuses.name);
}

export async function getTicketStatus(tx: DbExecutor, orgId: number, id: number): Promise<TicketStatusRow | null> {
  const [row] = await tx.select().from(ticketStatuses).where(and(eq(ticketStatuses.id, id), eq(ticketStatuses.organizationId, orgId)));
  return row ?? null;
}
export async function getTicketPriority(tx: DbExecutor, orgId: number, id: number): Promise<TicketPriorityRow | null> {
  const [row] = await tx.select().from(ticketPriorities).where(and(eq(ticketPriorities.id, id), eq(ticketPriorities.organizationId, orgId)));
  return row ?? null;
}
export async function getTicketBillingStatus(tx: DbExecutor, orgId: number, id: number): Promise<TicketBillingStatusRow | null> {
  const [row] = await tx.select().from(ticketBillingStatuses).where(and(eq(ticketBillingStatuses.id, id), eq(ticketBillingStatuses.organizationId, orgId)));
  return row ?? null;
}

export async function getDefaultTicketStatus(tx: DbExecutor, orgId: number): Promise<TicketStatusRow | null> {
  const [row] = await tx.select().from(ticketStatuses).where(and(eq(ticketStatuses.organizationId, orgId), eq(ticketStatuses.isDefault, true)));
  return row ?? null;
}
export async function getDefaultTicketPriority(tx: DbExecutor, orgId: number): Promise<TicketPriorityRow | null> {
  const [row] = await tx.select().from(ticketPriorities).where(and(eq(ticketPriorities.organizationId, orgId), eq(ticketPriorities.isDefault, true)));
  return row ?? null;
}
export async function getDefaultTicketBillingStatus(tx: DbExecutor, orgId: number): Promise<TicketBillingStatusRow | null> {
  const [row] = await tx.select().from(ticketBillingStatuses).where(and(eq(ticketBillingStatuses.organizationId, orgId), eq(ticketBillingStatuses.isDefault, true)));
  return row ?? null;
}

export async function getTicketStatusBySemanticKey(tx: DbExecutor, orgId: number, semanticKey: string): Promise<TicketStatusRow | null> {
  const [row] = await tx.select().from(ticketStatuses).where(and(eq(ticketStatuses.organizationId, orgId), eq(ticketStatuses.semanticKey, semanticKey)));
  return row ?? null;
}

const LEGACY_TO_PRIORITY_SEMANTIC: Record<LegacyPriority, string> = {
  low: "LOW",
  medium: "MEDIUM",
  high: "HIGH",
  critical: "CRITICAL",
};
/** For callers whose contract still speaks the legacy priority enum (activity conversion, recurrences) — resolves the matching system priority row. */
export async function getTicketPriorityByLegacyValue(tx: DbExecutor, orgId: number, legacy: LegacyPriority): Promise<TicketPriorityRow | null> {
  const [row] = await tx
    .select()
    .from(ticketPriorities)
    .where(and(eq(ticketPriorities.organizationId, orgId), eq(ticketPriorities.semanticKey, LEGACY_TO_PRIORITY_SEMANTIC[legacy])));
  return row ?? null;
}

/* ------------------------------------------------------------------ */
/* Shared errors + slug generation                                     */
/* ------------------------------------------------------------------ */

export class CatalogRuleError extends Error {}

export function slugify(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "valor"
  );
}

async function uniqueSlug(tx: DbExecutor, table: typeof ticketStatuses | typeof ticketPriorities | typeof ticketBillingStatuses, orgId: number, base: string): Promise<string> {
  let slug = slugify(base);
  let n = 1;
  for (;;) {
    const [existing] = await tx
      .select({ id: table.id })
      .from(table as typeof ticketStatuses)
      .where(and(eq((table as typeof ticketStatuses).organizationId, orgId), eq((table as typeof ticketStatuses).slug, slug)));
    if (!existing) return slug;
    n += 1;
    slug = `${slugify(base)}_${n}`;
  }
}

/* ------------------------------------------------------------------ */
/* Usage counts + reassignment (shared shape across the 3 catalogs)    */
/* ------------------------------------------------------------------ */

export async function countTicketsByStatus(orgId: number, statusId: number): Promise<number> {
  const rows = await db.select({ id: tickets.id }).from(tickets).where(and(eq(tickets.organizationId, orgId), eq(tickets.statusId, statusId)));
  return rows.length;
}
export async function countTicketsByPriority(orgId: number, priorityId: number): Promise<number> {
  const rows = await db.select({ id: tickets.id }).from(tickets).where(and(eq(tickets.organizationId, orgId), eq(tickets.priorityId, priorityId)));
  return rows.length;
}
export async function countTicketsByBillingStatus(orgId: number, billingStatusId: number): Promise<number> {
  const rows = await db.select({ id: tickets.id }).from(tickets).where(and(eq(tickets.organizationId, orgId), eq(tickets.billingStatusId, billingStatusId)));
  return rows.length;
}
/** SLA definitions pinned to a priority need reassigning too — not part of the "N tickets" count shown to the user, but checked before delete. */
export async function countSlaDefinitionsByPriority(orgId: number, priorityId: number): Promise<number> {
  const rows = await db.select({ id: slaDefinitions.id }).from(slaDefinitions).where(and(eq(slaDefinitions.organizationId, orgId), eq(slaDefinitions.priorityId, priorityId)));
  return rows.length;
}

async function reassignTicketsStatus(tx: DbExecutor, orgId: number, fromId: number, target: TicketStatusRow): Promise<number> {
  const affected = await tx
    .select({ id: tickets.id, workItemId: tickets.workItemId })
    .from(tickets)
    .where(and(eq(tickets.organizationId, orgId), eq(tickets.statusId, fromId)));
  if (affected.length === 0) return 0;
  await tx.update(workItems).set({ status: legacyStatusFor(target), updatedAt: new Date() }).where(
    inArray(workItems.id, affected.map((a) => a.workItemId)),
  );
  await tx.update(tickets).set({ statusId: target.id }).where(inArray(tickets.id, affected.map((a) => a.id)));
  return affected.length;
}
async function reassignTicketsPriority(tx: DbExecutor, orgId: number, fromId: number, target: TicketPriorityRow): Promise<number> {
  const affected = await tx
    .select({ id: tickets.id, workItemId: tickets.workItemId })
    .from(tickets)
    .where(and(eq(tickets.organizationId, orgId), eq(tickets.priorityId, fromId)));
  if (affected.length > 0) {
    await tx.update(workItems).set({ priority: legacyPriorityFor(target), updatedAt: new Date() }).where(
      inArray(workItems.id, affected.map((a) => a.workItemId)),
    );
    await tx.update(tickets).set({ priorityId: target.id }).where(inArray(tickets.id, affected.map((a) => a.id)));
  }
  await tx.update(slaDefinitions).set({ priorityId: target.id, priority: legacyPriorityFor(target) }).where(
    and(eq(slaDefinitions.organizationId, orgId), eq(slaDefinitions.priorityId, fromId)),
  );
  return affected.length;
}
async function reassignTicketsBillingStatus(tx: DbExecutor, orgId: number, fromId: number, target: TicketBillingStatusRow): Promise<number> {
  const affected = await tx.select({ id: tickets.id }).from(tickets).where(and(eq(tickets.organizationId, orgId), eq(tickets.billingStatusId, fromId)));
  if (affected.length === 0) return 0;
  await tx.update(tickets).set({ billingStatusId: target.id, billingStatus: legacyBillingFor(target) }).where(
    inArray(tickets.id, affected.map((a) => a.id)),
  );
  return affected.length;
}

/* ------------------------------------------------------------------ */
/* CRUD — Ticket Statuses                                              */
/* ------------------------------------------------------------------ */

export type CatalogCreateInput = { name: string; description: string | null; color: string | null; icon: string | null };

export async function createTicketStatus(orgId: number, userId: number, input: CatalogCreateInput & { category: TicketStatusCategoryValue }): Promise<TicketStatusRow> {
  return db.transaction(async (tx) => {
    const slug = await uniqueSlug(tx, ticketStatuses, orgId, input.name);
    const rows = await tx.select().from(ticketStatuses).where(eq(ticketStatuses.organizationId, orgId));
    const maxOrder = rows.reduce((m, r) => Math.max(m, r.sortOrder), -1);
    const [created] = await tx
      .insert(ticketStatuses)
      .values({
        organizationId: orgId,
        name: input.name,
        slug,
        description: input.description,
        color: input.color,
        icon: input.icon,
        category: input.category,
        semanticKey: null,
        sortOrder: maxOrder + 1,
        createdById: userId,
      })
      .returning();
    await recordAudit(tx, { organizationId: orgId, userId, entityType: "ticket_status", entityId: created.id, action: "create", metadata: { values: created } });
    return created;
  });
}

export async function updateTicketStatus(
  orgId: number,
  userId: number,
  id: number,
  patch: CatalogCreateInput & { category?: TicketStatusCategoryValue },
): Promise<TicketStatusRow> {
  return db.transaction(async (tx) => {
    const before = await getTicketStatus(tx, orgId, id);
    if (!before) throw new CatalogRuleError("El estado ya no existe.");
    const [updated] = await tx
      .update(ticketStatuses)
      .set({
        name: patch.name,
        description: patch.description,
        color: patch.color,
        icon: patch.icon,
        category: patch.category ?? before.category,
        updatedAt: new Date(),
      })
      .where(eq(ticketStatuses.id, id))
      .returning();
    await recordAudit(tx, { organizationId: orgId, userId, entityType: "ticket_status", entityId: id, action: "update", field: "name", oldValue: before.name, newValue: updated.name });
    return updated;
  });
}

async function assertNotLastActive(tx: DbExecutor, orgId: number, table: typeof ticketStatuses, excludeId: number): Promise<void> {
  const rows = await tx.select({ id: table.id, isActive: table.isActive }).from(table).where(and(eq(table.organizationId, orgId), eq(table.isActive, true), ne(table.id, excludeId)));
  if (rows.length === 0) throw new CatalogRuleError("No puedes desactivar o eliminar el único valor activo de este catálogo.");
}

export async function toggleTicketStatus(orgId: number, userId: number, id: number): Promise<TicketStatusRow> {
  return db.transaction(async (tx) => {
    const before = await getTicketStatus(tx, orgId, id);
    if (!before) throw new CatalogRuleError("El estado ya no existe.");
    const next = !before.isActive;
    if (!next) {
      await assertNotLastActive(tx, orgId, ticketStatuses, id);
      if (before.isDefault) throw new CatalogRuleError("Define otro valor predeterminado antes de desactivar este.");
    }
    const [updated] = await tx.update(ticketStatuses).set({ isActive: next, updatedAt: new Date() }).where(eq(ticketStatuses.id, id)).returning();
    await recordAudit(tx, { organizationId: orgId, userId, entityType: "ticket_status", entityId: id, action: "update", field: "isActive", oldValue: String(before.isActive), newValue: String(next) });
    return updated;
  });
}

export async function setDefaultTicketStatus(orgId: number, userId: number, id: number): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await getTicketStatus(tx, orgId, id);
    if (!row) throw new CatalogRuleError("El estado ya no existe.");
    if (!row.isActive) throw new CatalogRuleError("No puedes usar un estado inactivo como predeterminado.");
    await tx.update(ticketStatuses).set({ isDefault: false, updatedAt: new Date() }).where(and(eq(ticketStatuses.organizationId, orgId), eq(ticketStatuses.isDefault, true)));
    await tx.update(ticketStatuses).set({ isDefault: true, updatedAt: new Date() }).where(eq(ticketStatuses.id, id));
    await recordAudit(tx, { organizationId: orgId, userId, entityType: "ticket_status", entityId: id, action: "update", field: "isDefault", newValue: "true" });
  });
}

export async function reorderTicketStatuses(orgId: number, orderedIds: number[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.update(ticketStatuses).set({ sortOrder: i, updatedAt: new Date() }).where(and(eq(ticketStatuses.id, orderedIds[i]), eq(ticketStatuses.organizationId, orgId)));
    }
  });
}

/** Always produces a custom (non-system, non-default) row — duplicating a system status yields an editable copy, never a second system row. */
export async function duplicateTicketStatus(orgId: number, userId: number, id: number): Promise<TicketStatusRow> {
  return db.transaction(async (tx) => {
    const source = await getTicketStatus(tx, orgId, id);
    if (!source) throw new CatalogRuleError("El estado ya no existe.");
    const name = `${source.name} (copia)`;
    const slug = await uniqueSlug(tx, ticketStatuses, orgId, name);
    const rows = await tx.select().from(ticketStatuses).where(eq(ticketStatuses.organizationId, orgId));
    const maxOrder = rows.reduce((m, r) => Math.max(m, r.sortOrder), -1);
    const [created] = await tx
      .insert(ticketStatuses)
      .values({
        organizationId: orgId,
        name,
        slug,
        description: source.description,
        color: source.color,
        icon: source.icon,
        category: source.category,
        semanticKey: null,
        sortOrder: maxOrder + 1,
        createdById: userId,
      })
      .returning();
    await recordAudit(tx, { organizationId: orgId, userId, entityType: "ticket_status", entityId: created.id, action: "create", metadata: { values: created, duplicatedFrom: id } });
    return created;
  });
}

export async function deleteTicketStatus(orgId: number, userId: number, id: number, reassignToId: number | null): Promise<{ reassigned: number }> {
  return db.transaction(async (tx) => {
    const before = await getTicketStatus(tx, orgId, id);
    if (!before) throw new CatalogRuleError("El estado ya no existe.");
    if (before.isSystem) throw new CatalogRuleError("Los estados del sistema no se pueden eliminar. Puedes desactivarlos.");
    if (before.isDefault) throw new CatalogRuleError("Define otro valor predeterminado antes de eliminar este.");
    await assertNotLastActive(tx, orgId, ticketStatuses, id);

    const usage = await countTicketsByStatus(orgId, id);
    let reassigned = 0;
    if (usage > 0) {
      if (!reassignToId) throw new CatalogRuleError(`Este estado está siendo utilizado por ${usage} ticket(s). Selecciona a dónde reasignarlos.`);
      const target = await getTicketStatus(tx, orgId, reassignToId);
      if (!target) throw new CatalogRuleError("El estado destino ya no existe.");
      reassigned = await reassignTicketsStatus(tx, orgId, id, target);
    }
    await tx.delete(ticketStatuses).where(eq(ticketStatuses.id, id));
    await recordAudit(tx, { organizationId: orgId, userId, entityType: "ticket_status", entityId: id, action: "delete", metadata: { values: before, reassignedTo: reassignToId, reassignedCount: reassigned } });
    return { reassigned };
  });
}

/* ------------------------------------------------------------------ */
/* CRUD — Ticket Priorities                                            */
/* ------------------------------------------------------------------ */

export async function createTicketPriority(orgId: number, userId: number, input: CatalogCreateInput & { level: number }): Promise<TicketPriorityRow> {
  return db.transaction(async (tx) => {
    const slug = await uniqueSlug(tx, ticketPriorities, orgId, input.name);
    const rows = await tx.select().from(ticketPriorities).where(eq(ticketPriorities.organizationId, orgId));
    const maxOrder = rows.reduce((m, r) => Math.max(m, r.sortOrder), -1);
    const [created] = await tx
      .insert(ticketPriorities)
      .values({
        organizationId: orgId,
        name: input.name,
        slug,
        description: input.description,
        color: input.color,
        icon: input.icon,
        level: input.level,
        semanticKey: null,
        sortOrder: maxOrder + 1,
        createdById: userId,
      })
      .returning();
    await recordAudit(tx, { organizationId: orgId, userId, entityType: "ticket_priority", entityId: created.id, action: "create", metadata: { values: created } });
    return created;
  });
}

export async function updateTicketPriority(orgId: number, userId: number, id: number, patch: CatalogCreateInput & { level?: number }): Promise<TicketPriorityRow> {
  return db.transaction(async (tx) => {
    const before = await getTicketPriority(tx, orgId, id);
    if (!before) throw new CatalogRuleError("La prioridad ya no existe.");
    const [updated] = await tx
      .update(ticketPriorities)
      .set({
        name: patch.name,
        description: patch.description,
        color: patch.color,
        icon: patch.icon,
        level: patch.level ?? before.level,
        updatedAt: new Date(),
      })
      .where(eq(ticketPriorities.id, id))
      .returning();
    await recordAudit(tx, { organizationId: orgId, userId, entityType: "ticket_priority", entityId: id, action: "update", field: "name", oldValue: before.name, newValue: updated.name });
    return updated;
  });
}

export async function toggleTicketPriority(orgId: number, userId: number, id: number): Promise<TicketPriorityRow> {
  return db.transaction(async (tx) => {
    const before = await getTicketPriority(tx, orgId, id);
    if (!before) throw new CatalogRuleError("La prioridad ya no existe.");
    const next = !before.isActive;
    if (!next) {
      await assertNotLastActive(tx, orgId, ticketPriorities as unknown as typeof ticketStatuses, id);
      if (before.isDefault) throw new CatalogRuleError("Define otra prioridad predeterminada antes de desactivar esta.");
    }
    const [updated] = await tx.update(ticketPriorities).set({ isActive: next, updatedAt: new Date() }).where(eq(ticketPriorities.id, id)).returning();
    await recordAudit(tx, { organizationId: orgId, userId, entityType: "ticket_priority", entityId: id, action: "update", field: "isActive", oldValue: String(before.isActive), newValue: String(next) });
    return updated;
  });
}

export async function setDefaultTicketPriority(orgId: number, userId: number, id: number): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await getTicketPriority(tx, orgId, id);
    if (!row) throw new CatalogRuleError("La prioridad ya no existe.");
    if (!row.isActive) throw new CatalogRuleError("No puedes usar una prioridad inactiva como predeterminada.");
    await tx.update(ticketPriorities).set({ isDefault: false, updatedAt: new Date() }).where(and(eq(ticketPriorities.organizationId, orgId), eq(ticketPriorities.isDefault, true)));
    await tx.update(ticketPriorities).set({ isDefault: true, updatedAt: new Date() }).where(eq(ticketPriorities.id, id));
    await recordAudit(tx, { organizationId: orgId, userId, entityType: "ticket_priority", entityId: id, action: "update", field: "isDefault", newValue: "true" });
  });
}

export async function reorderTicketPriorities(orgId: number, orderedIds: number[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.update(ticketPriorities).set({ sortOrder: i, updatedAt: new Date() }).where(and(eq(ticketPriorities.id, orderedIds[i]), eq(ticketPriorities.organizationId, orgId)));
    }
  });
}

export async function duplicateTicketPriority(orgId: number, userId: number, id: number): Promise<TicketPriorityRow> {
  return db.transaction(async (tx) => {
    const source = await getTicketPriority(tx, orgId, id);
    if (!source) throw new CatalogRuleError("La prioridad ya no existe.");
    const name = `${source.name} (copia)`;
    const slug = await uniqueSlug(tx, ticketPriorities, orgId, name);
    const rows = await tx.select().from(ticketPriorities).where(eq(ticketPriorities.organizationId, orgId));
    const maxOrder = rows.reduce((m, r) => Math.max(m, r.sortOrder), -1);
    const [created] = await tx
      .insert(ticketPriorities)
      .values({
        organizationId: orgId,
        name,
        slug,
        description: source.description,
        color: source.color,
        icon: source.icon,
        level: source.level,
        semanticKey: null,
        sortOrder: maxOrder + 1,
        createdById: userId,
      })
      .returning();
    await recordAudit(tx, { organizationId: orgId, userId, entityType: "ticket_priority", entityId: created.id, action: "create", metadata: { values: created, duplicatedFrom: id } });
    return created;
  });
}

export async function deleteTicketPriority(orgId: number, userId: number, id: number, reassignToId: number | null): Promise<{ reassigned: number }> {
  return db.transaction(async (tx) => {
    const before = await getTicketPriority(tx, orgId, id);
    if (!before) throw new CatalogRuleError("La prioridad ya no existe.");
    if (before.isSystem) throw new CatalogRuleError("Las prioridades del sistema no se pueden eliminar. Puedes desactivarlas.");
    if (before.isDefault) throw new CatalogRuleError("Define otra prioridad predeterminada antes de eliminar esta.");
    await assertNotLastActive(tx, orgId, ticketPriorities as unknown as typeof ticketStatuses, id);

    const usage = await countTicketsByPriority(orgId, id);
    const slaUsage = await countSlaDefinitionsByPriority(orgId, id);
    let reassigned = 0;
    if (usage > 0 || slaUsage > 0) {
      if (!reassignToId) {
        throw new CatalogRuleError(
          `Esta prioridad está siendo utilizada por ${usage} ticket(s)${slaUsage > 0 ? ` y ${slaUsage} regla(s) de SLA` : ""}. Selecciona a dónde reasignarlos.`,
        );
      }
      const target = await getTicketPriority(tx, orgId, reassignToId);
      if (!target) throw new CatalogRuleError("La prioridad destino ya no existe.");
      reassigned = await reassignTicketsPriority(tx, orgId, id, target);
    }
    await tx.delete(ticketPriorities).where(eq(ticketPriorities.id, id));
    await recordAudit(tx, { organizationId: orgId, userId, entityType: "ticket_priority", entityId: id, action: "delete", metadata: { values: before, reassignedTo: reassignToId, reassignedCount: reassigned } });
    return { reassigned };
  });
}

/* ------------------------------------------------------------------ */
/* CRUD — Ticket Billing Statuses                                      */
/* ------------------------------------------------------------------ */

export async function createTicketBillingStatus(orgId: number, userId: number, input: CatalogCreateInput & { category: TicketBillingCategoryValue }): Promise<TicketBillingStatusRow> {
  return db.transaction(async (tx) => {
    const slug = await uniqueSlug(tx, ticketBillingStatuses, orgId, input.name);
    const rows = await tx.select().from(ticketBillingStatuses).where(eq(ticketBillingStatuses.organizationId, orgId));
    const maxOrder = rows.reduce((m, r) => Math.max(m, r.sortOrder), -1);
    const [created] = await tx
      .insert(ticketBillingStatuses)
      .values({
        organizationId: orgId,
        name: input.name,
        slug,
        description: input.description,
        color: input.color,
        icon: input.icon,
        category: input.category,
        semanticKey: null,
        sortOrder: maxOrder + 1,
        createdById: userId,
      })
      .returning();
    await recordAudit(tx, { organizationId: orgId, userId, entityType: "ticket_billing_status", entityId: created.id, action: "create", metadata: { values: created } });
    return created;
  });
}

export async function updateTicketBillingStatus(
  orgId: number,
  userId: number,
  id: number,
  patch: CatalogCreateInput & { category?: TicketBillingCategoryValue },
): Promise<TicketBillingStatusRow> {
  return db.transaction(async (tx) => {
    const before = await getTicketBillingStatus(tx, orgId, id);
    if (!before) throw new CatalogRuleError("El estatus de cobro ya no existe.");
    const [updated] = await tx
      .update(ticketBillingStatuses)
      .set({
        name: patch.name,
        description: patch.description,
        color: patch.color,
        icon: patch.icon,
        category: patch.category ?? before.category,
        updatedAt: new Date(),
      })
      .where(eq(ticketBillingStatuses.id, id))
      .returning();
    await recordAudit(tx, { organizationId: orgId, userId, entityType: "ticket_billing_status", entityId: id, action: "update", field: "name", oldValue: before.name, newValue: updated.name });
    return updated;
  });
}

export async function toggleTicketBillingStatus(orgId: number, userId: number, id: number): Promise<TicketBillingStatusRow> {
  return db.transaction(async (tx) => {
    const before = await getTicketBillingStatus(tx, orgId, id);
    if (!before) throw new CatalogRuleError("El estatus de cobro ya no existe.");
    const next = !before.isActive;
    if (!next) {
      await assertNotLastActive(tx, orgId, ticketBillingStatuses as unknown as typeof ticketStatuses, id);
      if (before.isDefault) throw new CatalogRuleError("Define otro estatus de cobro predeterminado antes de desactivar este.");
    }
    const [updated] = await tx.update(ticketBillingStatuses).set({ isActive: next, updatedAt: new Date() }).where(eq(ticketBillingStatuses.id, id)).returning();
    await recordAudit(tx, { organizationId: orgId, userId, entityType: "ticket_billing_status", entityId: id, action: "update", field: "isActive", oldValue: String(before.isActive), newValue: String(next) });
    return updated;
  });
}

export async function setDefaultTicketBillingStatus(orgId: number, userId: number, id: number): Promise<void> {
  await db.transaction(async (tx) => {
    const row = await getTicketBillingStatus(tx, orgId, id);
    if (!row) throw new CatalogRuleError("El estatus de cobro ya no existe.");
    if (!row.isActive) throw new CatalogRuleError("No puedes usar un estatus de cobro inactivo como predeterminado.");
    await tx.update(ticketBillingStatuses).set({ isDefault: false, updatedAt: new Date() }).where(and(eq(ticketBillingStatuses.organizationId, orgId), eq(ticketBillingStatuses.isDefault, true)));
    await tx.update(ticketBillingStatuses).set({ isDefault: true, updatedAt: new Date() }).where(eq(ticketBillingStatuses.id, id));
    await recordAudit(tx, { organizationId: orgId, userId, entityType: "ticket_billing_status", entityId: id, action: "update", field: "isDefault", newValue: "true" });
  });
}

export async function reorderTicketBillingStatuses(orgId: number, orderedIds: number[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx.update(ticketBillingStatuses).set({ sortOrder: i, updatedAt: new Date() }).where(and(eq(ticketBillingStatuses.id, orderedIds[i]), eq(ticketBillingStatuses.organizationId, orgId)));
    }
  });
}

export async function duplicateTicketBillingStatus(orgId: number, userId: number, id: number): Promise<TicketBillingStatusRow> {
  return db.transaction(async (tx) => {
    const source = await getTicketBillingStatus(tx, orgId, id);
    if (!source) throw new CatalogRuleError("El estatus de cobro ya no existe.");
    const name = `${source.name} (copia)`;
    const slug = await uniqueSlug(tx, ticketBillingStatuses, orgId, name);
    const rows = await tx.select().from(ticketBillingStatuses).where(eq(ticketBillingStatuses.organizationId, orgId));
    const maxOrder = rows.reduce((m, r) => Math.max(m, r.sortOrder), -1);
    const [created] = await tx
      .insert(ticketBillingStatuses)
      .values({
        organizationId: orgId,
        name,
        slug,
        description: source.description,
        color: source.color,
        icon: source.icon,
        category: source.category,
        semanticKey: null,
        sortOrder: maxOrder + 1,
        createdById: userId,
      })
      .returning();
    await recordAudit(tx, { organizationId: orgId, userId, entityType: "ticket_billing_status", entityId: created.id, action: "create", metadata: { values: created, duplicatedFrom: id } });
    return created;
  });
}

export async function deleteTicketBillingStatus(orgId: number, userId: number, id: number, reassignToId: number | null): Promise<{ reassigned: number }> {
  return db.transaction(async (tx) => {
    const before = await getTicketBillingStatus(tx, orgId, id);
    if (!before) throw new CatalogRuleError("El estatus de cobro ya no existe.");
    if (before.isSystem) throw new CatalogRuleError("Los estatus de cobro del sistema no se pueden eliminar. Puedes desactivarlos.");
    if (before.isDefault) throw new CatalogRuleError("Define otro estatus de cobro predeterminado antes de eliminar este.");
    await assertNotLastActive(tx, orgId, ticketBillingStatuses as unknown as typeof ticketStatuses, id);

    const usage = await countTicketsByBillingStatus(orgId, id);
    let reassigned = 0;
    if (usage > 0) {
      if (!reassignToId) throw new CatalogRuleError(`Este estatus de cobro está siendo utilizado por ${usage} ticket(s). Selecciona a dónde reasignarlos.`);
      const target = await getTicketBillingStatus(tx, orgId, reassignToId);
      if (!target) throw new CatalogRuleError("El estatus de cobro destino ya no existe.");
      reassigned = await reassignTicketsBillingStatus(tx, orgId, id, target);
    }
    await tx.delete(ticketBillingStatuses).where(eq(ticketBillingStatuses.id, id));
    await recordAudit(tx, { organizationId: orgId, userId, entityType: "ticket_billing_status", entityId: id, action: "delete", metadata: { values: before, reassignedTo: reassignToId, reassignedCount: reassigned } });
    return { reassigned };
  });
}
