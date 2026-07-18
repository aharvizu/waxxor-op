# Audit Log Convention

> Status: adopted 2026-07-15. Reference implementation: the **Clients** module.
> Implements the base of E-15 (epics.md) and starts resolving TD-01 (technical-debt.md).
> PRD principle: "Audit everything important" / CLAUDE.md: "Everything important must be auditable."

## Table: `audit_logs` (migration `drizzle/0002_clear_cammi.sql`)

| Column | Type | Notes |
|---|---|---|
| `id` | serial PK | |
| `organization_id` | integer, **NOT NULL**, FK → organizations | Required on every event since the organization migration (`drizzle/0004`); comes from the session user. |
| `user_id` | integer, nullable, FK → users **on delete set null** | The actor. `set null` so audit rows never block user deletion and outlive the account. |
| `entity_type` | text | Lower-case entity name: `client`, `user`, `work_item`, `ticket`, `activity`, `time_entry`, `sla_definition`, `business_calendar`, `message`, `attachment`, `operational_reminder`, `conversation`, `contact`, `service`, `client_service`, `contract`, `client_note`, `project`, `project_member`, `project_list`, `project_milestone`, `project_risk`, `project_comment`, `work_item_dependency`, `recurrence_definition`, `recurrence_execution`, `report`, `report_template`, `indicator_threshold`, `organization_setting`, `catalog_item`, `api_key`, `ticket_comment` (legacy) |
| `entity_id` | integer | PK of the affected row |
| `action` | text | `"create"`, `"update"`, `"delete"` (free text so future actions like `"convert"` need no migration) |
| `field` | text, nullable | Set on `update` events: the changed column (camelCase, as in the Drizzle schema) |
| `old_value` / `new_value` | text, nullable | Stringified values (dates as ISO); `null` means the value was empty |
| `metadata` | jsonb, nullable | Free-form context; on `create` holds `{ values: {...} }` snapshot |
| `source` | text, default `"web"` | Channel: `"web"` (server actions), `"seed"`, `"system"` (scheduler-originated writes — the legacy-tasks migration and, since 2026-07-18, every object the Recurrences engine generates), `"api"` |
| `created_at` | timestamp, default now | |

Indexes: `(entity_type, entity_id)` for per-entity history, `(created_at)` for time-range queries.

## Event shapes

- **create** → one row. `field/old_value/new_value` null; full snapshot of the inserted values in `metadata.values`.
- **Ticket lifecycle events** ride on `update` rows with a discriminating `metadata.event`: `ticket_resolved`, `ticket_closed` (with final SLA compliance), `ticket_reopened` (with reason and previous stamps), `time_exception_granted`, `sla_pause_start`/`sla_pause_end` (with minutes), `first_response_registered`, `activity_linked`/`activity_unlinked`, `billing_set_at_close`, `note_edited`.
- **update** → **one row per changed field**, each with `field`, `old_value`, `new_value`. Unchanged fields produce no rows; a no-change submit produces no rows at all (and skips the DB write).
- **delete** → one row; snapshot of the deleted record in `metadata.values` (no reference implementation yet).

## Utility: `src/lib/audit.ts`

- `recordAudit(tx, event | event[])` — single batched insert on the given executor (`DbExecutor`). Call it **inside the same `db.transaction` as the business write** and it throws on failure, rolling back both — see `docs/architecture/database-transactions.md`.
- `diffFields(base, before, after, fields)` — compares two records over an explicit field list and returns one update event per real change (values normalized to strings first, so `null` vs `"x"` compares correctly).

## Usage pattern (see `clients/actions.ts`)

```ts
// create: business write + audit in ONE transaction
await db.transaction(async (tx) => {
  const [created] = await tx.insert(clients).values(data).returning({ id: clients.id });
  await recordAudit(tx, {
    userId: Number(user.id), entityType: "client", entityId: created.id,
    action: "create", metadata: { values: data },
  });
});

// update: read before-image → diff → write + audit atomically (skip if no changes)
await db.transaction(async (tx) => {
  const [before] = await tx.select().from(clients).where(eq(clients.id, id));
  const changes = diffFields({ userId, entityType: "client", entityId: id }, before, values, auditedFields);
  if (changes.length === 0) return;
  await tx.update(clients).set(values).where(eq(clients.id, id));
  await recordAudit(tx, changes);
});
```

Rules:

1. Audit **in the same transaction** as the business write — both commit or neither does.
2. Each module declares its `auditedFields` list explicitly — never audit blindly (avoids leaking things like `password_hash` when users are migrated).
3. `entity_type` values are stable, lower-case identifiers; changing one breaks history queries.
4. Reads are never audited.

## Current limitations (accepted, documented)

