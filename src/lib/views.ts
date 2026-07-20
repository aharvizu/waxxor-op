import { and, asc, eq, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type DbExecutor } from "@/db";
import { itemFavorites, savedViewPreferences, savedViews, users } from "@/db/schema";
import { filterGroupSchema, type FilterGroup } from "@/lib/filters";
import { hasRole, type Role } from "@/lib/roles";

/**
 * Saved Views — the single Views Engine for the whole platform (consolidated
 * 2026-07-22: scopes, per-viewer favorite/default/order, save-state machine).
 * Every module (Tickets, Projects, Activities, Recurring, and future ones —
 * Inbox, CRM, Portal, Dashboards) consumes only the functions in this file
 * and the components in src/components/views/. No module may implement its
 * own persistence, permissions, favorites, sharing, or state handling for
 * views — that duplication is exactly what this consolidation removes.
 */

export const VIEW_TYPES = savedViews.viewType.enumValues;
export type ViewType = (typeof VIEW_TYPES)[number];
export const CONFIG_MODULES = savedViews.module.enumValues;
export type ConfigModule = (typeof CONFIG_MODULES)[number];
export const VIEW_SCOPES = savedViews.scope.enumValues;
export type ViewScope = (typeof VIEW_SCOPES)[number];

const columnConfigSchema = z.object({
  key: z.string(),
  visible: z.boolean().default(true),
  width: z.number().int().positive().nullable().default(null),
});

const kanbanConfigSchema = z.object({
  /** Field the board is grouped by (e.g. "status" or "healthStatus") — a
   * board can regroup without losing its other settings. */
  groupField: z.string().nullable().default(null),
  collapsedColumns: z.array(z.string()).default([]),
});

export const savedViewConfigSchema = z.object({
  columns: z.array(columnConfigSchema).default([]),
  groupBy: z.string().nullable().default(null),
  sortBy: z.object({ field: z.string(), direction: z.enum(["asc", "desc"]) }).nullable().default(null),
  filters: filterGroupSchema.nullable().default(null),
  /** Module-specific quick-filter key (e.g. Tickets' "mine"/"overdue") — lets
   * a seeded/saved view reuse a relative, always-current condition (like
   * "vencidos") instead of baking a stale date into `filters`. */
  quick: z.string().nullable().default(null),
  search: z.string().default(""),
  density: z.enum(["compact", "comfortable", "spacious"]).default("comfortable"),
  pageSize: z.number().int().positive().max(500).default(50),
  kanban: kanbanConfigSchema.default({ groupField: null, collapsedColumns: [] }),
});
export type SavedViewConfig = z.output<typeof savedViewConfigSchema>;

export function defaultViewConfig(): SavedViewConfig {
  return savedViewConfigSchema.parse({});
}

export type SavedViewRow = typeof savedViews.$inferSelect;
/** The shape every module and every UI component actually consumes — a view
 * row plus the requesting user's own favorite/default status, which never
 * lives on the (possibly shared) row itself. */
export type SavedView = SavedViewRow & { isFavorite: boolean; isDefault: boolean };

/* --------------------------------------------------------------------- RBAC */

/**
 * Who may edit/rename/reconfigure/delete a given view — the Motor's single
 * permission rule, never reimplemented per module. Ownership governs
 * personal/team scope; role governs organization scope; system is always
 * immutable via the UI (only ensureInitialViews may write those rows).
 */
export function canEditView(view: SavedViewRow, userId: number, role: Role): boolean {
  switch (view.scope) {
    case "system":
      return false;
    case "organization":
      return hasRole(role, ["administrator"]);
    case "team":
      return view.userId === userId || hasRole(role, ["administrator"]);
    case "personal":
      return view.userId === userId;
  }
}

/** Whether `role` may create or retarget a view into `scope`. System is
 * never a UI-creatable target (only the Motor's own seeding writes it). */
export function canManageScope(role: Role, scope: ViewScope): boolean {
  if (scope === "system") return false;
  if (scope === "organization") return hasRole(role, ["administrator"]);
  return true;
}

/* ------------------------------------------------------------------ reads */

/** Views a user can see for a module: system + org-shared (team/organization
 * stand-ins for the same org-wide audience today — see the schema comment on
 * savedViewScope) + their own personal ones. Annotated with THIS user's own
 * favorite/default/order preference, never a shared column. */
