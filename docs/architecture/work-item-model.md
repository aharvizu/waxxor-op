# WorkItem Model

> Status: adopted 2026-07-15. Implements E-05 (WorkItem core) and resolves TD-02 for tickets; PRD basis: `WorkItem` entity (§5) and "Activities and Tickets share common behavior whenever possible" (CLAUDE.md).
> Migrations: `drizzle/0005_light_amazoness.sql` (additive + data backfill) and `drizzle/0006_massive_ben_parker.sql` (cleanup). Invariants re-checkable with `npx tsx scripts/verify-work-items.ts`.

## 1. Why this model

Activities and Tickets share almost everything (title, status, priority, client, assignee, dates, time, comments-to-be, audit). The PRD's key rule R2 — *Activities can be converted into Tickets preserving history* — only works cheaply if both are views over the same row. `work_items` is that row; specializations attach 1:1.

## 2. The tables

```
work_items (shared)                      tickets (helpdesk specialization, 1:1)
├─ id                                    ├─ id                ← the visible ticket number (#id), unchanged
├─ organization_id  NOT NULL FK          ├─ organization_id   NOT NULL FK (isolation defense-in-depth)
├─ type: activity | ticket |             ├─ work_item_id      NOT NULL UNIQUE FK → work_items
│        project_activity                ├─ first_response_at (stamped on first comment)
├─ title, description                    ├─ resolved_at       (stamped on first transition to resolved)
├─ status: open | in_progress |          └─ closed_at         (stamped on first transition to closed)
│          waiting_on_customer |
│          resolved | closed
├─ priority: low|medium|high|critical
├─ client_id?, assignee_id?, created_by_id?
├─ start_date?, due_date?, completed_at?, estimated_minutes?
└─ created_at, updated_at

ticket_comments → tickets.id (untouched by the migration)
```

Indexes on `work_items`: organization_id, type, status, priority, client_id, assignee_id, due_date.

**Ticket columns added later**: `folio` + category/subcategory/channel/modality/contact arrived with the conversion step (`drizzle/0008`), and the SLA snapshot columns (definition reference, frozen minutes/calendar/timezone, targets, pause accounting) with `drizzle/0010` — see `docs/features/sla.md`. Still deferred: `resolution`/`confirmation`/billing fields (no business rules yet — OQ-04/OQ-12).

**Status enum**: shared and append-only. Tickets use the 11-status official lifecycle (`new`…`cancelled`, see `src/lib/tickets.ts`), activities their 7 (`pending`…`archived`); `cancelled` is shared. Legacy `open`/`waiting_on_customer` remain in the pg enum (unused) because Postgres enums can't drop values cheaply — data was migrated in `drizzle/0011`.

`created_by_id` stays nullable (as it was on tickets) so user-deletion semantics don't change.

## 3. Migration strategy (how the data moved)

1. **0005 (additive)**: create enums + `work_items` (+7 indexes); add `tickets.work_item_id` (nullable, unique, FK); then a `DO $$` block walks every ticket, inserts its work item (`status::text::work_item_status` cast) capturing the id with `RETURNING INTO`, and links it. Re-runnable (`WHERE work_item_id IS NULL`).
2. **0006 (cleanup)**: `SET NOT NULL` on the link; drop the moved columns (subject, description, status, priority, client_id, assignee_id, created_by_id, created_at, updated_at) and the old `ticket_status`/`ticket_priority` types.

Two migrations instead of one because drizzle-kit prompts interactively when a generate mixes created+deleted entities; purely-additive then purely-destructive generates need no TTY.

Verified with 3 pre-seeded legacy tickets (varied status/priority/client/assignee/comments): all fields and comments preserved; `tickets.id` values unchanged, so visible ticket numbers and `/helpdesk/[id]` URLs survive.

## 4. Domain utilities (`src/lib/work-items.ts`)

- `createWorkItem(tx, user, input)` — Zod-validates, stamps `organizationId` + `createdById` from the session, writes the `work_item` audit event. Always call inside the transaction that also writes the specialization.
- `updateWorkItemFields(tx, user, id, patch)` — org-scoped update of the common fields with per-field audit events and `updatedAt` bump; returns changed field names (`[]` no-op, `null` not found in org).
- `getWorkItemWithSpecialization(user, id)` — org-scoped fetch returning `{ item, ticket }`.
- `isWorkItemType` / `workItemTypeSchema` / `workItemStatusSchema` / `workItemPrioritySchema` — type validation for schemas and guards.

## 5. Creating a ticket (the pattern every specialization follows)

