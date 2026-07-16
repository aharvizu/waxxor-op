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

## Resolution log

### OQ-01 — RESOLVED (2026-07-15)
Decision: the schema is multi-organization-ready (every business table carries a mandatory `organization_id`), but the product operates as a single organization — "Watson" (`slug: watson`) — with no switcher, no org administration and no way to change organization. Isolation is enforced in application code (session-derived orgId on every query/mutation).
Decided by: implementation step "Organization base" (user-directed).
Documents updated: `docs/architecture/organization-and-data-isolation.md` (new), `docs/architecture/audit-log.md`, `docs/architecture/roles-and-authorization.md` unaffected.

_Record further decisions as:_

```
### OQ-XX — RESOLVED (YYYY-MM-DD)
Decision: …
Decided by: …
Documents updated: …
```
