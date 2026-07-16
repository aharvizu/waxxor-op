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
├── Today                  (personal operational cockpit)
├── Operations
│   ├── Activities
│   ├── Tickets
│   ├── Projects
│   └── Recurring
├── Clients
├── Reports
├── Indicators
├── Knowledge              [open — listed as module, absent from MVP scope]
└── Configuration
```

## 4. Experiences (PRD §8)

Today, Ticket, Activity, Project, Client 360, Reports, Indicators, Configuration.

Experiences are user-facing surfaces; several of them (Today, Client 360) aggregate data owned by multiple modules. This implies read models / queries that cut across module boundaries.

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
- **Recurrence (`RecurrenceTemplate`)** — the Recurring module implies scheduled generation of work items, which requires a background execution mechanism (cron/scheduled jobs). What recurs (activities, tickets, or both) is **[open]**.
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
4. **Reporting/profitability data quality** — profitability metrics depend on manual time entry (the only mode in MVP); incomplete time data silently corrupts indicators.
5. **Recurrence engine** — scheduled generation in a serverless deployment target needs an explicit mechanism (Vercel cron, external scheduler); not free.
6. **SLA correctness** — SLA math (business hours? pause states?) is undefined; building tickets before SLA rules are decided risks rework.
7. **Channel-agnostic messaging** — Manual Messaging in MVP must not hard-code assumptions that break WhatsApp integration later.

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
Manual Messaging
```

Audit is cross-cutting and starts with the first write path.
