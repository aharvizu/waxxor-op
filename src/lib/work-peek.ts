/**
 * The `?peek=` token of the combined Work view's quick-view panel.
 *
 * It is a contract between two sides that live in different files and even
 * different runtimes: a client component builds the link, the server page
 * parses it back to a row. Split across both, a drift (a renamed prefix, a
 * stricter pattern) would fail *silently* — the panel just never opens and
 * nothing throws. So both halves live here, pure and unit-tested together.
 *
 * The id is the **specialization** id (tickets.id / activities.id), which is
 * what the detail URLs use, so the type prefix is what disambiguates: ticket
 * #322 and activity #322 both exist.
 */

export type WorkPeekTarget = { type: "ticket" | "activity"; entityId: number };

const PEEK_PATTERN = /^(t|a):(\d+)$/;

export function workPeekToken(target: WorkPeekTarget): string {
  return `${target.type === "ticket" ? "t" : "a"}:${target.entityId}`;
}

export function parseWorkPeekToken(raw: string | null | undefined): WorkPeekTarget | null {
  const match = PEEK_PATTERN.exec(raw ?? "");
  if (!match) return null;
  return { type: match[1] === "t" ? "ticket" : "activity", entityId: Number(match[2]) };
}

/**
 * The detail page for a work row. Lives in this **pure** module, not next to
 * the row's React components, because both sides of the boundary need it: the
 * Kanban card (client) and the quick-view panel (server). Exporting it from a
 * `"use client"` module and importing it into a server component compiles
 * fine and then throws at request time — "Attempted to call workHref() from
 * the server" — which is how the panel shipped broken on 2026-11-08.
 */
export function workDetailHref(target: WorkPeekTarget): string {
  return target.type === "ticket" ? `/helpdesk/${target.entityId}` : `/activities/${target.entityId}`;
}
