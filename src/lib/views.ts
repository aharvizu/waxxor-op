import { and, asc, eq, ne, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, type DbExecutor } from "@/db";
import { savedViews } from "@/db/schema";
import { filterGroupSchema } from "@/lib/filters";

/**
 * Saved Views (Part 1, dynamic config 2026-07-20). Per-user, per-module
 * views — list/table/kanban/calendar/timeline — with columns/grouping/sort/
 * filters/density/pageSize frozen in `config`. Only "tickets" has UI wired
 * (pilot module); this file is module-agnostic so later sprints reuse it
 * as-is. See docs/features/dynamic-configuration.md.
 */

export const VIEW_TYPES = savedViews.viewType.enumValues;
export type ViewType = (typeof VIEW_TYPES)[number];
export const CONFIG_MODULES = savedViews.module.enumValues;
export type ConfigModule = (typeof CONFIG_MODULES)[number];

const columnConfigSchema = z.object({
  key: z.string(),
  visible: z.boolean().default(true),
  width: z.number().int().positive().nullable().default(null),
});

export const savedViewConfigSchema = z.object({
  columns: z.array(columnConfigSchema).default([]),
  groupBy: z.string().nullable().default(null),
  sortBy: z.object({ field: z.string(), direction: z.enum(["asc", "desc"]) }).nullable().default(null),
  filters: filterGroupSchema.nullable().default(null),
  search: z.string().default(""),
  density: z.enum(["compact", "comfortable", "spacious"]).default("comfortable"),
  pageSize: z.number().int().positive().max(500).default(50),
});
export type SavedViewConfig = z.output<typeof savedViewConfigSchema>;

export function defaultViewConfig(): SavedViewConfig {
  return savedViewConfigSchema.parse({});
}

export type SavedView = typeof savedViews.$inferSelect;

/** Views a user can see for a module: their own + the org's team-shared ones (deduped, own first). */
export async function listViews(
  orgId: number,
  userId: number,
  module: ConfigModule,
): Promise<SavedView[]> {
  return db
    .select()
    .from(savedViews)
    .where(
      and(
        eq(savedViews.organizationId, orgId),
        eq(savedViews.module, module),
        or(eq(savedViews.userId, userId), eq(savedViews.sharedWithTeam, true)),
      ),
    )
    .orderBy(asc(savedViews.sortOrder), asc(savedViews.id));
}

export async function getDefaultView(
  orgId: number,
  userId: number,
  module: ConfigModule,
): Promise<SavedView | null> {
  const [row] = await db
    .select()
    .from(savedViews)
    .where(
      and(
        eq(savedViews.organizationId, orgId),
        eq(savedViews.userId, userId),
        eq(savedViews.module, module),
        eq(savedViews.isDefault, true),
      ),
    );
  return row ?? null;
}

async function loadOwnView(tx: DbExecutor, orgId: number, userId: number, id: number): Promise<SavedView> {
  const [row] = await tx
    .select()
    .from(savedViews)
    .where(and(eq(savedViews.id, id), eq(savedViews.organizationId, orgId), eq(savedViews.userId, userId)));
  if (!row) throw new Error("La vista ya no existe.");
  return row;
}

/** Only one default view per (user, module) — demote siblings inside the same transaction. */
async function demoteOtherDefaults(tx: DbExecutor, orgId: number, userId: number, module: ConfigModule, keepId: number) {
  await tx
    .update(savedViews)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(
      and(
        eq(savedViews.organizationId, orgId),
        eq(savedViews.userId, userId),
        eq(savedViews.module, module),
        eq(savedViews.isDefault, true),
        ne(savedViews.id, keepId),
      ),
    );
}

