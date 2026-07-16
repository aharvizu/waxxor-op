# Watson — Epics (MVP)

> Derived exclusively from PRD v1.0 §9 (MVP scope), §6 (business rules) and §8 (experiences).
> Epics only — user stories will be derived per epic later. No functionality has been added beyond the PRD.
> Blocked-by ⛔ marks epics that cannot be *finished* (started is fine) until an open question is resolved.

## E-01 · Authentication & Access Foundation
**Goal:** Users sign in and act under one of the six roles (SuperAdmin, Administrator, Director, Project Manager, Technician, Client).
**Scope:** Authentication (credentials), session handling, role assignment, role-based authorization framework (no per-client permissions, per R6).
**Depends on:** — (first epic).
**Risks:** Role permission matrix undefined beyond two rules ⛔ OQ-10; Client role semantics ⛔ I-03.

## E-02 · Organization, Teams & Configuration
**Goal:** The Configuration module: organization data, users, teams, and platform-level settings (including SLA definitions, writable only by SuperAdmin per R7).
**Scope:** Organization entity, Team entity and membership, user management, configuration surface.
**Depends on:** E-01.
**Risks:** Multi-tenancy decision OQ-01; Team purpose OQ-02; SLA definition shape ⛔ OQ-03.

## E-03 · Clients & Contacts
**Goal:** Manage the client base and their contacts — the commercial backbone every work item and report hangs from.
**Scope:** Client CRUD, Contact CRUD, association to Organization.
**Depends on:** E-01, E-02.
**Risks:** Low.

## E-04 · Services & Contracts
**Goal:** Model what is sold (Services) and under which agreements (Contracts), as the anchor for SLA and future profitability.
**Scope:** Service CRUD, Contract CRUD, Client↔Service↔Contract relationships.
**Depends on:** E-03.
**Risks:** Relationship topology undefined ⛔ OQ-03; ChargeItem MVP purpose OQ-04.

## E-05 · Work Item Core
**Goal:** The shared foundation of Activities and Tickets (`WorkItem`): common fields, states, assignment, and audit hooks — so common behavior is built once (PRD principle; CLAUDE.md).
**Scope:** WorkItem base model, shared lifecycle, assignment to users/teams, integration point for AuditLog and TimeEntry.
**Depends on:** E-02, E-03.
**Risks:** Highest-leverage technical decision of the project (inheritance strategy in Drizzle/Postgres); statuses/workflows undefined ⛔ OQ-11.

## E-06 · Activities
**Goal:** Standalone activity management. Activities may exist without client or date (R1).
**Scope:** Activity CRUD on top of WorkItem core, nullable client/date, subactivities (per R4 hierarchy) ⛔ OQ-08.
**Depends on:** E-05.
**Risks:** Subactivity depth/semantics OQ-08.

## E-07 · Tickets & SLA
**Goal:** Helpdesk tickets with measurable SLA. Tickets never belong to Projects (R3).
**Scope:** Ticket CRUD on top of WorkItem core, SLA definitions (SuperAdmin-only writes, R7), SLA measurement per ticket.
**Depends on:** E-05, E-04 (if SLA attaches to Service/Contract).
**Risks:** SLA attachment point and calculation rules undefined ⛔ OQ-03/OQ-09.

## E-08 · Activity → Ticket Conversion
**Goal:** Convert an Activity into a Ticket preserving full history (R2) — audit trail, time entries, and identity/link survive.
**Scope:** Conversion operation, history preservation, audit record of the conversion itself.
**Depends on:** E-06, E-07, E-15 (audit must exist to be preserved).
**Risks:** Directionality (is Ticket→Activity allowed?) OQ-12.

## E-09 · Projects
**Goal:** Project management with the fixed hierarchy **Project > Lists > Activities > Subactivities** (R4). No tickets inside projects (R3).
**Scope:** Project CRUD, List CRUD (entity missing from PRD §5 — I-01), attaching activities to lists.
**Depends on:** E-06.
**Risks:** List entity formally unconfirmed ⛔ I-01/OQ-08.

## E-10 · Recurrence
**Goal:** The Recurring module: `RecurrenceTemplate` generates work on schedule so recurring obligations are never forgotten.
**Scope:** Template CRUD, scheduling rules, generation mechanism (background job), link from generated items to their template.
**Depends on:** E-06 (and E-07 if tickets recur ⛔ OQ-05).
**Risks:** Serverless scheduling mechanism; what recurs is undefined ⛔ OQ-05.

## E-11 · Time Tracking (Manual)
**Goal:** Manual time entries against work items (R5) — the raw data for productivity and profitability.
**Scope:** TimeEntry CRUD by users, per WorkItem, listing/editing rules.
**Depends on:** E-05.
**Risks:** Data-quality risk for reports (manual-only); edit/lock rules undefined OQ-13.

## E-12 · Today Experience
**Goal:** The operational cockpit: everything relevant to a user *today*, across activities, tickets and projects.
**Scope:** Aggregated read model over the user's work items; the PRD does not define its exact contents ⛔ OQ-14.
**Depends on:** E-06, E-07 (E-09 enriches it).
**Risks:** Undefined composition OQ-14.

## E-13 · Client 360 Experience
**Goal:** Single view of a client: their contacts, contracts, services, work items, time and conversations.
**Scope:** Aggregated read model per client.
**Depends on:** E-03, E-04, E-06, E-07, E-11 (E-17 enriches it).
**Risks:** Low once sources exist.

## E-14 · Reports
**Goal:** Operational reports (PRD goal: measure SLA, productivity and profitability; generate operational reports).
**Scope:** Report generation over tickets/activities/time; `Report` entity semantics ⛔ OQ-06; profitability inputs ⛔ OQ-04.
**Depends on:** E-07, E-11 (data availability).
**Risks:** Report catalog undefined OQ-15.

## E-15 · Audit Log
**Goal:** Cross-cutting `AuditLog`: everything important is auditable (PRD principle; CLAUDE.md).
**Scope:** Audit infrastructure (who/what/when/before-after), wired into every write path from E-03 onward, audit viewing surface.
**Depends on:** E-01 (actor identity). Starts early, spans all epics.
**Risks:** Scope of "important" undefined ⛔ OQ-07.

## E-16 · Indicators (Operational KPIs)
**Goal:** The Indicators experience: operational KPIs (SLA compliance, productivity, profitability per PRD goals).
**Scope:** KPI computation and dashboard; exact KPI list ⛔ OQ-15.
**Depends on:** E-14 data foundations.
**Risks:** KPI definitions undefined OQ-15.

## E-17 · Manual Messaging
**Goal:** Manual logging of client communication (`Conversation`, `Message`) — channel-agnostic so WhatsApp can plug in later without remodeling.
**Scope:** Conversation/Message CRUD linked to clients, manual channel only.
**Depends on:** E-03.
**Risks:** Exact meaning of "Manual Messaging" in MVP ⛔ I-04/OQ-16.

---

## Out of scope (PRD §10 — do not build)

CRM · WhatsApp integration · AI Advisor · Customer Portal · Mobile App · Public API · Asset Management · Billing.

## Dependency graph

```
E-01 ─ E-02 ─ E-03 ─ E-04
         │      ├── E-17
         └── E-05 ─┬─ E-06 ─┬─ E-09
                   │        └─ E-10
                   ├─ E-07 ── E-08 (needs E-06 + E-15)
                   └─ E-11
E-06+E-07 ── E-12
E-03..E-11 ── E-13
E-07+E-11 ── E-14 ── E-16
E-01 ── E-15 (cross-cutting, spans everything)
```
