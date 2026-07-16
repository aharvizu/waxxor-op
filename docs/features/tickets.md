# Tickets (Helpdesk)

> Documented 2026-07-15 alongside the Activity → Ticket conversion. Model details: `docs/architecture/work-item-model.md`.

## Model

A ticket is a `work_items` row (`type: "ticket"`) plus its 1:1 specialization `tickets`:

| From WorkItem (shared) | From `tickets` (helpdesk-only) |
|---|---|
| title (subject), description | `folio` — unique, immutable, `TK-######` from the `ticket_folio_seq` sequence, generated inside the creating transaction (form creation and conversion alike) |
| status: **new · assigned · in_progress · waiting_customer · waiting_third_party · scheduled · resolved · pending_confirmation · closed · reopened · cancelled** | `category` / `subcategory` — free text for now (catalogs pending, OQ-09) |
| priority, clientId?, assigneeId?, createdById | `channel` (email, phone, whatsapp, portal, in_person, internal) and `modality` (remote/on-site) — provisional value sets |
| dates, estimatedMinutes, organizationId | `contact` — free text (the Contact entity doesn't exist yet) |
| | `first_response_at` (explicit button or first comment) · `resolved_at` / `closed_at` (first transition into each state) |
| | SLA snapshot: definition reference + name, minutes, mode, timezone, calendar, both targets, paused minutes/open pause — see `docs/features/sla.md` |

`ticket_comments` hang off `tickets.id`. The visible ticket number remains `tickets.id` (`#12`); the folio is displayed on the ticket detail.

## Ways a ticket is born

1. **Helpdesk form** (`/helpdesk/new`): subject, description, priority, client, assignee. Folio generated automatically; category/channel/modality stay empty until those flows exist.
2. **Converted from an activity** (`/activities/[id]/convert`): keeps the same WorkItem (id, history, audit trail), starts as **open** ("Nuevo"), and carries category, subcategory, channel, modality and contact from the conversion form. The audit trail shows the `convert` event with the previous activity state. See "Conversión Activity → Ticket" below.

## Conversión Activity → Ticket

- Same `work_items.id` — no duplicate is ever created (enforced by the unique `work_item_id`).
- The ticket starts in `open` regardless of the activity's previous status; the previous status/priority/type/completedAt live in the `convert` audit event's metadata.
- The source activity remains as a deactivated tombstone: gone from every activities view, and its old URL redirects to the ticket.
- Not automatically reversible (a Ticket→Activity flow would be a separate, deliberate feature).
- Blocks: no client (must pick one), archived (restore first), already converted, cancelled without explicit confirmation.
- Any internal role can convert; `client`-role accounts cannot (no portal access).

## Rules

- Tickets never belong to Projects (PRD R3) — no project linkage exists on tickets.

## Lifecycle & transitions (`src/lib/tickets.ts`)

Official statuses (11): `new` → `assigned` (automatic when a new ticket gets an assignee) → `in_progress` / `scheduled` / `waiting_customer` / `waiting_third_party` (the two waiting states **pause the SLA**) → `resolved` → `pending_confirmation` → `closed`; `reopened` (from resolved/pending_confirmation/closed/cancelled, any internal user, reason required and audited); `cancelled` (a status — never deletes). Transitions are validated by `canTransition` (unit-tested matrix); invalid jumps (e.g. new → closed) are rejected with a visible business error and no state change. Resolution/confirmation/closure/reopen run through dedicated actions, never the generic status dropdown. Legacy `open`/`waiting_on_customer` values were migrated in `drizzle/0011`.

## Resolution, confirmation & closure

- **Resolve** asks for resolution text, category (+optional subcategory), shows the registered time, and the next step: `pending_confirmation` or close directly. First transition stamps `resolved_at`.
- **Confirmation types**: whatsapp · phone · email · verbal · no_response · not_required, with `confirmation_at`, optional notes/channel, `confirmed_by_contact_id` (prepared) and `last_contact_attempt_at` (stamped by "Request confirmation" messages).
- **Closing requires**: resolution + category + confirmation type + at least one active TimeEntry — or an explicit **time exception** with a reason (internal users only, audited as `time_exception_granted`). At close: `closed_at` stamps, **final SLA compliance freezes** (`sla_first_response_met` / `sla_resolution_met`), `resolved_at` is preserved, and if billing is still `pending_review` the form asks for a decision (never auto-billable). A failed closure rolls back the whole transaction — no partial state (verified: a rejected resolve-and-close left the ticket exactly as before).
- **Reopen** clears `closed_at`/`resolved_at`/confirmation for the new cycle (previous values preserved in the audit event), increments `reopen_count` and records the reason.
- **Permanent deletion**: SuperAdmin only, full snapshot audited; related activities are unlinked, conversation/time/attachments removed in the same transaction.

## Related activities

Activities can support a ticket via `activities.parent_ticket_id` (they stay independent work items of type `activity`). Create from the ticket, link eligible existing ones (never archived, converted, already-linked, project items or other orgs), unlink, open their detail, complete/reassign there. The tab shows total/completed/open/overdue chips. Completing all activities **never** closes the ticket.

## Conversations, notes & files

See `docs/features/ticket-conversations.md`. Attachments: metadata in `attachments` (filename, mime, size, storage key, uploader), blobs on the local-disk adapter (`src/lib/attachments.ts`, 15 MB cap, org-scoped download route `/api/attachments/[id]`); deletion is SuperAdmin-only. **Productive storage is pending and needs approval before integrating a provider.**

## Billing

See `docs/features/ticket-billing.md`.

- SLA assignment on creation/conversion (explicit by SuperAdmin → priority default → none), snapshotted; the detail shows the SLA panel with targets, health and first response.
- All mutations are Zod-validated (empty selects normalized — never blind enum casts), transactional with their audit events, org-scoped, and return visible errors via the ActionResult convention.

## Time tracking

Shipped 2026-07-15: the ticket detail includes the shared **Time** card (`TimeEntriesCard`) — manual sessions per technician with totals, billable time, per-tech rollup, inline edit and voiding. See `docs/features/time-entries.md`.

## UI

- **List** (`/helpdesk`): 14 saved views (All, New, Unassigned, Mine, In progress, Waiting customer, Waiting third party, Due soon, Overdue, Pending confirmation, Billable, Recurrent — reserved and empty until Recurrence ships —, Closed, Reopened), 12 columns (folio, title, client, assignee, status, priority, category, SLA, due, time, billing, updated), 9 filters (status, priority, client, assignee, category, SLA, billing, channel, created from/to) and inline row actions (assign / status / priority, submit-on-change) plus the row link as Quick View.
- **Detail** (`/helpdesk/[id]`): header with folio, inline-editable title, status/priority/billing/SLA/reopen badges, total time and primary actions (Respond, Log time, Resolve/Close, status change, Reopen, SuperAdmin Delete); center tabs Conversation · Activities · Time · Files · History · Resolution; right panel with SLA, Billing and inline-editable details (client, contact, category, subcategory, channel, modality, assignee, priority). No modals — everything is inline sections/tabs.

## Pending

Category/channel catalogs (OQ-09) · Contact entity for confirmation/messages · collaborators (needs its own table) · Kanban/calendar/persistent custom views · productive attachment storage · SLA breach notifications and compliance reports · note editing has no HTTP-driven test (client-side form; covered by the manual checklist).
