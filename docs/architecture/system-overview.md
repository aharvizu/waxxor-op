# Watson — System Overview

> Source: `docs/prd/Watson_PRD_v1.0.docx` (PRD v1.0, living document).
> This document derives architecture context from the PRD. It does not add functionality. Anything the PRD does not define is marked as **[open — see decisions/open-questions.md]**.

## 1. Purpose

Watson is an Operations OS for technology service companies. It unifies activities, helpdesk tickets, projects, clients, contracts, services, reporting, operational metrics and (future) messaging in a single platform.

Core promise: **"Nothing should be forgotten."**

Success criterion (PRD §11): Watson completely replaces ClickUp and the current Helpdesk for Waxxor daily operations.

## 2. Product Principles (PRD §3)

These principles constrain every architectural decision:

1. **Work first, modules second** — the unit of value is the work item, not the module boundary.
2. **One source of truth** — no duplicated records across modules.
3. **Audit everything important** — auditing is a cross-cutting concern, not a feature bolted on later.
4. **Manual creation is always possible** — no flow may depend exclusively on automation or integrations.
5. **WhatsApp is a channel, not the system** — messaging entities must be channel-agnostic.
6. **Fast UX over decorative UI** — performance is a product requirement.

## 3. Module Map (PRD §4)

```
Watson
├── Today                  (personal operational cockpit — shipped, /today, home after login)
├── Inbox                  (unified conversations — shipped, /inbox)
├── Operations
│   ├── Activities
│   ├── Tickets
│   ├── Projects
│   └── Recurring          (shipped, /recurring)
├── Clients
├── Reports
├── Indicators
├── Knowledge              [open — listed as module, absent from MVP scope]
└── Configuration
```

## 4. Experiences (PRD §8)

Today, Ticket, Activity, Project, Client 360, Reports, Indicators, Configuration, Inbox.

Experiences are user-facing surfaces; several of them (Today, Client 360) aggregate data owned by multiple modules. This implies read models / queries that cut across module boundaries.

Both cross-module experiences are shipped: **Today** (2026-07-16, `docs/features/today.md`) and **Client 360** (2026-07-17, `docs/features/client-360.md` — clients + contacts + services/licenses + contracts + consolidated renewals, with per-client read models over tickets/activities/projects/conversations/time/billing/reports in `src/lib/client360-data.ts`). Renewal data feeds both experiences from a single source (`getOrgRenewals`).

**Projects** shipped 2026-07-17 with the official PRD hierarchy (Project → Lists → Activities → Subactivities on the WorkItem model — no parallel task model; tickets never join projects), plus members, milestones, risks, basic dependencies, derived progress/health, and per-user signals feeding Today (`docs/features/projects.md`). The legacy flat `tasks` data was migrated (`scripts/migrate-legacy-tasks.ts`); the table stays frozen.

**Recurring** shipped 2026-07-18 — the scheduled-generation engine implied by §7 below: a `RecurrenceDefinition` (typed schedule columns + a Zod-discriminated `templateData`, not a bare cron string) generates Activities, Tickets, Project Activities and (since Reports shipped) draft Reports through the same domain primitives their own modules use (`createWorkItem`, `resolveSlaDefinition`, `createReportForRecurrence`), with idempotent execution (`docs/architecture/recurrence-idempotency.md`) driven by Vercel Cron against a protected endpoint (`docs/architecture/background-jobs.md`). See `docs/features/recurring.md`.

**Inbox** shipped 2026-07-19 — the operational (non-channel-integrated) base of Manual Messaging: a unified `/inbox` over the existing `Conversation`/`Message` model, now relatable to Client, Contact, Ticket, Activity and/or Project simultaneously (a ticket still gets at most one conversation). Participants, mentions, pin/favorite, unread cursors and logical delete are new; channel adapters (`src/lib/channels.ts`) exist for `internal`/`whatsapp`/`email`/`teams`/`api` — only `internal` is connected, the rest log manually pending real integration. The ticket Composer (`helpdesk/actions.ts`) was refactored onto the same write service (`postConversationMessage`) — one message-writing path for both surfaces. See `docs/features/inbox.md`.

**Reports & Indicators** shipped 2026-07-18 (E-14/E-16): operational Reports per client/project/period with a review workflow (draft → generating → ready_for_review → approved → sent), immutable metric snapshots + versioning (`docs/architecture/report-snapshots.md`), deterministic non-AI narrative, print-PDF/CSV export; and `/indicators` executive panels (Executive/Operations/Billing) with a central metric-definitions dictionary and configurable audited thresholds. Both consume one shared metrics layer (`src/lib/report-metrics.ts`, `docs/architecture/analytics-queries.md`) — formulas live once. See `docs/features/reports.md`, `docs/features/indicators.md`.

