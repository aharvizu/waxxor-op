# Database Transactions

> Status: adopted 2026-07-15. Closes TD-05 (`docs/decisions/technical-debt.md`).
> Verification: `npx tsx scripts/verify-transactions.ts` (run against the dev database).

## Chosen configuration

`src/db/index.ts` uses **`@neondatabase/serverless` in Pool/WebSocket mode** with the **`drizzle-orm/neon-serverless`** adapter — the official Neon + Drizzle combination with full transaction support.

| | Before | Now |
|---|---|---|
| Transport | `neon()` — one HTTP fetch per query | `Pool` — WebSocket sessions |
| Drizzle adapter | `drizzle-orm/neon-http` | `drizzle-orm/neon-serverless` |
| `db.transaction()` | ❌ throws (unsupported) | ✅ real BEGIN/COMMIT/ROLLBACK |
| Env vars | `DATABASE_URL` | `DATABASE_URL` (unchanged) |
| New dependency | — | `ws` (+ `@types/ws`) |

`ws` is wired via `neonConfig.webSocketConstructor` (the official pattern) so the driver works on any Node runtime, including those without native WebSocket (< v22). The pool connects **lazily on first query**, which keeps `next build` working with the placeholder `DATABASE_URL` in CI.

## How to write a transaction

```ts
import { db } from "@/db";

await db.transaction(async (tx) => {
  const [created] = await tx.insert(clients).values(data).returning({ id: clients.id });
  await recordAudit(tx, { entityType: "client", entityId: created.id, action: "create", ... });
});
```

Rules:

1. **Run every statement on `tx`, never on `db`,** inside the callback — a `db.` call inside a transaction silently escapes it.
2. **Throw to roll back.** Any exception aborts the whole transaction. Drizzle also exposes `tx.rollback()` for explicit aborts.
3. **Business errors from inside a transaction**: throw a dedicated error class and translate it after the catch (see `ClientNotFoundError` in `clients/actions.ts`) — you cannot `return businessError(...)` from inside the callback and still roll back.
4. **Helpers that write must accept the executor.** Type them with `DbExecutor` (exported from `@/db`) so they run on `db` or on an open `tx` interchangeably — `recordAudit(tx, events)` is the reference.
5. **Keep transactions short**: no `fetch`, no slow computation inside the callback; the connection is held for its duration.

## Audit + business write pattern (the reason for this change)

Both writes now commit or roll back **together** — see `clients/actions.ts`:

- `createClient`: insert client + `create` audit event in one transaction.
- `updateClient`: read before-image, diff, update + per-field audit events in one transaction (no-change submits skip the write entirely).

`recordAudit` **now throws on failure** (it used to swallow errors when atomicity was impossible). An audit failure therefore rolls back the business write — "everything important is auditable" is now enforced, not best-effort. `src/lib/audit.ts` and `docs/architecture/audit-log.md` reflect the new contract.

## Verified guarantees

`scripts/verify-transactions.ts` forces each side to fail (NOT NULL violations) and asserts the other side rolled back:

```
A PASS — audit insert failed and the client write was rolled back
B PASS — client write failed and the audit insert was rolled back
```

Rollback doubles as cleanup: the script leaves no rows behind. Additionally smoke-tested through the real app (login + create-client server action) — the transactional path works inside the Next.js runtime.

## Limitations

1. **WebSocket handshake latency** on the first query of each serverless invocation (~tens of ms to Neon). Subsequent queries reuse the pooled connection. Acceptable for an internal ops tool.
2. **Interactive transactions hold a connection** — long transactions reduce pool throughput. Keep them short (rule 5).
3. `drizzle-kit` (migrations/seed CLI) still connects over its own driver — unaffected.
4. Nested `db.transaction` calls create savepoints, not independent transactions — don't rely on partial commits.

## Recommended usage in new features

- Any action that performs **more than one dependent write** (business row + audit, parent + children, conversion flows like Activity→Ticket) must use `db.transaction`.
- Single-statement writes don't need an explicit transaction (a statement is already atomic) — but they still need their audit event, so in practice **any audited write is a transaction**.
- New shared write-helpers must take `DbExecutor` as their first parameter, like `recordAudit`.
