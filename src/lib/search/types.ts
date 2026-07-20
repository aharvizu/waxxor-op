import type { Role } from "@/lib/roles";

/**
 * The Command Center's Search Engine — shared types (2026-07-24). A module
 * registers a SearchSource (entity, icon, indexed fields, route, open
 * action) and the engine handles orchestration, ranking and grouping. No
 * module implements its own search logic — see engine.ts.
 */

export type SearchCategory =
  | "activities"
  | "tickets"
  | "projects"
  | "companies"
  | "contacts"
  | "recurring"
  | "knowledge"
  | "help"
  | "reports"
  | "users"
  | "views"
  | "attachments"
  | "indicators"
  | "settings"
  | "actions";

export type IconKey =
  | "activity"
  | "ticket"
  | "project"
  | "company"
  | "contact"
  | "recurring"
  | "knowledge"
  | "help"
  | "report"
  | "user"
  | "view"
  | "attachment"
  | "indicator"
  | "action"
  | "dashboard"
  | "settings"
  | "signout";

export type SearchContext = {
  orgId: number;
  userId: number;
  role: Role;
};

/** 1=exact match, 2=starts with, 3=contains, 4=fuzzy (trigram similarity). Lower sorts first. */
export type MatchRank = 1 | 2 | 3 | 4;

export type SearchResultItem = {
  /** Unique across the whole engine: `${category}:${entityId}`. */
  id: string;
  category: SearchCategory;
  iconKey: IconKey;
  title: string;
  description?: string | null;
  status?: string | null;
  owner?: string | null;
  company?: string | null;
  /** ISO date string — the single most relevant date for this item. */
  date?: string | null;
  route: string;
  breadcrumb?: string[];
  rank: MatchRank;
};

export type SearchSource = {
  category: SearchCategory;
  label: string;
  iconKey: IconKey;
  /**
   * Real, bounded lookup — indexed ILIKE/trigram + LIMIT only, never a full
   * table scan ("no consultar todas las tablas directamente"). Returning an
   * empty array when `query` is empty is expected (empty-query state is
   * recent/favorites/actions, not a live search).
   */
  search(ctx: SearchContext, query: string, limit: number): Promise<SearchResultItem[]>;
};