export async function listViews(
  orgId: number,
  userId: number,
  module: ConfigModule,
  executor: DbExecutor = db,
): Promise<SavedView[]> {
  const rows = await executor
    .select({
      view: savedViews,
      isFavorite: sql<boolean>`coalesce(${savedViewPreferences.isFavorite}, false)`,
      isDefault: sql<boolean>`coalesce(${savedViewPreferences.isDefault}, false)`,
      order: sql<number>`coalesce(${savedViewPreferences.sortOrder}, ${savedViews.sortOrder})`,
    })
    .from(savedViews)
    .leftJoin(
      savedViewPreferences,
      and(eq(savedViewPreferences.viewId, savedViews.id), eq(savedViewPreferences.userId, userId)),
    )
    .where(
      and(
        eq(savedViews.organizationId, orgId),
        eq(savedViews.module, module),
        or(ne(savedViews.scope, "personal"), eq(savedViews.userId, userId)),
      ),
    )
    .orderBy(
      asc(sql`coalesce(${savedViewPreferences.sortOrder}, ${savedViews.sortOrder})`),
      asc(savedViews.id),
    );
  return rows.map((r) => ({ ...r.view, isFavorite: r.isFavorite, isDefault: r.isDefault }));
}

async function loadView(executor: DbExecutor, orgId: number, id: number): Promise<SavedViewRow> {
  const [row] = await executor
    .select()
    .from(savedViews)
    .where(and(eq(savedViews.id, id), eq(savedViews.organizationId, orgId)));
  if (!row) throw new Error("La vista ya no existe.");
  return row;
}

/** Same as loadView, but rejects personal views the caller doesn't own — the
 * baseline check for any read/preference op (favorite/default/reorder). */
async function loadVisibleView(executor: DbExecutor, orgId: number, userId: number, id: number): Promise<SavedViewRow> {
  const view = await loadView(executor, orgId, id);
  if (view.scope === "personal" && view.userId !== userId) throw new Error("No tienes acceso a esta vista.");
  return view;
}

/* --------------------------------------------------------------- mutations */

async function upsertPreference(
  tx: DbExecutor,
  orgId: number,
  userId: number,
  viewId: number,
  patch: Partial<{ isFavorite: boolean; isDefault: boolean; sortOrder: number | null }>,
) {
  await tx
    .insert(savedViewPreferences)
    .values({ organizationId: orgId, userId, viewId, ...patch })
    .onConflictDoUpdate({
      target: [savedViewPreferences.userId, savedViewPreferences.viewId],
      set: { ...patch, updatedAt: new Date() },
    });
}

/** Only one default view per (user, module) — demote siblings inside the same transaction. */
async function demoteOtherDefaults(tx: DbExecutor, userId: number, module: ConfigModule, keepViewId: number) {
  const others = await tx
    .select({ viewId: savedViewPreferences.viewId })
    .from(savedViewPreferences)
    .innerJoin(savedViews, eq(savedViews.id, savedViewPreferences.viewId))
    .where(
      and(
        eq(savedViewPreferences.userId, userId),
        eq(savedViewPreferences.isDefault, true),
        eq(savedViews.module, module),
        ne(savedViewPreferences.viewId, keepViewId),
      ),
    );
  for (const o of others) {
    await tx
      .update(savedViewPreferences)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(and(eq(savedViewPreferences.userId, userId), eq(savedViewPreferences.viewId, o.viewId)));
  }
}

export async function createView(
  orgId: number,
  userId: number,
  role: Role,
  input: { module: ConfigModule; name: string; viewType: ViewType; scope?: ViewScope; config?: unknown; isDefault?: boolean },
): Promise<SavedView> {
  const scope: ViewScope = input.scope ?? "personal";
  if (!canManageScope(role, scope)) throw new Error("No tienes permiso para crear una vista con ese alcance.");
  const config = savedViewConfigSchema.parse(input.config ?? {});
  return db.transaction(async (tx) => {
    const [max] = await tx
      .select({ max: sql<number>`coalesce(max(${savedViews.sortOrder}), -1)` })
      .from(savedViews)
      .where(and(eq(savedViews.organizationId, orgId), eq(savedViews.module, input.module), eq(savedViews.scope, scope)));
    const [created] = await tx
      .insert(savedViews)
      .values({
        organizationId: orgId,
        userId,
        module: input.module,
        scope,
        name: input.name.trim() || "Nueva vista",
        viewType: input.viewType,
        config,
        sortOrder: Number(max?.max ?? -1) + 1,
      })
      .returning();
    if (input.isDefault) {
      await upsertPreference(tx, orgId, userId, created.id, { isDefault: true });
      await demoteOtherDefaults(tx, userId, input.module, created.id);
    }
    return { ...created, isFavorite: false, isDefault: input.isDefault ?? false };
  });
}

