# Watson — Open Questions & Detected Inconsistencies

> Gaps and contradictions found while analyzing PRD v1.0. Per CLAUDE.md ("Never invent business rules. If requirements are unclear, ask before implementing"), none of these may be resolved by assumption in code — each needs a product decision. When resolved, record the decision here (or in a dedicated ADR) and update the affected documents.
>
> **Blocks** = the epic/phase that should not be considered *done* until the question is answered.

## Inconsistencies (PRD contradicts or omits itself)

| ID | Inconsistency | Evidence | Blocks |
|---|---|---|---|
| I-01 | `List` is required by "Projects contain Lists > Activities > Subactivities" (§6) but missing from the entity list (§5) | §5 vs §6 | E-09 |
| I-02 | `Knowledge` is a core module (§4) but absent from MVP scope (§9), experiences (§8) and entities (§5) | §4 vs §8/§9 | Scope definition |
| I-03 | `Client` is a role (§7) but "no permissions by client" (§6) and the Customer Portal is future scope (§10). What does a Client-role user access in MVP, if anything? | §6/§7/§10 | E-01 |
| I-04 | Manual Messaging is MVP (§9) with `Conversation`/`Message` entities (§5), yet no Messaging module exists (§4) and the vision calls messaging "future" (§1) | §1/§4 vs §5/§9 | E-17 |
| I-05 | `ChargeItem` is a current entity (§5) but Billing is future scope (§10) | §5 vs §10 | E-04, E-14 |
| I-06 | SLA must be measured (§2) and governed (§6) but no SLA entity or attachment point exists (§5) | §2/§6 vs §5 | E-02, E-07 |

## Open questions

| ID | Question | Why it matters | Blocks |
|---|---|---|---|
| OQ-01 | Is Watson single-organization (Waxxor only) or multi-tenant? `Organization` exists as an entity but §11 targets only Waxxor. | Every table's scoping; hard to change later | Phase 0 |
| OQ-02 | What is `Team` for — assignment of work, reporting rollups, both? | Team schema and its FK usage | E-02 |
| OQ-03 | What is the topology of Client ↔ Service ↔ Contract, and where do SLA definitions attach (Service, Contract, or global config)? | Core commercial schema; SLA measurement | E-04, E-07 |
| OQ-04 | What is `ChargeItem` used for in MVP if Billing is future scope? Is it the input for profitability metrics? | Whether to model it now; profitability reports | E-04, E-14 |
| OQ-05 | What does `RecurrenceTemplate` generate — Activities, Tickets, or both? What schedule grammar (weekly, monthly, cron-like)? | Recurrence engine design | E-10 |
| OQ-06 | Is `Report` a persisted artifact (saved/snapshot) or are reports dynamic queries? Why is Report an entity? | Reports architecture | E-14 |
| OQ-07 | "Audit everything important" — what is the explicit list of audited entities/actions? | Audit coverage vs noise; write-path cost | E-15 |
| OQ-08 | Are Subactivities self-referencing Activities? Maximum depth (one level or arbitrary)? Can standalone (non-project) activities have subactivities? | Activity schema and UI | E-06, E-09 |
| OQ-09 | Do Tickets require a Client (unlike Activities, R1)? How is SLA computed — calendar hours vs business hours, pause/hold states, response vs resolution targets? | Ticket schema; SLA correctness | E-07 |
| OQ-10 | What is the permission matrix for Director, Project Manager and Technician? Only two rules are defined (R6, R7). | Authorization framework | E-01 |
| OQ-11 | What are the lifecycle states of Activities and Tickets? Shared state machine on WorkItem or per-type? Configurable or fixed? | WorkItem core design | E-05 |
| OQ-12 | Is Activity→Ticket conversion one-way? What happens to project/list membership on conversion, given Tickets never belong to Projects (R3)? | Conversion semantics | E-08 |
| OQ-13 | Time entry rules: can entries be edited/deleted after creation? By whom? Is there a lock period? ("Everything important must be auditable.") | TimeEntry integrity for reports | E-11 |
| OQ-14 | What exactly does the Today experience show — assigned items due today, overdue, SLA-at-risk, unscheduled? Per-role differences? | Today read model | E-12 |
| OQ-15 | What is the initial catalog of Reports and Indicators (exact KPI definitions for SLA compliance, productivity, profitability)? | Reports/KPI implementation | E-14, E-16 |
| OQ-16 | What does "Manual Messaging" mean operationally in MVP — logging past client communication, composing internal notes, or something else? | Conversation/Message design | E-17 |
| OQ-21 | Should time entries (or tickets) link to a specific `Contract`? Today contract hours consumption is computed at client level (`included_in_contract` time within the contract period), which cannot separate consumption when one client has two simultaneous contracts with included hours. | Accurate per-contract consumption; contract profitability | E-04, E-11 |

