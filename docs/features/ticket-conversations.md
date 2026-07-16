# Ticket Conversations & Internal Notes

> Status: shipped 2026-07-16 (Tickets Operativos feature). Implements the manual base of E-17 for tickets; PRD principle: "WhatsApp is a channel, not the system".
> **Nothing is sent externally in the MVP** — every interaction is logged manually; the model is channel-ready for real WhatsApp/email later.

## Model (migration `drizzle/0011` + `0012`)

**`conversations`** — one per ticket (unique `ticket_id`, cascade): organization_id, client_id (from the work item), `contact_id` (prepared — no Contact entity yet), channel (`manual` default), status text, timestamps.

**`messages`** — organization_id, conversation_id (cascade), `direction` (**inbound | outbound | internal**), author_user_id, `contact_id` (prepared), body, channel (**manual | whatsapp | email | phone | portal | internal**), occurred_at, `edited_at`, `metadata` jsonb, created_at. Indexes on conversation and occurred_at.

The legacy `ticket_comments` table was **migrated into messages** (direction `internal`, `metadata.migratedFromTicketCommentId`) and dropped in `drizzle/0012`.

## Composer kinds (`logMessage` action)

| Kind | direction | channel | Side effects |
|---|---|---|---|
| Message to client | outbound | selectable | Stamps SLA `first_response_at` on the **first** outbound (IS NULL guard — never overwritten; explicit button and future channels share the same guard) |
| Message received | inbound | selectable | — |
| Internal note | internal | internal | Never client-visible; editable by its author |
| Call | outbound | phone | `metadata.call = true` |
| Request confirmation | outbound | selectable | `metadata.confirmationRequest = true` + stamps `last_contact_attempt_at` |

Every message updates the conversation and the work item `updated_at`, and writes a `message create` audit event — all in one transaction with the first-response stamp.

## Unified timeline (ticket detail → Conversation tab)

Merged, newest-first: messages/notes/calls · operational audit (status, assignee, priority, category, SLA pauses, resolution, confirmation, close, reopen, billing) · time entries · related-activity link events. Icons distinguish inbound/outbound/note/call/audit/time.

## Editing & deletion policy

- **Internal notes**: only the **author** may edit (`editOwnNote`; `edited_at` stamped, old/new body audited). Client-facing messages are immutable.
- **Deletion**: only SuperAdmin (`deleteMessage`), hard delete with full snapshot in the audit event. Nobody else can remove messages.

## Mentions

Prepared, not implemented: `metadata` can carry a `mentions` array; no parsing or notifications exist yet (complex notifications are explicitly out of scope).

## Limitations / future

Real WhatsApp/email ingestion and sending (E-17) · Contact entity for `contact_id` columns · per-conversation status workflow (field exists, always `open`) · attachments on individual messages (schema supports `message_id`; UI attaches at ticket level for now).
