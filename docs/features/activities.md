# Activities

> Status: shipped 2026-07-15. Implements E-06 (Activities) on the WorkItem base (E-05).
> PRD rules honored: R1 — *Activities may exist without client or date*; "Nothing should be forgotten."

## Objective

Capture standalone work — follow-ups, meetings, internal tasks, reminders — that is neither a helpdesk ticket nor (yet) a project item. Anything can be logged with just a title; structure (client, dates, owner) is optional and can arrive later.

## Model & fields

An Activity is a `work_items` row (`type: "activity"`) plus its 1:1 specialization `activities` (migration `drizzle/0007_shiny_spyke.sql`):

| From WorkItem (shared) | From `activities` (specialized) |
|---|---|
| title **(only required field)** | `activity_type` (default `general`) |
| description | `recurrence_template_id` — **prepared, unused**: plain nullable column, no FK until the Recurrence module (E-10) exists |
| status, priority (default medium) | `archived_at` — archiving is soft; nothing is ever deleted |
| clientId?, assigneeId?, createdById | organization_id, work_item_id (unique) |
| startDate?, dueDate?, completedAt, estimatedMinutes? | |

## Statuses (7)

`pending` (default) · `in_progress` · `waiting` · `blocked` · `completed` · `cancelled` · `archived`

Added to the shared `work_item_status` enum (additive `ALTER TYPE`, as planned in `work-item-model.md`). Each module validates its own subset: helpdesk actions now use `ticketStatusSchema`, activities use `activityStatusSchema` — a ticket can never take `pending`, an activity can never take `resolved`. `archived` can only be reached through the archive action, never the status dropdown (`activityWorkflowStatusSchema` excludes it).

## Types (12)

general · follow_up · meeting · research · documentation · training · review · implementation · preventive · administrative · commercial · reminder (`activity_type` enum).

## Rules (implemented and tested)

1. Only the title is required; client, assignee and dates optional (R1).
2. `organizationId` always comes from the session; foreign ids (client/assignee) are re-validated inside the org.
3. Completing sets `completedAt`; reopening a completed activity clears it (`completedAtFor` in `src/lib/activities.ts`; also applies when the status dropdown moves in/out of completed).
4. Archiving stamps `archivedAt` + status `archived` and never deletes; the detail page becomes read-only until restored.
5. Restoring derives the status: completed activities come back `completed`, everything else `pending` (`restoredStatus`).
6. All mutations: Zod-validated, transactional (work_item + specialization + audit commit or roll back together), audited per field, errors surfaced through the ActionResult convention (`FormAlert`/`FieldError`).

## Permissions

Any internal role (superadmin, administrator, director, project_manager, technician) has full access — the fine-grained matrix is still OQ-10. `client`-role accounts are rejected at `/no-access` like everywhere else (verified over HTTP).

## Routes & screens

| Route | Screen |
|---|---|
| `/activities` | List: view tabs **All / Mine / Unassigned / Overdue / No date / Completed / Archived** + filters by status, priority, assignee, client, type (GET form). Overdue dates render in red. Non-archived views always exclude archived rows. |
| `/activities/new` | Creation form (`ActivityForm`) |
| `/activities/[id]` | Detail: quick actions (Complete/Reopen, Archive/Restore), Details edit form, Workflow card (status + assignee). Archived items show a read-only summary. |

Navigation: "Activities" added to the sidebar under **Operations** (first item, matching the PRD module order), to the ⌘K command menu (Navigate + Create) and to the topbar quick-create menu.

## Server actions (`activities/actions.ts`)

`createActivity` · `updateActivityDetails` (title, description, type, priority, client, dates, estimate) · `updateActivityWorkflow` (status + assignee; blocked while archived) · `completeActivity` · `reopenActivity` · `archiveActivity` · `restoreActivity`. All follow the skeleton in `action-validation.md`.

## Acceptance criteria (verified 2026-07-15, dev)

- Create with title only → row with nulls everywhere else — script PASS.
- Complete/reopen toggle `completedAt` — script PASS + full UI cycle over HTTP.
- Archive keeps the row; restore derives status — script PASS + UI cycle with per-field audit (`status pending→archived→pending→completed`, `archivedAt` set→cleared, `completedAt` stamped).
- Audit trail on every mutation (≥6 events in the scripted lifecycle) — PASS.
- Rollback: forced audit failure rolls back work_item + activity — PASS.
- Org isolation: another org's user gets `null` for the same activity — PASS.
- Client role → 307 `/no-access` — PASS.
- Unit tests: type/status validation (incl. cross-contamination with ticket statuses), completedAt rule, restore rule — 9 tests.

Re-run anytime: `npm test` and `npx tsx scripts/verify-activities.ts`.

## Conversión Activity → Ticket

Shipped 2026-07-15. "Convert to ticket" lives in the activity detail (not in the list — the table has no per-row menus yet). It opens `/activities/[id]/convert`, which asks only for what a ticket needs: client (required — preselected if the activity has one), optional contact, category (required), optional subcategory, channel, modality (remote/on-site), priority and optional assignee. Rules: activities without client cannot convert until one is selected; archived ones cannot convert (the page bounces back); cancelled ones require an explicit confirmation checkbox; completed ones convert into a ticket that starts as **Open** ("Nuevo"); since 2026-07-17, activities that belong to a **project** require an extra confirmation (converting unlinks them from the project and its list — PRD R3) and activities with **subactivities** cannot convert until those are resolved (see `docs/features/project-activities.md`). After converting: redirect to the ticket, the activity disappears from every activities view, and old activity links redirect to the ticket (its row remains as a tombstone). Not automatically reversible. Full mechanics: `docs/architecture/work-item-model.md`.

## Related to tickets

Since 2026-07-16 an activity can support a ticket (`parent_ticket_id`): created from the ticket's Activities tab or linked there if eligible (not archived, not converted, not already linked, same organization). Linked activities keep their own status, priority, assignee, dates, time and detail page; completing them never closes the parent ticket. PRD R3 still holds: these are activities, tickets themselves never join projects.

## Conversaciones (2026-07-19)

El detalle de actividad gana el botón "Conversaciones" (`/inbox?workItemId=`) que abre la bandeja unificada filtrada a los hilos de esa actividad — sin un módulo de mensajería paralelo. Ver `docs/features/inbox.md`.

## Time tracking

Shipped 2026-07-15: the activity detail includes the shared **Time** card (`TimeEntriesCard`) — manual sessions per technician with totals, billable time, per-tech rollup, inline edit and voiding. Archived activities show it read-only. See `docs/features/time-entries.md`.

## Postponed (explicitly out of this step)

~~Subactivities (OQ-08)~~ and ~~project hierarchy (E-09)~~ shipped 2026-07-17 (`docs/features/projects.md`: `activities.project_id`/`project_list_id`/`parent_activity_id`, max two levels). ~~Recurrence execution (only the column is prepared)~~ shipped 2026-07-18: `activities.recurrence_template_id` remains the legacy unused column, but recurrence-generated activities now exist for real — created through `createWorkItem` exactly like a manual activity, tagged only in `audit_logs.metadata.generatedByRecurrenceId` (no new FK on `activities`, keeps the table shape stable). See `docs/features/recurring.md`. Still future: comments on standalone activities · Kanban/calendar/Gantt views · convert action in the list's contextual menu (no per-row menu architecture yet).