export async function createView(
  orgId: number,
  userId: number,
  input: { module: ConfigModule; name: string; viewType: ViewType; config?: unknown; isDefault?: boolean; sharedWithTeam?: boolean },
): Promise<SavedView> {
  const config = savedViewConfigSchema.parse(input.config ?? {});
  return db.transaction(async (tx) => {
    const [max] = await tx
      .select({ max: sql<number>`coalesce(max(${savedViews.sortOrder}), -1)` })
      .from(savedViews)
      .where(and(eq(savedViews.organizationId, orgId), eq(savedViews.userId, userId), eq(savedViews.module, input.module)));
    const [created] = await tx
      .insert(savedViews)
      .values({
        organizationId: orgId,
        userId,
        module: input.module,
        name: input.name.trim() || "Nueva vista",
        viewType: input.viewType,
        config,
        isDefault: input.isDefault ?? false,
        sharedWithTeam: input.sharedWithTeam ?? false,
        sortOrder: Number(max?.max ?? -1) + 1,
      })
      .returning();
    if (created.isDefault) await demoteOtherDefaults(tx, orgId, userId, input.module, created.id);
    return created;
  });
}

export async function duplicateView(orgId: number, userId: number, id: number, name?: string): Promise<SavedView> {
  const source = await loadOwnView(db, orgId, userId, id);
  return createView(orgId, userId, {
    module: source.module,
    name: name?.trim() || `${source.name} (copia)`,
    viewType: source.viewType,
    config: source.config,
  });
}

export async function renameView(orgId: number, userId: number, id: number, name: string): Promise<void> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("El nombre de la vista es requerido.");
  await db.transaction(async (tx) => {
    await loadOwnView(tx, orgId, userId, id);
    await tx.update(savedViews).set({ name: trimmed, updatedAt: new Date() }).where(eq(savedViews.id, id));
  });
}

/** Persists the live column/group/sort/filter/density/pageSize state for a view (autosave from the UI). */
export async function updateViewConfig(orgId: number, userId: number, id: number, config: unknown): Promise<void> {
  const parsed = savedViewConfigSchema.parse(config);
  await db.transaction(async (tx) => {
    await loadOwnView(tx, orgId, userId, id);
    await tx.update(savedViews).set({ config: parsed, updatedAt: new Date() }).where(eq(savedViews.id, id));
  });
}

export async function toggleFavoriteView(orgId: number, userId: number, id: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const before = await loadOwnView(tx, orgId, userId, id);
    const next = !before.isFavorite;
    await tx.update(savedViews).set({ isFavorite: next, updatedAt: new Date() }).where(eq(savedViews.id, id));
    return next;
  });
}

export async function toggleShareView(orgId: number, userId: number, id: number): Promise<boolean> {
  return db.transaction(async (tx) => {
    const before = await loadOwnView(tx, orgId, userId, id);
    const next = !before.sharedWithTeam;
    await tx.update(savedViews).set({ sharedWithTeam: next, updatedAt: new Date() }).where(eq(savedViews.id, id));
    return next;
  });
}

export async function setDefaultView(orgId: number, userId: number, id: number): Promise<void> {
  await db.transaction(async (tx) => {
    const view = await loadOwnView(tx, orgId, userId, id);
    await tx.update(savedViews).set({ isDefault: true, updatedAt: new Date() }).where(eq(savedViews.id, id));
    await demoteOtherDefaults(tx, orgId, userId, view.module, id);
  });
}

/** Drag-and-drop reorder: `orderedIds` is the view's full new order for that module. */
export async function reorderViews(orgId: number, userId: number, module: ConfigModule, orderedIds: number[]): Promise<void> {
  await db.transaction(async (tx) => {
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(savedViews)
        .set({ sortOrder: i, updatedAt: new Date() })
        .where(
          and(
            eq(savedViews.id, orderedIds[i]),
            eq(savedViews.organizationId, orgId),
            eq(savedViews.userId, userId),
            eq(savedViews.module, module),
          ),
        );
    }
  });
}

export async function deleteView(orgId: number, userId: number, id: number): Promise<void> {
  await db.transaction(async (tx) => {
    await loadOwnView(tx, orgId, userId, id);
    await tx.delete(savedViews).where(eq(savedViews.id, id));
  });
}
