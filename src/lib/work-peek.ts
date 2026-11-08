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
