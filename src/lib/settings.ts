import { createHash, randomBytes } from "crypto";
import { z } from "zod";
import { INDICATOR_THRESHOLD_DEFAULTS } from "@/lib/indicators";
import { RECURRENCE_MAX_CONSECUTIVE_FAILURES } from "@/lib/recurrence";
import { ORG_TIMEZONE } from "@/lib/reports";

/**
 * Pure settings domain: section keys, their Zod schemas and defaults, catalog
 * kinds, secret masking and API-key generation. No DB access here — reads live
 * in settings-data.ts, writes in the /settings actions.
 */

const optionalTrimmed = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().trim().max(300).optional(),
);

/** Small images only, stored inline as a data URI — no blob storage exists. */
export const LOGO_MAX_CHARS = 200_000; // ~150 KB of base64
const logoSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z
    .string()
    .regex(/^data:image\/(png|jpeg|svg\+xml|webp);base64,/, "Debe ser una imagen PNG, JPEG, SVG o WebP.")
    .max(LOGO_MAX_CHARS, "El logo excede el tamaño máximo (~150 KB).")
    .optional(),
);

export const CURRENCIES = ["MXN", "USD", "EUR"] as const;
export const LANGUAGES = ["es", "en"] as const;

/** Section: Organización — profile, fiscal data and branding. */
export const organizationProfileSchema = z.object({
  displayName: optionalTrimmed,
  logo: logoSchema,
  currency: z.enum(CURRENCIES).default("MXN"),
  language: z.enum(LANGUAGES).default("es"),
  legalName: optionalTrimmed,
  taxId: optionalTrimmed,
  fiscalAddress: optionalTrimmed,
  fiscalRegime: optionalTrimmed,
  brandColor: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color hex inválido (#RRGGBB).").optional(),
  ),
});

/** Section: Empresas — defaults applied when creating companies. */
export const companyDefaultsSchema = z.object({
  defaultAccountOwnerId: z.coerce.number().int().positive().optional().nullable(),
  defaultTechnicianId: z.coerce.number().int().positive().optional().nullable(),
});

/** Section: Proyectos — creation defaults. */
export const projectDefaultsSchema = z.object({
  defaultHealth: z
    .enum(["not_set", "on_track", "attention"])
    .default("not_set"),
  defaultPriority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
});

/** Section: Recurrentes — wizard defaults + engine failure policy. */
export const recurrenceDefaultsSchema = z.object({
  defaultTimezone: z.string().trim().min(1).default(ORG_TIMEZONE),
  defaultTimeOfDay: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Hora inválida (HH:MM).")
    .default("09:00"),
  /**
   * Retry policy: the engine never auto-retries (documented in recurring.md);
   * this limit controls when consecutive failures auto-pause the definition.
   */
  maxConsecutiveFailures: z.coerce
    .number()
    .int()
    .min(1)
    .max(10)
    .default(RECURRENCE_MAX_CONSECUTIVE_FAILURES),
});

/** Section: Reportes — branding consumed by the print/PDF view. */
export const reportBrandingSchema = z.object({
  logo: logoSchema,
  coverTitle: optionalTrimmed,
  coverSubtitle: optionalTrimmed,
  footerText: optionalTrimmed,
  confidentialityNotice: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(2000).optional(),
  ),
  corporateIntro: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(2000).optional(),
  ),
});

/** Section: Tickets — default priority applied when a ticket form leaves it unset. */
export const ticketDefaultsSchema = z.object({
  defaultPriority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
});

/**
 * Form sections/editor UIs post one hidden input per complex field, holding
 * a JSON string (see FormConfigEditor / ViewSettingsEditor) — `saveOrganizationSetting`
 * validates raw FormData (Object.fromEntries), so each such field needs its
 * own JSON.parse before schema validation. A plain object (already parsed,
 * e.g. from getSetting) passes through untouched.
 */
function jsonField<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess((v) => {
    if (typeof v !== "string") return v;
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }, schema);
}

/**
 * Section: Formularios (Part 5, dynamic config 2026-07-20) — per-module form
 * layout: section grouping, field order/visibility/required/default, with
 * Custom Fields interleaved (isCustomField + the field's `key`). One row per
 * (org, `${module}.formConfig`) via the existing organization_settings KV
 * table — no new table needed, same pattern as every other settings section.
 */
