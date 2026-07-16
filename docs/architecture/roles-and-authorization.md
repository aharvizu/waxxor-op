# Roles & Authorization

> Status: adopted 2026-07-15. Implements the base of E-01/OQ-10 and resolves TD-03/TD-04 (base level).
> Verified end-to-end on the dev environment; unit tests in `src/lib/roles.test.ts`.

## The six roles (PRD §7)

| Role | Access today | Notes |
|---|---|---|
| `superadmin` | **Total.** Passes every role check automatically; only role that can see/modify Users **and SLA definitions/work calendar** (`/sla`, PRD R7). Only role whose explicit SLA choice is honored on ticket creation/conversion. | |
| `administrator` | Full operational access (all current modules). | Excluded from **technical global configuration** — that boundary materializes with the Configuration module (E-02); today the only such surface is Users, which is superadmin-only. |
| `director` | Operational + consultation access (all current modules). | Read-oriented restrictions arrive with granular permissions (deferred). |
| `project_manager` | Operational access (all current modules). | |
| `technician` | Operational access (all current modules). | Default role for new users and the fallback for unknown values. |
| `client` | **No internal portal access.** Can authenticate; any internal page redirects to `/no-access` (clear, safe page — never a 500). | Customer portal is future scope (PRD §10). |

Granular/individual/team/delegated permissions are **deliberately not implemented** (OQ-10 still open for the fine-grained matrix).

## Where the role lives

- **DB**: `user_role` pg enum with the six values; `users.role`, default `technician`.
- **JWT/session**: set at sign-in from the DB row; propagated by the `jwt`/`session` callbacks in `src/auth.ts`. Both callbacks run `normalizeRole`, so tokens issued before the migration (`admin`/`member`) resolve to `superadmin`/`technician` without forcing re-login — and no invalid value can reach authorization code.
- **Types**: `Role` (from the schema enum) is the single source; `Session.user.role: Role` via module augmentation.
- Caveat (pre-existing, TD-11): a role changed in the DB reaches the session on next sign-in, not live.

## Migration (`drizzle/0003_superb_excalibur.sql`)

Recreates the enum with the column temporarily as `text`, mapping data in place:
`admin → superadmin`, `member → technician` (the UPDATE statements run between `CREATE TYPE` and the cast back, so no value can fail the cast and **no user is lost**). The seed script now creates the admin as `superadmin`. The same mapping is exposed as `normalizeRole()` and unit-tested.

## Utilities

`src/lib/roles.ts` — pure, unit-testable policy:

- `ROLES`, `INTERNAL_ROLES`, type `Role`
- `hasRole(role, allowed)` — superadmin always passes (total access is a product rule)
- `canAccessInternalPortal(role)` — false only for `client`
- `canManageUsers(role)` — true only for `superadmin`
- `normalizeRole(value)` — legacy/unknown-value mapping (floor: `technician`)

`src/lib/session.ts` — server-side guards (redirect-based):

- `getAuthUser()` — user or `null`, never redirects
- `requireUser()` — `/login` if anonymous, `/no-access` if client-role
- `requireRole(...roles)` — additionally sends non-matching roles to `/` (superadmin always passes)

## Protecting a Server Action

```ts
export async function createUser(formData: FormData) {
  const me = await requireRole("superadmin");   // authn + authz, or redirect
  ...
  await db.transaction(async (tx) => {          // mutation + audit, atomically
    const [created] = await tx.insert(users).values({...}).returning({ id: users.id });
    await recordAudit(tx, { userId: Number(me.id), entityType: "user",
      entityId: created.id, action: "create", metadata: { values: data } });
  });
}
```

## Protecting a route (page)

```ts
export default async function UsersPage() {
  await requireRole("superadmin"); // non-superadmins are redirected to /
  ...
}
```

Every `(app)` page already inherits `requireUser()` from the layout; add `requireRole` only where a page needs more than portal access (today: `/users` and `/sla`, both superadmin-only). There is still no `middleware.ts` — protection is layout + per-page + per-action (each action re-checks; layouts alone don't guard direct action invocation). Note: with streaming, a `redirect()` from a page below the layout returns HTTP 200 carrying a `NEXT_REDIRECT` instruction instead of a 307 — verified that no page data is leaked in that response.

## Audit coverage for users

All in one transaction with the business write (see `database-transactions.md`):

- `create` — snapshot of name/email/role/title/phone (**never the password hash**)
- `update` — one event per changed field; role changes appear as `field: "role", old_value, new_value`; password changes are recorded as `field: "password"` with `metadata.changed`, no values
- `delete` — snapshot of the removed account

## Tests

`src/lib/roles.test.ts` (Vitest, `npm test`): legacy mapping (admin→superadmin, member→technician), superadmin total access, technician rejected for user administration, client rejected for the portal, plus fallbacks. End-to-end verification (dev): superadmin GET /users → 200; technician GET /users → redirected to `/` with zero user data in the response; client GET any internal page → 307 to `/no-access`; role change technician→project_manager produced the audit event with old/new values.
