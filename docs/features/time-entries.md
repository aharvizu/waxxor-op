# Time Entries

> Status: shipped 2026-07-15. Implements E-11 (manual time tracking) on the WorkItem base.
> PRD rule R5: **manual time entry only in MVP** — no timer exists, by design.

## Objective

Log manual work sessions against any work item — activities and tickets alike — including sessions performed by several technicians, as the raw data for future productivity and profitability metrics.

## Model (`time_entries`, migration `drizzle/0009_dashing_darwin.sql`)

| Field | Notes |
|---|---|
| `organization_id`, `work_item_id`, `user_id` | All NOT NULL FKs. The entry hangs off the **work item**, so one implementation serves activities and tickets. `user_id` = the technician who worked. |
| `date`, `duration_minutes` | Manual session; minimum 1 whole minute. |
| `time_type` | 12 values: technical_work, remote_support, onsite_support, travel, waiting_customer, waiting_provider, research, documentation, meeting, training, administration, commercial. Default technical_work. |
| `billing_status` | billable · non_billable · included_in_contract · pending_review (default). |
| `modality` | remote · onsite · not_applicable (default). |
| `description` (required), `result` (optional) | |
| `hourly_rate`, `internal_hourly_cost` | Optional in this phase (contract-driven rates are future scope). |
| `calculated_amount`, `calculated_internal_cost` | Server-computed: `round(minutes / 60 × rate, 2)` (`calculateAmount` in `src/lib/time-entries.ts`), recomputed on every edit. Null without a rate. |
| `voided_at` | **Voiding replaces deletion**: the row stays, is excluded from all totals, and becomes read-only. |
| `created_by_id`, timestamps | Creator from the session (may differ from `user_id`). |

Indexes: organization_id, work_item_id, user_id, date, billing_status, time_type.

**Multiple technicians**: the schema is one row per technician; the add-form accepts a multi-select and creates one entry per selected technician in a single transaction (same session data).

## Rules

1. No timer; sessions are logged manually (R5).
2. Duration ≥ 1 minute (Zod).
3. Any internal user can log time, for themselves or any other **internal** user of the org (client-role users are never selectable and cannot access the portal at all).
4. `organizationId` and `createdById` always come from the session.
5. Rates optional; when present, amount and internal cost are calculated automatically.
6. Voiding keeps the record for traceability; every edit/void is audited per field. Hard delete exists but is **SuperAdmin-only** and only for already-voided entries (UI); it audits a full snapshot.
7. Totals (registered, billable, amounts, per-technician) are **always computed with SUM/reduce over time_entries** — nothing is stored on the work item.

## UI

`TimeEntriesCard` (shared server component) mounted on the **activity detail** and **ticket detail**:

- Header badges: total time, billable time, total amount (when rates exist).
- Per-technician rollup chips.
- Session list: date, technician, type, duration, billing badge, amount, description/result; voided entries greyed with a "Voided" badge.
- Row actions: inline **edit** (all fields, recalculates), **void**; **delete** (superadmin, voided rows only).
- Add form: technician multi-select (defaults to the current user), date (today), minutes, type, billing, modality, rates, description, result. ActionResult convention with field errors.
- Archived activities show the card read-only.

## Server actions (`src/app/(app)/time-entries/actions.ts`)

`createTimeEntry` (multi-technician) · `updateTimeEntry` · `voidTimeEntry` · `deleteTimeEntry` (superadmin). All Zod-validated, transactional with their audit events, org-scoped, ActionResult errors.

## Verified (2026-07-15, dev)

Script `scripts/verify-time-entries.ts` (9 checks): log on activity and ticket; two technicians on one work item (135m total); amount `90m × $100 = 150.00` and internal cost `90m × $40 = 60.00`; edit recalculates (`120m → 200.00`) with per-field audit; void keeps the row and drops it from totals; audit trail ≥6 events; rollback when audit fails; org isolation. Plus UI smoke over HTTP: entry created through the form (75m × $80 → $100.00 amount, × $30 → $37.50 cost), totals rendered on the card. Unit tests: catalogs, duration validation, both calculations, money validation, per-tech summary, formatting (11 tests).

## Ticket closure & billing integration

Since 2026-07-16: closing a ticket requires at least one **active** (non-voided) time entry, or an audited time exception; ticket billing computes from non-voided entries marked `billable` (see `docs/features/ticket-billing.md`). Time entries also appear in the ticket's unified timeline.

## Postponed

Contract-driven rates · monthly billing runs · full profitability · global day timeline · per-technician capacity · timer.
