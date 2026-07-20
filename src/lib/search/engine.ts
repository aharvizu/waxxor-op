import type { SearchCategory, SearchContext, SearchResultItem, SearchSource } from "./types";

/**
 * The Search Engine — the single place that indexes, searches, ranks and
 * groups. Modules register a source (see sources/*.ts); this file has zero
 * per-module knowledge. Adding a new searchable entity means adding one
 * source file and one line in sources/index.ts — this file never changes.
 */

const registry = new Map<SearchCategory, SearchSource>();

export function registerSource(source: SearchSource): void {
  registry.set(source.category, source);
}

export function listSources(): SearchSource[] {
  return Array.from(registry.values());
}

export type SearchGroup = {
  category: SearchCategory;
  label: string;
  iconKey: SearchSource["iconKey"];
  items: SearchResultItem[];
};

export type SearchResponse = {
  query: string;
  groups: SearchGroup[];
  total: number;
};

const DEFAULT_PER_CATEGORY_LIMIT = 6;
const MIN_QUERY_LENGTH = 2;

/**
 * Runs every registered source in parallel (or just the one requested via
 * `category`), bounded per-source ("límite inicial de resultados"), ranked
 * (exact > starts-with > contains > fuzzy, see normalize.ts) and grouped by
 * entity. A source throwing doesn't fail the whole search — it just
 * contributes zero results (logged, not surfaced to the user).
 */
export async function runSearch(
  ctx: SearchContext,
  rawQuery: string,
  opts: { category?: SearchCategory; limit?: number } = {},
): Promise<SearchResponse> {
  const query = rawQuery.trim();
  const sources = opts.category ? [registry.get(opts.category)].filter((s): s is SearchSource => !!s) : listSources();
  const perCategoryLimit = opts.limit ?? DEFAULT_PER_CATEGORY_LIMIT;

  if (query.length < MIN_QUERY_LENGTH) {
    return { query, groups: [], total: 0 };
  }

  const results = await Promise.all(
    sources.map(async (source) => {
      try {
        const items = await source.search(ctx, query, perCategoryLimit);
        return { source, items };
      } catch (err) {
        console.error(`[search] source "${source.category}" failed`, err);
        return { source, items: [] as SearchResultItem[] };
      }
    }),
  );

  const groups: SearchGroup[] = results
    .filter((r) => r.items.length > 0)
    .map((r) => ({
      category: r.source.category,
      label: r.source.label,
      iconKey: r.source.iconKey,
      items: [...r.items].sort((a, b) => a.rank - b.rank || a.title.localeCompare(b.title)),
    }));

  const total = groups.reduce((sum, g) => sum + g.items.length, 0);
  return { query, groups, total };
}