const formFieldConfigSchema = z.object({
  key: z.string().trim().min(1),
  visible: z.boolean().default(true),
  required: z.boolean().default(false),
  order: z.number().int().default(0),
  defaultValue: z.string().optional(),
  isCustomField: z.boolean().default(false),
});
const formSectionConfigSchema = z.object({
  key: z.string().trim().min(1),
  label: z.string().trim().min(1),
  collapsed: z.boolean().default(false),
  order: z.number().int().default(0),
  fields: z.array(formFieldConfigSchema).default([]),
});
export const formConfigSchema = z.object({
  sections: jsonField(z.array(formSectionConfigSchema).default([])),
});

/**
 * Section: Vistas (Part 6) — org-wide defaults new users start from; each
 * user can still personalize their own saved view afterward (src/lib/views.ts).
 * globalFilters is intentionally a flat AND-only list (not the full AND/OR
 * tree from src/lib/filters.ts) — org-level defaults are meant to be a small,
 * unambiguous baseline, not a complex query; the per-user filter builder
 * still supports full AND/OR nesting.
 */
const globalFilterConditionSchema = z.object({
  field: z.string().trim().min(1),
  operator: z.string().trim().min(1),
  value: z.unknown(),
});
export const viewSettingsSchema = z.object({
  defaultColumns: jsonField(z.array(z.string()).default([])),
  defaultSort: jsonField(
    z
      .object({ field: z.string(), direction: z.enum(["asc", "desc"]) })
      .nullable()
      .default(null),
  ),
  initialViewType: z.enum(["list", "table", "kanban", "calendar", "timeline"]).default("table"),
  defaultGroupBy: z.preprocess(
    (v) => (v === "" || v === undefined ? null : v),
    z.string().nullable().default(null),
  ),
  globalFilters: jsonField(z.array(globalFilterConditionSchema).default([])),
});

export const SETTINGS_SCHEMAS = {
  "organization.profile": organizationProfileSchema,
  "companies.defaults": companyDefaultsSchema,
  "projects.defaults": projectDefaultsSchema,
  "recurrence.defaults": recurrenceDefaultsSchema,
  "reports.branding": reportBrandingSchema,
  "tickets.defaults": ticketDefaultsSchema,
  "tickets.formConfig": formConfigSchema,
  "tickets.viewSettings": viewSettingsSchema,
} as const;

export type SettingsKey = keyof typeof SETTINGS_SCHEMAS;

export const SETTINGS_KEYS = Object.keys(SETTINGS_SCHEMAS) as SettingsKey[];

export type OrganizationProfile = z.output<typeof organizationProfileSchema>;
export type CompanyDefaults = z.output<typeof companyDefaultsSchema>;
export type ProjectDefaults = z.output<typeof projectDefaultsSchema>;
export type RecurrenceDefaults = z.output<typeof recurrenceDefaultsSchema>;
export type ReportBranding = z.output<typeof reportBrandingSchema>;
export type TicketDefaults = z.output<typeof ticketDefaultsSchema>;
export type FormConfig = z.output<typeof formConfigSchema>;
export type ViewSettings = z.output<typeof viewSettingsSchema>;

/** Defaults when no row exists — every schema parses an empty object. */
export function settingsDefaults<K extends SettingsKey>(key: K): z.output<(typeof SETTINGS_SCHEMAS)[K]> {
  return SETTINGS_SCHEMAS[key].parse({}) as z.output<(typeof SETTINGS_SCHEMAS)[K]>;
}

/**
 * Catalog kinds. `wired` kinds feed real inputs today; `prepared` kinds are
 * managed here but their consuming field ships with its own module (documented,
 * never simulated).
 */