```ts
await db.transaction(async (tx) => {
  const item = await createWorkItem(tx, user, {
    type: "ticket",
    title: data.subject,
    description: data.description,
    priority: data.priority,
    clientId,          // re-validated against the org first
    assigneeId,
  });
  const [ticket] = await tx
    .insert(tickets)
    .values({ organizationId: user.organizationId, workItemId: item.id })
    .returning({ id: tickets.id });
  await recordAudit(tx, { organizationId: user.organizationId, userId: Number(user.id),
    entityType: "ticket", entityId: ticket.id, action: "create",
    metadata: { workItemId: item.id } });
});
```

Updates go through `updateWorkItemFields` for the common part; ticket-only behavior (lifecycle stamps) happens next to it in the same transaction — see `helpdesk/actions.ts`.

## 6. Strategy for future Activities

- `type: "activity"` (standalone, nullable client/date per R1) and `"project_activity"` (attached to a project List per R4) are already valid enum values.
- An `activities` specialization table is only needed if activities acquire exclusive fields; they may live as bare `work_items` rows.
- **Conversion Activity→Ticket (R2) is implemented** — see "Conversión Activity → Ticket" below.
- Activity statuses live in the shared enum since `drizzle/0007`.

## Conversión Activity → Ticket

Implemented 2026-07-15 (`src/lib/convert-activity.ts`, migration `drizzle/0008`). One transaction:

1. `UPDATE work_items SET type='ticket', status='open'` — **same id**, so the whole audit history stays attached; "Nuevo" is the helpdesk's initial `open` status. `completedAt` is cleared (previous state preserved in the audit metadata).
2. Insert the `tickets` specialization with the same `work_item_id` (the 1:1 unique index makes a double conversion impossible) and an immutable folio from the `ticket_folio_seq` sequence (`TK-000042`), generated inside the transaction. Regular helpdesk creation uses the same sequence.
3. The `activities` row becomes a **tombstone** (`converted_ticket_id` + `converted_at`): excluded from every activity query, and old `/activities/[id]` links redirect to the ticket.
4. Audit: a `convert` event on the work item (with `previous` state: type, status, priority, activityType, completedAt) plus the ticket's `create` event.

Blocks (validated both as pure rules and in the transaction): no client → rejected; archived → rejected; already converted → rejected; cancelled → requires explicit confirmation. Conversion is not automatically reversible. Verified by `scripts/verify-conversion.ts` (12 checks incl. both rollback directions).

## SLA (tickets only)

Since `drizzle/0010`, tickets carry an SLA **snapshot** (frozen at assignment from `sla_definitions` + the org's `business_calendars`): stable definition reference, applied name/minutes/mode/timezone/calendar, both targets and pause accounting. Definition edits never propagate to existing tickets. Statuses `waiting_on_customer`/`waiting_third_party` pause the SLA clock. Mechanics and math: `docs/features/sla.md`, `src/lib/sla.ts`, `src/lib/business-time.ts`.

## Time entries

`time_entries` (since `drizzle/0009`) hangs off `work_items.id` — one implementation covers activities and tickets, and conversion keeps time history attached automatically (same work item id). Totals are always computed from the table, never stored on the work item. See `docs/features/time-entries.md`.

## 7. Current limitations

1. ~~`ticket_comments`~~ — **resolved 2026-07-16**: comments were migrated into the conversations/messages model (`drizzle/0012`) as internal notes; activities still lack their own notes UI (future step).
2. ~~No files/attachments table~~ — **resolved 2026-07-16**: `attachments` metadata table (work item or message scoped) with a local-disk blob adapter; productive storage pending.
3. **`tasks` (project tasks) are not migrated** to `work_items` (explicitly out of scope; they await the Projects hierarchy step, E-09).
4. **Helpdesk forms still use the silent-fail pattern** — they now validate with Zod server-side, but don't render field errors (the ActionResult/useActionState migration of helpdesk screens is pending, per "minimal screen changes").
5. Status enum mixes helpdesk semantics; activity semantics pending (OQ-11).

## 8. Verification (2026-07-15, dev)

- `scripts/verify-work-items.ts`: one-to-one relation, org consistency ticket↔work_item, transactional creation (work_item + ticket + audit commit together), rollback of **both** rows when the audit insert fails — all PASS.
- HTTP smoke on the production build: the 3 migrated legacy tickets render identically (list, detail with description and both comments, dashboard); a new ticket created via the form got its work item + two `create` audit events atomically; status→resolved stamped `resolved_at` and audited `old/new`; a comment stamped `first_response_at`. All test data cleaned afterwards.