1. ~~Not atomic with the business write~~ — **resolved 2026-07-15**: the driver moved to `neon-serverless`/WebSocket (see `database-transactions.md`); `recordAudit` now joins the caller's transaction and an audit failure rolls back the business write.
2. ~~`organization_id` is always null~~ — **resolved 2026-07-15**: mandatory and FK-backed since `drizzle/0004` (see `organization-and-data-isolation.md`).
3. **No "from where" detail beyond channel**: `source` distinguishes web/seed/system, but IP/user-agent capture (via `headers()`) is deliberately deferred — add to `metadata` when there's a requirement.
4. **UI**: tickets expose their full trail in the detail's History tab (2026-07-16); Client 360's Historial tab (2026-07-17) shows a plain-language timeline to every internal role and the raw technical log to SuperAdmin/Administrator only (`describeClientAuditEvent` in `src/lib/client360.ts`). **The global audit browser shipped 2026-07-18** at `/settings/audit` (filters by entity/action/actor/id/date + CSV export via `/api/audit/export`, SuperAdmin/Administrator only) — see `docs/features/settings.md`.

## Coverage

| Module | create | update | delete |
|---|---|---|---|
| Clients | ✅ | ✅ (per-field) | — (no delete flow exists) |
| Users | ✅ (incl. `user_invited`) | ✅ (incl. role/password events · `invitation_accepted`/`regenerated` · `user_activated`/`user_deactivated` with reassignment counts) | ✅ (snapshot) |
| Work items (shared) | ✅ | ✅ (per-field) | ✅ via ticket deletion |
| Tickets | ✅ | ✅ (lifecycle, SLA, billing, confirmation, reopen, exception) | ✅ (SuperAdmin, snapshot) |
| Activities | ✅ | ✅ (incl. archive/restore, link/unlink, convert) | — (archive instead) |
| Time entries | ✅ | ✅ (incl. void) | ✅ (SuperAdmin, snapshot) |
| SLA definitions / calendar | ✅ | ✅ | — (deactivate instead) |
| Messages / attachments | ✅ | ✅ (note edits) | ✅ (SuperAdmin, snapshot) |
| Reminders (No olvides) / conversations | — (computed) | ✅ (snooze/dismiss/resolve · attended) | — |
| Contacts | ✅ | ✅ (per-field · `primary_contact_changed` · archive/restore) | ✅ (SuperAdmin, snapshot, blocked while referenced) |
| Services catalog | ✅ | — (no edit flow yet) | — |
| Client services / licenses | ✅ | ✅ (per-field · `renewal_updated`) | — (cancel/archive instead) |
| Contracts | ✅ | ✅ (per-field · `renewal_updated`) | ✅ (SuperAdmin, snapshot) |
| Client notes | ✅ | ✅ (`note_edited`, author-only) | — |
| Projects | ✅ | ✅ (per-field · status/health incl. `health_set_manually`, `completed_with_exception`, `archived`/`restored`) | ✅ (SuperAdmin, snapshot, blocked with activities) |
| Project members / lists / milestones / risks / comments | ✅ | ✅ (per-field + lifecycle events, all carrying `metadata.projectId`) | — (soft flows) |
| Work item dependencies | ✅ | — | ✅ |
| Project activities | ✅ (create incl. project/list/parent) | ✅ (`moved_to_list`, `hierarchy_changed`, `completed_while_blocked`; conversion adds `unlinkedProjectId`) | — (archive instead) |
| Recurrence definitions | ✅ | ✅ (per-field + lifecycle events: `activated`, `paused`, `reactivated`, `archived`, `restored`, `occurrence_skipped`, `backfill`, `auto_paused_on_failures`, `health`/`template_updated`) | ✅ (SuperAdmin, blocked while it generated objects) |
| Recurrence executions | — (create is the run itself) | ✅ (`retried`) | — |
| Generated objects (activity/ticket/report via recurrence) | ✅ (`source: "system"`, `metadata.generatedByRecurrenceId`) | — | — |
| Reports | ✅ | ✅ (per-field + lifecycle: `generated`/`regenerated` (with version), `generation_failed`, `changes_requested`, `approved`, `sent`/`sent_with_exception`, `approval_invalidated_by_edit`, `archived`/`restored`, `duplicated`, `exported_csv`) | ✅ (SuperAdmin, snapshot; versions cascade) |
| Report templates | ✅ | ✅ (per-field) | — (archive instead) |
| Indicator thresholds | ✅ (upsert) | ✅ (`threshold_set` with old default/value → new value) | — |
| Organization settings | ✅ (`setting_saved`, logos redacted) | ✅ (old/new JSON per section) | — |
| Catalog items | ✅ | ✅ (rename · archive/restore) | ✅ (SuperAdmin, snapshot, blocked with children) |
| API keys | ✅ (name/prefix only — never token or hash) | ✅ (`api_key_revoked`) | — (revoke instead) |

Verified end-to-end on 2026-07-15 against the dev database: create produced one `create` event with full snapshot; an edit changing two fields produced exactly two `update` events with correct old/new values (test rows cleaned up afterwards).
