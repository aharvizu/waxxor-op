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