## Resolution log

### OQ-01 — RESOLVED (2026-07-15)
Decision: the schema is multi-organization-ready (every business table carries a mandatory `organization_id`), but the product operates as a single organization — "Watson" (`slug: watson`) — with no switcher, no org administration and no way to change organization. Isolation is enforced in application code (session-derived orgId on every query/mutation).
Decided by: implementation step "Organization base" (user-directed).
Documents updated: `docs/architecture/organization-and-data-isolation.md` (new), `docs/architecture/audit-log.md`, `docs/architecture/roles-and-authorization.md` unaffected.

### OQ-03 — PARTIALLY RESOLVED (2026-07-17)
Decision (from the Cliente 360 feature spec, user-directed): topology is `Client 1—* ClientService *—1 Service (org catalog)` and `Client 1—* Contract`; licenses are `client_services` rows with `serviceType = "license"`, not a separate entity. SLA definitions can attach at the catalog service (`services.default_sla_definition_id`) and per contracted service (`client_services.sla_definition_id`); tickets keep their frozen SLA snapshot regardless. Still open: whether contracts should also carry an SLA attachment point, and OQ-21 (contract↔time link).
Decided by: Cliente 360 implementation (user-directed feature spec).
Documents updated: `docs/features/client-360.md`, `services.md`, `contracts.md`, `renewals.md`, `docs/architecture/system-overview.md`.