/**
 * Duplicates any *visible* view into a brand-new personal one owned by the
 * caller — the single mechanism behind both "Duplicar" and "Guardar como
 * nueva vista personal" (the state machine's escape hatch for System/Team/
 * Organization views and for editors without write access). `configOverride`
 * lets the caller save its live, unsaved in-memory config instead of the
 * source's last-saved one.
 */
export async function duplicateView(
  orgId: number,
  userId: number,
  id: number,
  opts?: { name?: string; configOverride?: unknown },
): Promise<SavedView> {
  return db.transaction(async (tx) => {
    const source = await loadVisibleView(tx, orgId, userId, id);
    const config = savedViewConfigSchema.parse(opts?.configOverride ?? source.config);
    const [max] = await tx
      .select({ max: sql<number>`coalesce(max(${savedViews.sortOrder}), -1)` })
      .from(savedViews)
      .where(and(eq(savedViews.organizationId, orgId), eq(savedViews.userId, userId), eq(savedViews.module, source.module)));
    const [created] = await tx
      .insert(savedViews)
      .values({
        organizationId: orgId,
        userId,
        module: source.module,
        scope: "personal",
        name: opts?.name?.trim() || `${source.name} (copia)`,
        viewType: source.viewType,
        config,
        sortOrder: Number(max?.max ?? -1) + 1,
      })
      .returning();
    return { ...created, isFavorite: false, isDefault: false };
  });
}

export async function renameView(orgId: number, userId: number, role: Role, id: number, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("El nombre de la vista es requerido.");
  await db.transaction(async (tx) => {
    const view = await loadView(tx, orgId, id);
    if (!canEditView(view, userId, role)) throw new Error("No tienes permiso para editar esta vista.");
    await tx.update(savedViews).set({ name: trimmed, updatedAt: new Date() }).where(eq(savedViews.id, id));
  });
}

/** Persists the live column/group/sort/filter/density/pageSize state for a view (autosave from the UI). */
export async function updateViewConfig(orgId: number, userId: number, role: Role, id: number, config: unknown): Promise<void> {
  const parsed = savedViewConfigSchema.parse(config);
  await db.transaction(async (tx) => {
    const view = await loadView(tx, orgId, id);
    if (!canEditView(view, userId, role)) throw new Error("No tienes permiso para editar esta vista.");
    await tx.update(savedViews).set({ config: parsed, updatedAt: new Date() }).where(eq(savedViews.id, id));
  });
}

/** "Compartir": retargets a view's scope. Never onto/from `system`. */
export async function setViewScope(orgId: number, userId: number, role: Role, id: number, scope: ViewScope): Promise<void> {
  if (scope === "system") throw new Error("Una vista no puede convertirse en vista del sistema.");
  await db.transaction(async (tx) => {
    const view = await loadView(tx, orgId, id);
    if (view.scope === "system") throw new Error("Las vistas del sistema no se pueden modificar.");
    if (!canEditView(view, userId, role)) throw new Error("No tienes permiso para compartir esta vista.");
    if (!canManageScope(role, scope)) throw new Error("No tienes permiso para compartir con ese alcance.");
    await tx.update(savedViews).set({ scope, updatedAt: new Date() }).where(eq(savedViews.id, id));
  });
}

/** Transfers ownership of a personal/team view. System/organization views have no single owner to transfer. */
export async function transferViewOwner(orgId: number, userId: number, role: Role, id: number, newOwnerId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const view = await loadView(tx, orgId, id);
    if (view.scope === "system" || view.scope === "organization") {
      throw new Error("Esta vista no tiene un propietario individual que transferir.");
    }
    if (!canEditView(view, userId, role)) throw new Error("No tienes permiso para cambiar el propietario.");
    const [target] = await tx.select({ id: users.id }).from(users).where(and(eq(users.id, newOwnerId), eq(users.organizationId, orgId)));
    if (!target) throw new Error("El nuevo propietario no pertenece a esta organización.");
    await tx.update(savedViews).set({ userId: newOwnerId, updatedAt: new Date() }).where(eq(savedViews.id, id));
  });
}

