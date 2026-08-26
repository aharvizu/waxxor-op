import { getSetting } from "@/lib/settings-data";
import type { Locale } from "@/lib/i18n";

/**
 * Server-only: resolves the org's language (Settings → Organización → Idioma,
 * organizationProfileSchema.language). Split out of lib/i18n.ts (2026-08-25)
 * because settings-data.ts pulls in Node's `fs` — importing it from i18n.ts
 * broke every client component that imports Locale/DEFAULT_LOCALE from
 * there (locale-provider.tsx, lib/labels.ts, and the client views that call
 * getLabels()). i18n.ts stays client-safe; only this function is server-only.
 */
export async function getOrgLocale(organizationId: number): Promise<Locale> {
  const profile = await getSetting(organizationId, "organization.profile");
  return profile.language;
}