### OQ-08 / OQ-11 (partial) — RESOLVED for Projects (2026-07-17)
Decision (from the Projects feature spec, user-directed): Subactivities are self-referencing Activities (`activities.parent_activity_id`) with a **maximum of two levels** (activity → subactivity; a subactivity can never be a parent). Only project activities can have subactivities in this phase (a subactivity always lives in its parent's project and list). Project activities reuse the existing Activity statuses (pending≈todo, in_progress, waiting, blocked, completed, cancelled) — no second status system; custom statuses stay future scope. Project activities remain WorkItem type `activity` (the `project_activity` enum value stays reserved/unused).
Decided by: Projects implementation (user-directed feature spec).
Documents updated: `docs/features/projects.md`, `project-activities.md`, `docs/architecture/work-item-model.md`.

### OQ-12 — RESOLVED (2026-07-17)
Decision: conversion Activity→Ticket remains one-way; when the activity belongs to a project, converting requires an explicit confirmation and **unlinks it from the project, its list and its parent** in the same transaction (tickets never join projects — R3). The previous linkage is preserved in the `convert` audit event (`unlinkedProjectId`). Activities with subactivities cannot convert until those are resolved.
Decided by: Projects implementation (user-directed feature spec).
Documents updated: `docs/features/project-activities.md`, `docs/features/activities.md`, `docs/architecture/work-item-model.md`.

### Legacy `tasks` migration — DECIDED (2026-07-17, relates to OQ-20)
Decision: the 3 seed rows in the flat `tasks` table were migrated to WorkItem/Activity under a "General" list (`scripts/migrate-legacy-tasks.ts`, idempotent, audited with `source: "system"`); the `tasks` table stays frozen — dropping it is a separate destructive decision for SuperAdmin.
Documents updated: `docs/features/projects.md`, `docs/architecture/work-item-model.md`.

### OQ-05 — RESOLVED (2026-07-18)
Decision (from the Recurrences feature spec, user-directed): a `RecurrenceDefinition` generates **Activity, Ticket, or Project Activity** (`targetType`, discriminated); Report is modeled and schema-ready but its creation path stays disabled (`ENABLED_TARGET_TYPES` excludes it) until the Reports module can back it with real, non-fabricated content *(update 2026-07-18: enabled when Reports shipped — recurrences create draft Reports, never auto-approve/send)*. Schedule grammar is a small typed set of columns (frequency/interval/daysOfWeek/dayOfMonth/monthOfYear/weekOfMonth/timeOfDay/timezone) covering the spec's required patterns (daily/weekly/monthly/quarterly/semiannual/annual/weekdays/custom) — **not** a cron string and **not** the RRULE library (evaluated and rejected as unnecessary for this scope; see `docs/features/recurrence-scheduling.md`). Background execution is Vercel Cron against a secret-protected endpoint (`docs/architecture/background-jobs.md`) — no queue/worker infrastructure was added.
Decided by: Recurrences implementation (user-directed feature spec).
Documents updated: `docs/features/recurring.md`, `recurrence-scheduling.md`, `recurrence-executions.md`, `recurrence-templates.md`, `docs/architecture/background-jobs.md`, `recurrence-idempotency.md`.

### OQ-06 — RESOLVED (2026-07-18)
Decision (from the Reports & Indicators feature spec, user-directed): `Report` is a **persisted artifact with immutable snapshots**, not a dynamic query. Generation freezes `metricsSnapshot`/`contentSnapshot` into the report and into an immutable `report_versions` row; regeneration creates the next version without touching prior ones; approval/send stamp a specific version transactionally. Live queries exist too, but they belong to Indicators (`/indicators`), which is always computed on demand — the two capabilities are deliberately separated over one shared metrics layer (`src/lib/report-metrics.ts`). Rationale and consequences in `docs/architecture/report-snapshots.md`.
Decided by: Reports & Indicators implementation (user-directed feature spec).
Documents updated: `docs/features/reports.md`, `report-generation.md`, `report-versioning.md`, `report-templates.md`, `docs/architecture/report-snapshots.md`, `analytics-queries.md`.

### OQ-15 — PARTIALLY RESOLVED (2026-07-18)
Decision: the initial catalog is the shipped indicator dictionary (`INDICATOR_DEFINITIONS`, 14 metrics with documented formulas — backlog, created/closed, reopen rate, SLA compliance/first response, average response/resolution times, time totals, billing aggregates, projects at risk, recurrence success, reports pipeline) plus the 8 report types. SLA compliance uses the frozen final flags of tickets closed in the period. **Utilization % is explicitly not computed** (no configured capacity exists — shown as "No disponible", never fabricated); profitability beyond potential/charged amounts stays open pending OQ-04 (`ChargeItem`) and cost data.
Decided by: Reports & Indicators implementation (user-directed feature spec).
Documents updated: `docs/features/indicator-definitions.md`, `indicators.md`, `indicator-thresholds.md`.

### OQ-18 / OQ-19 (from the 2026-07-15 audit) — RESOLVED (2026-07-18)
Decision: the legacy document-style report templates were absorbed into the new operational `report_templates` (legacy `content` column kept, unused — no destructive change); manually-keyed KPIs remain at `/kpis` as a complement, never a substitute for computed indicators at `/indicators`.
Documents updated: `docs/backlog/current-status.md`, `docs/features/report-templates.md`, `indicators.md`.

_Record further decisions as:_

```
### OQ-XX — RESOLVED (YYYY-MM-DD)
Decision: …
Decided by: …
Documents updated: …
```
