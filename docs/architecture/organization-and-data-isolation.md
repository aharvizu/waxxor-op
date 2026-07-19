# Organization & Data Isolation

> Status: adopted 2026-07-15. Resolves OQ-01 (tenancy): the schema is multi-organization-ready, the product runs as a single organization ("Watson") with no switcher, no multi-company admin, no way to change organization.
> Verified end-to-end with a temporary second organization (see §6); invariants re-checkable with `npx tsx scripts/verify-organization.ts` (core tables), `npx tsx scripts/verify-client360.ts` (contacts/services/contracts/renewals, added 2026-07-17), `npx tsx scripts/verify-projects.ts` (2026-07-17), `npx tsx scripts/verify-recurring.ts` (recurrence definitions/executions, added 2026-07-18), `npx tsx scripts/verify-reports.ts` (reports/versions/generation, added 2026-07-18: cross-org report lookup returns empty, cross-org generation rejected), `npx tsx scripts/verify-settings.ts` (settings/catalogs/api keys, added 2026-07-18: another org sees no settings or catalogs) and `npx tsx scripts/verify-inbox.ts` (conversations/messages/mentions, added 2026-07-19: another org sees no conversations).

## 1. Model

```
organizations (id, name, slug UNIQUE, status active|inactive, created_at, updated_at)
      │ 1
      └──* users, clients, contacts, services, client_services, contracts,
           client_notes, tickets, projects, tasks, quotes,
           report_templates, reports, kpis, audit_logs,
           recurrence_definitions, recurrence_executions,
           indicator_thresholds (unique (organization_id, key)),
           organization_settings (unique (organization_id, key)),
           catalog_items, api_keys, conversations
           (organization_id integer NOT NULL, FK → organizations)
```

- Default organization: **Watson** (`slug: watson`), created by migration `drizzle/0004_premium_songbird.sql`; the seed script is idempotent about it.
- **Child tables** (`ticket_comments`, `quote_items`, `kpi_entries`, `report_versions`, `conversation_participants`, `message_mentions`) deliberately have **no** `organization_id`: they belong to exactly one parent that has it, and every mutation on them first verifies the parent belongs to the caller's org. One source of truth, no denormalized column to drift.
- `audit_logs.organization_id` is NOT NULL — every audit event belongs to an organization (`AuditEvent.organizationId` is a required field in `src/lib/audit.ts`).

## 2. Isolation strategy

Application-level scoping (no Postgres RLS yet):

1. **The org comes from the session, never from the client.** `users.organization_id` is written into the JWT at sign-in and exposed as `session.user.organizationId`. JWTs issued before this migration lack it — `requireUser()` sends those sessions to `/login` once to refresh.
2. **Every query filters by it.** All list/detail pages and the dashboard add `eq(table.organizationId, user.organizationId)` (detail pages combine it with the id, so guessing another org's URL yields the 404 page — verified, zero data in the response).
3. **Every insert stamps it.** Create actions write `organizationId: user.organizationId` server-side.
4. **Foreign ids from forms are re-validated.** Select inputs post ids (`clientId`, `assigneeId`, `projectId`, `quoteId`, `kpiId`, `templateId`, `ticketId`, `serviceId`, `contactId`, `accountOwnerId`, `defaultTechnicianId`); each action resolves them **within the org** (e.g. `orgClientId`, `orgUserId` helpers) and nulls/rejects anything foreign — a tampered id from another org cannot be attached.
5. **`organizationId` can never arrive via FormData.** Zod schemas don't declare it (`parseForm` strips unknown keys — unit-tested) and legacy `fields()` parsers never read it. Verified live: posting `organizationId=1` as another org's user still created the row in the caller's org.

## 3. Getting the organizationId (the only correct way)

```ts
const user = await requireUser();        // or requireRole(...)
user.organizationId                       // number, guaranteed
```

Never read it from `formData`, params, cookies or headers. Never default it.

## 4. Safe query example

```ts
// list
const rows = await db
  .select()
  .from(clients)
  .where(eq(clients.organizationId, user.organizationId));

// detail — id AND org, always together
const [client] = await db
  .select()
  .from(clients)
  .where(and(eq(clients.id, id), eq(clients.organizationId, user.organizationId)));

// insert — stamp the org server-side
await tx.insert(clients).values({ ...data, organizationId: user.organizationId });
```

## 5. Migration (`drizzle/0004_premium_songbird.sql`)

Order matters — drizzle-kit's generated SQL was rewritten because `ADD COLUMN ... NOT NULL` fails on populated tables:

1. Create `organizations` + insert Watson (`ON CONFLICT DO NOTHING`, re-runnable).
2. `ADD COLUMN organization_id` (nullable) on the 9 business tables.
3. `UPDATE ... SET organization_id = (SELECT id FROM organizations WHERE slug='watson') WHERE organization_id IS NULL` on all tables, including the pre-existing nullable column on `audit_logs`.
4. `SET NOT NULL` + FK constraints on all 10 tables.

Verified after applying: every table reports `total == with_org` (users 1/1, projects 1/1, tasks 3/3, report_templates 2/2, rest empty) — no record lost.

## 6. Isolation evidence (2026-07-15, dev)

With a temporary second org (`Isolation Test Org`) and one client in each org:

- Org-1 superadmin on `/clients`: sees org-1's client, **zero** occurrences of org-2's.
- Org-2 superadmin on `/clients`: the reverse.
- Org-2 opening org-1's client detail URL: not-found page, secret name absent from the response body.
- Org-2 posting the create-client form with an injected `organizationId=1` field: row created with `organization_id = 2`, and its audit `create` event also `organization_id = 2`.
- All test data (org 2, its user/clients/audit rows) removed afterwards; only Watson remains.

## 7. Current limitations

1. **No DB-level enforcement (RLS)** — isolation lives in application code; a query that forgets the filter is a bug, not a blocked operation. Revisit Postgres RLS if real multi-tenancy ever activates.
2. **Single visible organization by design** — no switcher, no org administration, no way to create orgs from the UI (PRD: one org today; step 10 of this change).
3. **Email uniqueness is global**, not per-org — acceptable while one org exists.
4. **Users cannot move between orgs** — no flow exists, intentionally.
5. **Stale JWTs** (pre-migration) are forced through one re-login; role changes still apply on next sign-in (TD-11, unchanged).
