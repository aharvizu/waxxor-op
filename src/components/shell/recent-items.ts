"use client";

/**
 * "Elementos recientemente abiertos" and "búsquedas recientes" — tracked
 * client-side (localStorage). This is per-browser UX, not organizational
 * data, so it deliberately doesn't live in the Search Engine/database.
 */
export type RecentItem = {
  id: string;
  category: string;
  iconKey: string;
  title: string;
  description?: string | null;
  route: string;
  ts: number;
};

const RECENT_ITEMS_KEY = "wx-recent-items";
const RECENT_SEARCHES_KEY = "wx-recent-searches";
const MAX_RECENT_ITEMS = 8;
const MAX_RECENT_SEARCHES = 5;

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function getRecentItems(): RecentItem[] {
  return readJson<RecentItem[]>(RECENT_ITEMS_KEY, []);
}

export function rememberRecentItem(item: Omit<RecentItem, "ts">): void {
  if (typeof window === "undefined") return;
  const next = [{ ...item, ts: Date.now() }, ...getRecentItems().filter((i) => i.id !== item.id)].slice(0, MAX_RECENT_ITEMS);
  localStorage.setItem(RECENT_ITEMS_KEY, JSON.stringify(next));
}

export function getRecentSearches(): string[] {
  return readJson<string[]>(RECENT_SEARCHES_KEY, []);
}

export function rememberSearch(query: string): void {
  if (typeof window === "undefined" || query.trim().length < 2) return;
  const next = [query, ...getRecentSearches().filter((q) => q !== query)].slice(0, MAX_RECENT_SEARCHES);
  localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
}
