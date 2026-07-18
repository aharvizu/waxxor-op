import { readFileSync } from "fs";
import { join } from "path";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  apiKeys,
  catalogItems,
  organizationSettings,
  recurrenceExecutions,
  recurrenceDefinitions,
  reports,
} from "@/db/schema";
import {
  type CatalogKind,
  type SettingsKey,
  SETTINGS_SCHEMAS,
  settingsDefaults,
} from "@/lib/settings";
import type { z } from "zod";

/** Org-scoped reads for the Settings module. Writes live in settings/actions.ts. */

export async function getSetting<K extends SettingsKey>(
  organizationId: number,
  key: K,
): Promise<z.output<(typeof SETTINGS_SCHEMAS)[K]>> {
  const [row] = await db
    .select({ value: organizationSettings.value })
    .from(organizationSettings)
    .where(and(eq(organizationSettings.organizationId, organizationId), eq(organizationSettings.key, key)));
  if (!row) return settingsDefaults(key);
  const parsed = SETTINGS_SCHEMAS[key].safeParse(row.value);
  // A stored value that no longer validates falls back to defaults instead of crashing pages.
  return parsed.success
    ? (parsed.data as z.output<(typeof SETTINGS_SCHEMAS)[K]>)
    : settingsDefaults(key);
}

export type CatalogItemRow = typeof catalogItems.$inferSelect;

export async function getCatalog(
  organizationId: number,
  kind: CatalogKind,
  opts: { includeInactive?: boolean } = {},
): Promise<CatalogItemRow[]> {
  const conditions = [eq(catalogItems.organizationId, organizationId), eq(catalogItems.kind, kind)];
  if (!opts.includeInactive) conditions.push(eq(catalogItems.isActive, true));
  return db
    .select()
    .from(catalogItems)
    .where(and(...conditions))
    .orderBy(asc(catalogItems.sortOrder), asc(catalogItems.name));
}

/** Active top-level names of a wired catalog, for datalist inputs. */
export async function getCatalogNames(organizationId: number, kind: CatalogKind): Promise<string[]> {
  const rows = await db
    .select({ name: catalogItems.name })
    .from(catalogItems)
    .where(
      and(
        eq(catalogItems.organizationId, organizationId),
        eq(catalogItems.kind, kind),
        eq(catalogItems.isActive, true),
        isNull(catalogItems.parentId),
      ),
    )
    .orderBy(asc(catalogItems.sortOrder), asc(catalogItems.name));
  return rows.map((r) => r.name);
}

export async function getApiKeys(organizationId: number) {
  return db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.organizationId, organizationId))
    .orderBy(desc(apiKeys.createdAt));
}

/** System-health aggregates for /settings/health. All org-scoped, one query each. */
export async function getSystemHealth(organizationId: number) {
  const started = Date.now();
  const [recurrence] = await db
    .select({
      lastExecutedAt: sql<string | null>`max(${recurrenceExecutions.completedAt})`,
      failedLast24h: sql<number>`count(*) filter (where ${recurrenceExecutions.status} = 'failed' and ${recurrenceExecutions.completedAt} > now() - interval '24 hours')`,
      succeededLast24h: sql<number>`count(*) filter (where ${recurrenceExecutions.status} = 'succeeded' and ${recurrenceExecutions.completedAt} > now() - interval '24 hours')`,
    })
    .from(recurrenceExecutions)
    .where(eq(recurrenceExecutions.organizationId, organizationId));
  const dbLatencyMs = Date.now() - started;

  const [defs] = await db
    .select({
      active: sql<number>`count(*) filter (where ${recurrenceDefinitions.status} = 'active')`,
      inError: sql<number>`count(*) filter (where ${recurrenceDefinitions.status} = 'error')`,
      overdue: sql<number>`count(*) filter (where ${recurrenceDefinitions.status} = 'active' and ${recurrenceDefinitions.nextRunAt} < now() - interval '30 minutes')`,
    })
    .from(recurrenceDefinitions)
    .where(eq(recurrenceDefinitions.organizationId, organizationId));

  const [reportsRow] = await db
    .select({
      lastGeneratedAt: sql<string | null>`max(${reports.generatedAt})`,
      failed: sql<number>`count(*) filter (where ${reports.status} = 'failed')`,
    })
    .from(reports)
    .where(eq(reports.organizationId, organizationId));

  const [migration] = await db.execute<{ count: number; last_at: string | null }>(
    sql`select count(*)::int as count, to_timestamp(max(created_at) / 1000)::text as last_at from drizzle.__drizzle_migrations`,
  ).then((r) => r.rows);

  return {
    dbLatencyMs,
    cronConfigured: Boolean(process.env.CRON_SECRET),
    recurrence: {
      lastExecutedAt: recurrence?.lastExecutedAt ?? null,
      failedLast24h: Number(recurrence?.failedLast24h ?? 0),
      succeededLast24h: Number(recurrence?.succeededLast24h ?? 0),
      activeDefinitions: Number(defs?.active ?? 0),
      definitionsInError: Number(defs?.inError ?? 0),
      overdueDefinitions: Number(defs?.overdue ?? 0),
    },
    reports: {
      lastGeneratedAt: reportsRow?.lastGeneratedAt ?? null,
      failed: Number(reportsRow?.failed ?? 0),
    },
    migrations: {
      applied: Number(migration?.count ?? 0),
      lastAppliedAt: migration?.last_at ?? null,
    },
    version: appVersion(),
  };
}

let cachedVersion: string | null = null;

export function appVersion(): string {
  if (cachedVersion) return cachedVersion;
  try {
    const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as { version?: string };
    cachedVersion = pkg.version ?? "0.0.0";
  } catch {
    cachedVersion = "0.0.0";
  }
  return cachedVersion;
}