export const CATALOG_KINDS = {
  ticket_category: {
    label: "Categorías de tickets",
    hasChildren: true,
    childLabel: "Subcategorías",
    wired: true,
    note: "Alimentan los campos categoría/subcategoría de Helpdesk (texto compatible con datos históricos).",
  },
  ticket_status_style: {
    label: "Estilo de estados de tickets",
    hasChildren: false,
    childLabel: null,
    wired: true,
    note: "Personaliza etiqueta/color/ícono/orden de cada estado. El valor técnico (workflow) no cambia — ver docs/features/dynamic-configuration.md.",
  },
  ticket_priority_style: {
    label: "Estilo de prioridades de tickets",
    hasChildren: false,
    childLabel: null,
    wired: true,
    note: "Personaliza etiqueta/color/ícono/orden de cada prioridad. El valor técnico no cambia.",
  },
  ticket_billing_status_style: {
    label: "Estilo de estatus de cobro de tickets",
    hasChildren: false,
    childLabel: null,
    wired: true,
    note: "Personaliza etiqueta/color/ícono/orden de cada estatus de cobro. El valor técnico no cambia.",
  },
  company_category: {
    label: "Categorías de empresas",
    hasChildren: false,
    childLabel: null,
    wired: false,
    note: "Catálogo preparado; el campo en la ficha de empresa llega con una fase posterior de Empresas.",
  },
  company_tag: {
    label: "Etiquetas de empresas",
    hasChildren: false,
    childLabel: null,
    wired: false,
    note: "Catálogo preparado; el etiquetado de empresas llega con una fase posterior de Empresas.",
  },
  activity_tag: {
    label: "Etiquetas de actividades",
    hasChildren: false,
    childLabel: null,
    wired: false,
    note: "Catálogo preparado; el etiquetado de actividades llega con una fase posterior de Activities.",
  },
  project_color: {
    label: "Colores de proyecto",
    hasChildren: false,
    childLabel: null,
    wired: false,
    note: "Catálogo preparado; projects.color existe reservado en el modelo, su UI llega con Proyectos.",
  },
  project_template: {
    label: "Plantillas de proyecto",
    hasChildren: false,
    childLabel: null,
    wired: true,
    note: "Disponibles al crear un proyecto: sus listas se crean automáticamente.",
  },
} as const;

export type CatalogKind = keyof typeof CATALOG_KINDS;

export const CATALOG_KIND_KEYS = Object.keys(CATALOG_KINDS) as CatalogKind[];

export function isCatalogKind(value: string): value is CatalogKind {
  return value in CATALOG_KINDS;
}

/** Config payload for project_template catalog items. */
export const projectTemplateConfigSchema = z.object({
  lists: z.array(z.string().trim().min(1).max(120)).min(1).max(20),
  defaultPriority: z.enum(["low", "normal", "high", "urgent"]).optional(),
});

export type ProjectTemplateConfig = z.output<typeof projectTemplateConfigSchema>;

/**
 * Masks a secret for the environment-diagnostics screen. Never returns the
 * full value: first 4 characters plus length only.
 */
export function maskSecret(value: string | undefined | null): string {
  if (!value) return "—";
  if (value.length <= 8) return "••••";
  return `${value.slice(0, 4)}…${"•".repeat(4)} (${value.length} caracteres)`;
}

/** Env vars validated in the diagnostics screen. */
export const ENV_CHECKS: { name: string; required: boolean; secret: boolean; hint: string }[] = [
  { name: "DATABASE_URL", required: true, secret: true, hint: "Conexión Postgres (Neon)." },
  { name: "AUTH_SECRET", required: true, secret: true, hint: "Firma de sesiones Auth.js." },
  { name: "CRON_SECRET", required: false, secret: true, hint: "Protege /api/cron/recurrences; sin él el scheduler responde 503." },
  { name: "SEED_ADMIN_EMAIL", required: false, secret: false, hint: "Solo para el seed inicial." },
  { name: "SEED_ADMIN_PASSWORD", required: false, secret: true, hint: "Solo para el seed inicial." },
];

export const API_KEY_PREFIX = "wxk";

/**
 * Generates an API key. The plaintext is returned once; persist only the
 * SHA-256 hash. Format: wxk_<8-char id>_<40 hex chars>.
 */
export function generateApiKey(): { token: string; prefix: string; tokenHash: string } {
  const id = randomBytes(4).toString("hex");
  const secret = randomBytes(20).toString("hex");
  const token = `${API_KEY_PREFIX}_${id}_${secret}`;
  return { token, prefix: `${API_KEY_PREFIX}_${id}`, tokenHash: hashApiKey(token) };
}

export function hashApiKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Invitation tokens for the no-email invite flow (link shared manually). */
export function generateInvitationToken(): string {
  return randomBytes(24).toString("hex");
}

/** Threshold keys surfaced in Settings → Indicadores (reuses the Indicators module). */
export const SETTINGS_THRESHOLD_KEYS = Object.keys(INDICATOR_THRESHOLD_DEFAULTS);
