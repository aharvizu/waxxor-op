import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { MatchRank } from "./types";

/**
 * SQL building blocks every search source reuses — the only place that
 * knows how "case/accent-insensitive, fuzzy-tolerant" matching is done
 * (unaccent + pg_trgm, see drizzle/0025_search_extensions.sql). Sources
 * never write their own ILIKE/similarity logic.
 */

type Text = AnyPgColumn | SQL;

function normalized(column: Text) {
  return sql`unaccent(lower(${column}))`;
}

/** WHERE-clause fragment: substring match OR fuzzy (trigram) similarity. */
export function matchesQuery(column: Text, query: string): SQL {
  const col = normalized(column);
  return sql`(${col} ilike ${"%" + query + "%"} or similarity(${col}, unaccent(lower(${query}))) > 0.3)`;
}

/** 1=exact, 2=starts with, 3=contains, 4=everything else this source's WHERE let through (fuzzy). */
export function rankOf(column: Text, query: string): SQL<MatchRank> {
  const col = normalized(column);
  return sql<MatchRank>`case
    when ${col} = unaccent(lower(${query})) then 1
    when ${col} ilike ${query + "%"} then 2
    when ${col} ilike ${"%" + query + "%"} then 3
    else 4
  end`;
}

/** Best (lowest) rank across several candidate columns for the same row (e.g. title OR folio OR description). */
export function bestRankOf(columns: Text[], query: string): SQL<MatchRank> {
  const parts = columns.map((c) => rankOf(c, query));
  return sql.join([sql`least(`, sql.join(parts, sql`, `), sql`)`]).mapWith(Number) as SQL<MatchRank>;
}

/** OR-combine matchesQuery across several columns. */
export function matchesAny(columns: Text[], query: string): SQL {
  const parts = columns.map((c) => matchesQuery(c, query));
  return sql.join([sql`(`, sql.join(parts, sql` or `), sql`)`]);
}

/** Accent/case-insensitive normalization for the small, in-memory sources
 * (saved views, static quick actions, indicator definitions) that don't go
 * through SQL — same rules as normalize()'s SQL counterpart above. */
export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics left by NFD decomposition
    .toLowerCase();
}

/** JS equivalent of rankOf() for in-memory candidates — null when no match at all. */
export function jsRankOf(text: string, query: string): 1 | 2 | 3 | null {
  const t = normalizeText(text);
  const q = normalizeText(query);
  if (!q || !t.includes(q)) return null;
  if (t === q) return 1;
  if (t.startsWith(q) || t.includes(` ${q}`)) return 2;
  return 3;
}
