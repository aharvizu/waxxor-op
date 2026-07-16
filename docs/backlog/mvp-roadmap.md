# Watson — MVP Roadmap

> Sequencing of the epics in `docs/backlog/epics.md`, driven by the dependency chain — no dates, no estimates.
> MVP definition of done (PRD §11): **Watson completely replaces ClickUp and the current Helpdesk for Waxxor daily operations.**

## Phasing rationale

- Dependencies flow one way: identity → commercial data → work core → work types → time → aggregated views → analytics → messaging.
- **Audit (E-15) is not a phase** — its infrastructure lands in Phase 0 and every subsequent write path plugs into it. Retrofitting audit contradicts the PRD principle "audit everything important."
- Blocking open questions (see `docs/decisions/open-questions.md`) are listed per phase; each phase's questions should be resolved **before that phase starts**, not before the project starts.

## Phase 0 — Foundation
**Epics:** E-01 (Auth & roles), E-02 (Org, teams, configuration), E-15 (Audit infrastructure).
**Exit criteria:** users log in with roles; configuration surface exists; audit infrastructure records its first events.
**Resolve first:** OQ-01 (tenancy), OQ-10 (role matrix), OQ-07 (audit scope).

## Phase 1 — Commercial backbone
**Epics:** E-03 (Clients & contacts), E-04 (Services & contracts).
**Exit criteria:** the real client/service/contract base can be loaded into Watson.
**Resolve first:** OQ-03 (Client↔Service↔Contract↔SLA topology).

## Phase 2 — Work core
**Epics:** E-05 (WorkItem core), E-06 (Activities), E-07 (Tickets & SLA), E-08 (Activity→Ticket conversion).
**Exit criteria:** daily work can be captured as activities and tickets; SLA is measured; conversion preserves history. **This is the phase that starts replacing ClickUp and the Helpdesk.**
**Resolve first:** OQ-11 (work item lifecycle/states), OQ-08 (subactivities), OQ-09 (SLA calculation), OQ-12 (conversion directionality).

## Phase 3 — Structure & automation
**Epics:** E-09 (Projects: Lists > Activities > Subactivities), E-10 (Recurrence).
**Exit criteria:** project work is organized in the PRD hierarchy; recurring work generates itself.
**Resolve first:** I-01 (List entity), OQ-05 (what recurs, scheduling mechanism).

## Phase 4 — Time & daily operation
**Epics:** E-11 (Manual time tracking), E-12 (Today experience).
**Exit criteria:** technicians log time and run their day from Today. Daily operation fully inside Watson.
**Resolve first:** OQ-13 (time entry edit rules), OQ-14 (Today composition).

## Phase 5 — Visibility
**Epics:** E-13 (Client 360), E-14 (Reports), E-16 (Indicators).
**Exit criteria:** management can see per-client state, operational reports, and KPIs (SLA, productivity, profitability).
**Resolve first:** OQ-06 (Report entity), OQ-15 (report/KPI catalog), OQ-04 (ChargeItem/profitability inputs).

## Phase 6 — Communication
**Epics:** E-17 (Manual messaging).
**Exit criteria:** client communication is logged in Watson, channel-agnostic.
**Resolve first:** OQ-16 (meaning of Manual Messaging in MVP).

## MVP completion check

MVP is done when every PRD §9 item maps to a shipped epic:

| PRD §9 item | Epic(s) |
|---|---|
| Authentication | E-01 |
| Today | E-12 |
| Activities | E-06 |
| Tickets | E-07 (+E-08) |
| Projects | E-09 |
| Clients | E-03 (+E-13) |
| Services | E-04 |
| Contracts | E-04 |
| Time Entry | E-11 |
| Reports | E-14 |
| Indicators | E-16 |
| Configuration | E-02 |
| Audit | E-15 |
| Manual Messaging | E-17 |

…and the PRD §11 criterion holds: ClickUp and the current Helpdesk are no longer needed for daily operations.

## Standing risks across the roadmap

1. **Scope breadth** — 17 epics; the roadmap only pays off if phases ship strictly one at a time (CLAUDE.md: one feature at a time).
2. **Phase 2 schema decisions are load-bearing** — WorkItem inheritance and SLA modeling are the two decisions most expensive to change later.
3. **Data quality for Phase 5** — reports and KPIs are only as good as manual time entry discipline from Phase 4.
4. **Recurrence execution** — Phase 3 needs a scheduled-job mechanism compatible with the deployment target (Neon + serverless Next.js).
