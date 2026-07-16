# Watson — Current Status vs PRD (per epic)

> Audit date: 2026-07-15, commit `30d7a7a`. Maps the existing codebase to the epics in `docs/backlog/epics.md`.
> **Status legend:** ✅ done for MVP · 🟡 partial (usable base, gaps vs PRD) · 🔴 not started · ⚠️ exists but conflicts with the PRD.

## Summary

| Epic | Status | What exists today |
|---|---|---|
| E-01 Authentication & roles | 🟡 | Credentials login, JWT sessions, `requireUser/requireAdmin`. Only 2 roles (`admin`, `member`) vs 6 in PRD §7. No permission matrix. |
| E-02 Org, teams & configuration | 🔴 | No Organization/Team tables, no Configuration module. Org switcher in the sidebar is decorative (hardcoded "Waxxor"). User management exists (admin-only) and would fold into this epic. |
| E-03 Clients & contacts | 🟡 | Client CRUD works. Contact data is inline fields on `clients` — no `Contact` entity (PRD §5 requires one). |
| E-04 Services & contracts | 🔴 | No tables, no UI. |
| E-05 WorkItem core | 🔴 | No shared base. `tickets` and `tasks` are unrelated tables with different shapes — conversion (R2) impossible on this model. |
| E-06 Activities | 🔴 | No Activity entity. Project `tasks` (todo/in_progress/done) are the closest thing but are project-bound and lack client/date-optional semantics (R1) and subactivities. |
| E-07 Tickets & SLA | 🟡 | Solid helpdesk: statuses, priorities, assignee, client link, comments, updated_at. **No SLA anywhere** (definitions, targets, measurement) — the PRD's core differentiator for tickets. |
| E-08 Activity→Ticket conversion | 🔴 | Nothing; blocked on E-05/E-06. |
| E-09 Projects (Lists > Activities > Subactivities) | ⚠️🟡 | Projects CRUD works (status, dates, budget), but hierarchy is `project → tasks` (flat) — **contradicts R4**. No Lists, no subactivities. Tickets are correctly kept out of projects (R3 holds). |
| E-10 Recurrence | 🔴 | Nothing. |
| E-11 Time tracking | 🔴 | No `time_entries` table, no UI. |
| E-12 Today | 🔴 | Dashboard exists but is a business-metrics snapshot (tickets, quotes pipeline, KPI list), not "my work today". Reusable as a starting layout. |
| E-13 Client 360 | 🔴 | `/clients/[id]` is only an edit form — no aggregated view of tickets/projects/time/conversations per client. |
| E-14 Reports | ⚠️🟡 | A report module exists but is **document generation** (templates with `{{client}}/{{date}}` placeholders, draft/sent, print) — not the PRD's operational reports (SLA, productivity, profitability). May survive as "client-facing deliverables", but it does not satisfy E-14. |
| E-15 Audit log | 🔴 | No audit of any kind. Every mutation is untracked — directly against PRD principle "audit everything important". |
| E-16 Indicators | ⚠️🟡 | KPI module exists but values are **manually keyed** per period. PRD indicators must be measured from operational data (SLA compliance, productivity, profitability). Manual KPIs could remain as a complement, not a substitute. |
| E-17 Manual messaging | 🔴 | No Conversation/Message tables or UI. Ticket comments exist but are internal ticket threads, not client conversations. |

## Out-of-PRD functionality present in the code

| Feature | Where | PRD position |
|---|---|---|
| **Quotes** (quotes + line items, currency, tax, pipeline stats on dashboard) | `/quotes`, `quotes`/`quote_items` tables, dashboard cards | Not in MVP §9; nearest concept (Billing) is explicitly **future scope §10**. Decision needed: remove, freeze, or formally adopt into scope → registered as OQ-17 in `docs/decisions/open-questions.md` companion note below. |
| Report templates as pentest/security deliverables | seed + `/reports/templates` | Not contradicting, but orthogonal to PRD reports |
| "Revenue" nav section grouping Quotes/Reports/KPIs | app shell | Reflects the pre-PRD product framing |

## What is genuinely reusable as-is

1. **UI foundation** — shell, command menu, theme system, `ui.tsx` library: aligned with CLAUDE.md UI mandate, keep.
2. **Auth plumbing** — Auth.js credentials + JWT + session helpers: extend to 6 roles rather than rebuild.
3. **Helpdesk module** — best-aligned feature; needs SLA, WorkItem base, audit.
4. **Clients module** — needs Contact extraction and 360 view.
5. **Module conventions** — `page/[id]/new/actions.ts` pattern is a good template for the missing modules.
6. **Seed/env conventions** — `.env`, seed script pattern.

## Net assessment

Roughly **4 of 17 epics have a meaningful head start** (E-01, E-03, E-07, E-09-partial), **2 modules need a product decision** (Quotes; Reports/KPIs reframing), and **11 epics are greenfield**, including everything the PRD treats as differentiating: WorkItem unification, Activities, conversion, SLA, time, Today, audit, recurrence, Client 360, messaging.

New open questions raised by this audit (to add to `docs/decisions/open-questions.md` when triaged):

- **OQ-17** — Keep, freeze or remove the Quotes module? (Billing is future scope.)
- **OQ-18** — Do the existing document-style Reports remain a separate deliverable feature alongside PRD operational reports?
- **OQ-19** — Do manually-keyed KPIs remain alongside computed indicators?
- **OQ-20** — Migration strategy for existing production data (users/tickets/tasks) when the PRD schema (roles, WorkItem, Lists) lands — is there production data to preserve?
