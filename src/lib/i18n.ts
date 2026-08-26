/**
 * Org-wide language (Settings → Organización → Idioma, organizationProfileSchema.language).
 * Phase 1 (2026-08-25): drives the shared status/priority/role label maps in
 * lib/labels.ts. Not per-user — the whole org reads and writes in one language,
 * matching how the field is already exposed in Settings.
 *
 * Deliberately client-safe (no server-only imports): locale-provider.tsx and
 * lib/labels.ts both import from here and must be usable from "use client"
 * components. The server-only resolver lives in lib/get-org-locale.ts.
 */
export type Locale = "es" | "en";
export const DEFAULT_LOCALE: Locale = "es";

/**
 * Freeform UI copy (titles, descriptions, placeholders, buttons, empty
 * states — everything that isn't one of the finite status/priority/role
 * maps in lib/labels.ts) is translated inline at the call site instead of
 * through a central key dictionary: `t("Texto", "Text", locale)`. At this
 * app's scale (~150 files, one-off copy, no repeated phrases worth a
 * shared key) a central dictionary would just be another file to keep in
 * sync; keeping both strings next to each other where they're used is
 * self-documenting and trivially greppable.
 */
export function t(es: string, en: string, locale: Locale): string {
  return locale === "en" ? en : es;
}