/** Personal preference — no edit permission required, only visibility. */
export async function toggleFavoriteView(orgId: number, userId: number, id: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const view = await loadVisibleView(tx, orgId, userId, id);
    const [existing] = await tx
      .select()
      .from(savedViewPreferences)
      .where(and(eq(savedViewPreferences.userId, userId), eq(savedViewPreferences.viewId, view.id)));
    const next = !(existing?.isFavorite ?? false);
    await upsertPreference(tx, orgId, userId, view.id, { isFavorite: next });
    return next;
  });
}

/** Personal preference — no edit permission required, only visibility. */
export async function setDefaultView(orgId: number, userId: number, id: number): Promise<void> {
  await db.transaction(async (tx) => {
    const view = await loadVisibleView(tx, orgId, userId, id);
    await upsertPreference(tx, orgId, userId, view.id, { isDefault: true });
    await demoteOtherDefaults(tx, userId, view.module, view.id);
  });
}

/** Drag-and-drop reorder: per-viewer tab position, never mutates the shared row. */
export async function reorderViews(orgId: number, userId: number, module: ConfigModule, orderedIds: number[]): Promise<void> {
  const visible = new Set((await listViews(orgId, userId, module)).map((v) => v.id));
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      if (!visible.has(orderedIds[i])) continue;
      await upsertPreference(tx, orgId, userId, orderedIds[i], { sortOrder: i });
    }
  });
}

export async function deleteView(orgId: number, userId: number, role: Role, id: number): Promise<void> {
  await db.transaction(async (tx) => {
    const view = await loadView(tx, orgId, id);
    if (view.scope === "system") throw new Error("Las vistas del sistema no se pueden eliminar.");
    if (!canEditView(view, userId, role)) throw new Error("No tienes permiso para eliminar esta vista.");
    const visible = await listViews(orgId, userId, view.module, tx);
    if (visible.length <= 1) throw new Error("No puedes eliminar la última vista del módulo.");
    await tx.delete(savedViews).where(eq(savedViews.id, id));
  });
}

/**
 * Bootstraps a module's System views the first time an organization has
 * none — org-level, not per-user, so every member of the org sees the same
 * seeded set instead of each getting a private mutable copy. Safe to call
 * on every page load: it only writes when the org truly has zero System
 * views for the module.
 */
export type InitialViewSpec = {
  name: string;
  viewType: ViewType;
  filters?: FilterGroup | null;
  quick?: string | null;
  kanbanGroupField?: string;
};
export async function ensureInitialViews(orgId: number, module: ConfigModule, specs: InitialViewSpec[]): Promise<void> {
  const [existing] = await db
    .select({ id: savedViews.id })
    .from(savedViews)
    .where(and(eq(savedViews.organizationId, orgId), eq(savedViews.module, module), eq(savedViews.scope, "system")))
    .limit(1);
  if (existing) return;
  for (let i = 0; i < specs.length; i++) {
    const spec = specs[i];
    await db.insert(savedViews).values({
      organizationId: orgId,
      userId: null,
      module,
      scope: "system",
      name: spec.name,
      viewType: spec.viewType,
      sortOrder: i,
      config: savedViewConfigSchema.parse({
        quick: spec.quick ?? null,
        filters: spec.filters ?? null,
        kanban: spec.kanbanGroupField ? { groupField: spec.kanbanGroupField, collapsedColumns: [] } : undefined,
      }),
    });
  }
}

/* ------------------------------------------------------------------- favorites */

/** Generic per-item favorite toggle, reused by every module (item_favorites is already module-agnostic). */
export async function toggleItemFavorite(orgId: number, userId: number, module: ConfigModule, entityId: number): Promise<boolean> {
  const [existing] = await db
    .select()
    .from(itemFavorites)
    .where(and(eq(itemFavorites.userId, userId), eq(itemFavorites.module, module), eq(itemFavorites.entityId, entityId)));
  if (existing) {
    await db.delete(itemFavorites).where(eq(itemFavorites.id, existing.id));
    return false;
  }
  await db.insert(itemFavorites).values({ organizationId: orgId, userId, module, entityId });
  return true;
}

export async function getFavoriteIds(orgId: number, userId: number, module: ConfigModule): Promise<number[]> {
  const rows = await db
    .select({ entityId: itemFavorites.entityId })
    .from(itemFavorites)
    .where(and(eq(itemFavorites.organizationId, orgId), eq(itemFavorites.userId, userId), eq(itemFavorites.module, module)));
  return rows.map((r) => r.entityId);
}
