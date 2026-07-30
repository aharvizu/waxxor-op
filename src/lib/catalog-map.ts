/** Builds an id -> row Map for a catalog table (status/priority/billing). Plain, no client/server boundary — safe to call from Server Components. */
export function toCatalogMap<T extends { id: number }>(rows: T[]): Map<number, T> {
  return new Map(rows.map((r) => [r.id, r]));
}
