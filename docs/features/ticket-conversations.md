# Ticket Conversations & Internal Notes

> Status: shipped 2026-07-16 (Tickets Operativos feature); **writes moved onto the shared Inbox service 2026-07-19** — see `docs/features/inbox.md` for the full conversation model (participants, mentions, logical delete, statuses, channel adapters). This document stays as the ticket-side composer reference.
> **Nothing is sent externally in the MVP** — every interaction is logged manually; the model is channel-ready for real WhatsApp/email later.

## Model (migration `drizzle/0011` + `0012`, extended by `0019` for Inbox)

**`conversations`** — historically one per ticket (unique `ticket_id`, cascade, still enforced when non-null): organization_id, client_id (from the work item), `contact_id`, channel, status. **Since Inbox (2026-07-19)**, `ticketId` is optional and the row also carries `workItemId`/`projectId`/`subject` — a conversation is no longer ticket-exclusive, but a ticket still gets at most one.

**`messages`** — organization_id, conversation_id (cascade), `direction` (**inbound | outbound | internal | system**), author_user_id, `contact_id`, body, channel (**manual | whatsapp | email | phone | portal | internal | teams | api**), occurred_at, `edited_at`, `deletedAt`/`deletedById` (logical delete, since Inbox), `metadata` jsonb, created_at. Indexes on conversation and occurred_at.

The legacy `ticket_comments` table was **migrated into messages** (direction `internal`, `metadata.migratedFromTicketCommentId`) and dropped in `drizzle/0012`.

## Shared write path (since 2026-07-19)

`logMessage` no longer inserts the message/audit/SLA-stamp inline — it calls **`postConversationMessage`** (`src/lib/conversations.ts`), the same service `/inbox` uses. The message write, the conversation bump, the author's read cursor and the SLA first-response stamp live in exactly one place; the confirmation-request `lastContactAttemptAt` stamp stays ticket-specific in `logMessage`.

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

- **Internal notes**: only the **author** may edit (`editOwnNote`; `edited_at` stamped, old/new body audited). Client-facing messages are immutable **on this ticket-only entry point** — from `/inbox`, any message (not just notes) follows the ownership rule in `canEditMessage` (author, not deleted, not a system event). Both entry points write through the same `messages` table.
- **Deletion**: `deleteMessage` here is **hard delete, SuperAdmin only** (unchanged, ticket-scoped). `/inbox` additionally offers **logical delete** by the message's own author (`deletedAt`/`deletedById`, row and audit preserved) — the two are complementary, not conflicting: hard delete stays the SuperAdmin-only destructive path.

## Mentions

**Implemented via Inbox (2026-07-19)**: explicit mentions (composer checkboxes, never `@`-parsing) live in `message_mentions`, surfaced in Hoy and `/inbox?view=mentions`. See `docs/features/inbox.md`.

## Limitations / future

Real WhatsApp/email ingestion and sending (E-17, adapters prepared in `src/lib/channels.ts`, none configured) · Contact entity for `contact_id` columns · per-conversation status workflow (**resolved 2026-07-19** — open/pending/closed/archived, see `docs/features/inbox.md`) · attachments on individual messages (**resolved 2026-07-19** via Inbox's composer; the ticket Composer above still attaches at ticket level).
