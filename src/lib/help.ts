import { helpModule } from "@/db/schema";

/**
 * Pure Help Center domain: module catalog, path->module mapping for
 * contextual recommendations, and progress-derivation helpers. No DB access —
 * reads live in help-data.ts, writes in the /help actions.
 */

export const HELP_MODULES = helpModule.enumValues;
export type HelpModuleKey = (typeof HELP_MODULES)[number];

export const HELP_MODULE_LABELS: Record<HelpModuleKey, string> = {
  today: "Hoy",
  activities: "Actividades",
  tickets: "Tickets",
  projects: "Proyectos",
  companies: "Empresas",
  contacts: "Contactos",
  recurring: "Recurrentes",
  reports: "Reportes",
  indicators: "Indicadores",
  settings: "Configuración",
  inbox: "Inbox",
  knowledge: "Base de conocimiento",
};

/**
 * First path segment -> Help module, for contextual recommendations (the
 * help button on each screen and the "recommended for this page" list).
 * Only maps routes that exist today — nothing speculative.
 */
const PATH_MODULE_MAP: Record<string, HelpModuleKey> = {
  today: "today",
  activities: "activities",
  helpdesk: "tickets",
  projects: "projects",
  companies: "companies",
  contacts: "contacts",
  recurring: "recurring",
  reports: "reports",
  indicators: "indicators",
  settings: "settings",
  inbox: "inbox",
  knowledge: "knowledge",
};

export function moduleForPath(pathname: string): HelpModuleKey | null {
  const segment = pathname.split("/").filter(Boolean)[0];
  if (!segment) return null;
  return PATH_MODULE_MAP[segment] ?? null;
}

export type TutorialProgressStatus = "not_started" | "in_progress" | "completed";

export function progressStatus(progress: {
  completedAt: Date | null;
  startedAt: Date | null;
} | null): TutorialProgressStatus {
  if (!progress) return "not_started";
  if (progress.completedAt) return "completed";
  return "in_progress";
}

export function isStepCompleted(completedStepIds: unknown, stepId: number): boolean {
  return Array.isArray(completedStepIds) && completedStepIds.includes(stepId);
}
