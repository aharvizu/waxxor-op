import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { catalogItems } from "@/db/schema";
import type { BadgeTone } from "@/components/ui";

/**
 * Cosmetic overrides for fixed enum values (ticket status/priority/billing —
 * see docs/features/dynamic-configuration.md §Catálogos dinámicos). The enum
 * itself never changes (business logic keeps switching on the same literal
 * values); only label/tone/icon/order are org-configurable, stored as
 * catalog_items rows where `name` = the enum's raw value. An org with no
 * overrides sees exactly today's hardcoded labels.ts behavior.
 *
 * `color` on catalog_items normally holds a hex string for freeform catalogs
 * (ticket_category etc.); for *_style kinds it instead holds one of the
 * seven Badge tone names, so the existing Badge component renders it with
 * zero changes.
 */

type Meta = { label: string; tone: BadgeTone };
export type StyledMeta = Meta & { icon: string | null; sortOrder: number; isActive: boolean };

const BADGE_TONES: readonly BadgeTone[] = ["slate", "blue", "amber", "green", "red", "violet", "purple"];
export function isBadgeTone(v: unknown): v is BadgeTone {
  return typeof v === "string" && (BADGE_TONES as readonly string[]).includes(v);
}

type StyleConfig = { label?: string; icon?: string };

/**
 * Merges org style overrides for `kind` over `fallback`. Every key in
 * `fallback` is guaranteed to be present in the result (falls back cleanly),
 * so callers can index it exactly like the old static Meta maps.
 */
export async function getStyledMeta<T extends string>(
  orgId: number,
  kind: string,
  fallback: Record<T, Meta>,
): Promise<Record<T, StyledMeta>> {
  const rows = await db
    .select()
    .from(catalogItems)
    .where(and(eq(catalogItems.organizationId, orgId), eq(catalogItems.kind, kind)));
  const overridesByValue = new Map(rows.map((r) => [r.name, r]));

  const result = {} as Record<T, StyledMeta>;
  let i = 0;
  for (const value of Object.keys(fallback) as T[]) {
    const base = fallback[value];
    const override = overridesByValue.get(value);
    const config = (override?.config ?? null) as StyleConfig | null;
    result[value] = {
      label: config?.label?.trim() || base.label,
      tone: isBadgeTone(override?.color) ? (override.color as BadgeTone) : base.tone,
      icon: config?.icon?.trim() || null,
      sortOrder: override?.sortOrder ?? i,
      isActive: override?.isActive ?? true,
    };
    i++;
  }
  return result;
}

/** Enum values ordered per org style overrides, falling back to declaration order. */
export function orderByStyle<T extends string>(values: readonly T[], styled: Record<T, StyledMeta>): T[] {
  return [...values].sort((a, b) => styled[a].sortOrder - styled[b].sortOrder);
}