## 5. Roles (PRD §7)

SuperAdmin, Administrator, Director, Project Manager, Technician, Client.

Known permission rules from the PRD:

- Only SuperAdmin changes SLA definitions.
- There are **no permissions by client** (no per-client data scoping in MVP).
- Everything else (what Director, Project Manager, Technician and Client can see/do) is **[open]**.

## 6. MVP Boundary (PRD §9 vs §10)

| In MVP | Future (out of MVP) |
|---|---|
| Authentication | CRM |
| Today | WhatsApp integration |
| Activities | AI Advisor |
| Tickets | Customer Portal |
| Projects | Mobile App |
| Clients | Public API |
| Services | Asset Management |
| Contracts | Billing |
| Time Entry (manual only) | |
| Reports | |
| Indicators | |
| Configuration | |
| Audit | |
| Manual Messaging | |

Design rule derived from the PRD: MVP models must not block future scope. In particular, `Conversation`/`Message` must be channel-agnostic (WhatsApp later), and `ChargeItem` exists in the domain model even though Billing is future scope **[open — purpose in MVP unclear]**.

## 7. Cross-Cutting Concerns

- **Audit (`AuditLog`)** — must capture changes to everything "important" from day one; retrofitting audit is costly. Affects every write path.
- ~~**Recurrence (`RecurrenceTemplate`)**~~ — **resolved 2026-07-18**: `RecurrenceDefinition` generates Activities, Tickets, Project Activities and draft Reports; background execution is Vercel Cron against a protected endpoint, no queue/worker infra added. See `docs/features/recurring.md`, `docs/architecture/background-jobs.md`.
- **Activity → Ticket conversion** — must preserve history. This pushes toward a shared `WorkItem` base for Activities and Tickets, consistent with the PRD listing `WorkItem` as an entity.
- **SLA measurement** — SLAs must be measurable (goals §2) and their definitions editable only by SuperAdmin, but the PRD defines no SLA entity or attachment point (Service? Contract?) **[open]**.

## 8. Current Technical Context (from the repository, not the PRD)

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript (strict) |
| Auth | Auth.js (next-auth v5), credentials provider |
| Database | PostgreSQL (Neon serverless) via Drizzle ORM |
| Validation | Zod |
| Styling | Tailwind CSS 4, Untitled UI-inspired design system |
| Env convention | `.env` (not `.env.local`) |

## 9. Technical Risks

1. **MVP breadth** — 14 functional areas in scope. The single largest delivery risk. Mitigated by the phased roadmap (`docs/backlog/mvp-roadmap.md`).
2. **WorkItem polymorphism** — Activity/Ticket sharing a base while diverging (SLA on tickets, project hierarchy on activities) is easy to get wrong in a relational schema; conversion with history preservation depends on getting it right early.
3. **Audit volume and coverage** — "audit everything important" without a defined list of what is important risks either noise or gaps; write-path performance must be considered.
4. **Reporting/profitability data quality** — profitability metrics depend on manual time entry (the only mode in MVP); incomplete time data silently corrupts indicators. *Mitigated (2026-07-18): Indicators surfaces "closed without time" as an explicit signal and shows "No disponible" instead of fabricated zeros; utilization % is not computed without configured capacity.*
5. **Recurrence engine** — scheduled generation in a serverless deployment target needs an explicit mechanism (Vercel cron, external scheduler); not free.
6. **SLA correctness** — SLA math (business hours? pause states?) is undefined; building tickets before SLA rules are decided risks rework.
7. **Channel-agnostic messaging** — Manual Messaging in MVP must not hard-code assumptions that break WhatsApp integration later. *Mitigated (2026-07-19): the Inbox channel-adapter contract (`src/lib/channels.ts`) is the single point a real integration would implement — the conversation domain never branches on channel.*

## 10. Dependency Chain (high level)

```
Auth + Roles + Configuration
        │
Clients / Contacts ── Services ── Contracts
        │
WorkItem core (shared behavior, audit hooks)
        │
Activities ─── Tickets (+SLA) ─── Projects (Lists > Activities > Subactivities)
        │            │
   Recurrence   Conversion A→T
        │
Time Entry ── Today
        │
Reports ── Indicators ── Client 360
        │
Manual Messaging (Inbox — operational base shipped, no external channel)
```

Audit is cross-cutting and starts with the first write path.
