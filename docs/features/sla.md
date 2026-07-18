# SLA

> Status: shipped 2026-07-15. Implements the base of E-07 (SLA) and resolves the model side of OQ-03/OQ-09 partially (definitions per priority; catalogs still pending).
> PRD rule R7: **only SuperAdmin changes SLA definitions** — enforced with `requireRole("superadmin")` on every SLA mutation and on `/sla`.

## Model (migration `drizzle/0010_same_purifiers.sql`)

**`sla_definitions`** — configurable policies: name, description, the `priority` they apply to, `first_response_minutes`, `resolution_minutes`, `business_hours_only`, `is_default` (one active default per priority — enforced transactionally by demoting siblings), `status` active/inactive. Indexes: organization_id, priority, status, is_default.

**`business_calendars`** — one per organization (unique): IANA `timezone` (default America/Mexico_City), `work_days` (ISO 1–7), `work_start_minute`/`work_end_minute`, and `holidays` (jsonb, **stored for the future, not evaluated yet**).

**Ticket snapshot columns** — the assignment freezes everything the ticket needs:
`sla_definition_id` (stable reference), `sla_name`, `sla_first_response_minutes`, `sla_resolution_minutes`, `sla_business_hours_only`, `sla_timezone`, `sla_calendar` (jsonb copy of the calendar), `first_response_target_at` + `resolution_target_at` (both indexed), `sla_paused_minutes` (accumulated), `sla_paused_at` (open pause). **Editing a definition or the calendar never changes existing tickets** — verified.

SLA-pausing statuses (official lifecycle since `drizzle/0011`): `waiting_customer` and `waiting_third_party`. At **close**, final compliance freezes into `sla_first_response_met` / `sla_resolution_met` (see `docs/features/tickets.md`); reopening clears them for the new cycle.

## Assignment cascade (create and convert)

1. Explicit definition selected by a **SuperAdmin** (select on the new-ticket form; also honored by the conversion action).
2. Active **default for the ticket's priority**.
3. None — the ticket simply has no SLA (panel says so).

Assignment happens inside the ticket-creating transaction; targets are computed from the assignment instant.

## Target calculation (`src/lib/business-time.ts`, pure)

- 24/7 SLAs: plain wall-clock addition.
- Business-hours SLAs: `addWorkingMinutes` walks working windows (work days × start/end minutes) **in the calendar's timezone** using `Intl.DateTimeFormat` — no dependencies. `workingMinutesBetween` measures elapsed business minutes (used for pauses and remaining time).
- Verified against production: a ticket created 20:30 CDMX with a 60m/480m business-hours SLA got targets at 10:00 and 17:00 CDMX the next working day.

**Documented simplifications:** advancing time adds wall-clock minutes as UTC ms, so a DST transition inside the span can shift results by the offset (Mexico has no DST since 2022 — exact there); holidays not evaluated; one calendar per org (no per-client calendars).

## First response

- Explicit **"Register first response"** button on the ticket detail (visible until registered). Stamped with an `IS NULL` guard — once set, nothing overwrites it (the button also disappears).
- The **first outbound message** to the client (composer) also stamps it — same IS NULL guard, so it is never overwritten by later messages or the button. Real channels (WhatsApp/email) are future scope.
- First response compliance = `first_response_at <= first_response_target_at`. Its target is **not** extended by pauses.

## Pauses

- Entering `waiting_customer` or `waiting_third_party` opens a pause (`sla_paused_at`); leaving them closes it: the elapsed minutes (business minutes for business-hours SLAs) accumulate in `sla_paused_minutes` and **extend `resolution_target_at`** by the same working time.
- Duplicate/simultaneous pauses are impossible by construction: one column holds the open pause, and the guard skips opening when one exists (moving between the two waiting states keeps the same pause).
- Both edges are audited (`sla_pause_start` / `sla_pause_end` with the minutes and the new target).

## Resolution & thresholds

`resolved_at` stamps on the first transition to resolved (closed → `closed_at`); resolution compliance is measured against `resolved_at`. Health bands (spec): remaining >25% **normal** · ≤25% **at risk** · ≤10% **critical** · past target **overdue**; fulfilled → **met**/**breached**. Computed per render by `slaHealth` (pure).

## UI

- **`/sla`** (SuperAdmin only; link in the sidebar and ⌘K): definition list with inline edit, activate/deactivate and default flags; work calendar form (timezone, days, start/end). Non-superadmins are redirected with zero content leaked (verified).
- **Ticket detail panel**: applied SLA name + mode, both targets with date, remaining/overdue time, health badges (red for critical/overdue), paused minutes, "Paused" indicator, and the first-response button.

## Verification (2026-07-15, dev)

`scripts/verify-sla.ts` — 10 PASS: auto-assignment by priority with snapshot; explicit override; snapshot immune to definition edits; first response only once; met/breached classification; pause end accumulates and extends the target; duplicate-pause prevention; pause audit; rollback on audit failure during assignment; org isolation (outsider resolves nothing, even naming the id). Unit tests (11): timezone reading, business addition across weekends, off-window snapping, business-minutes measurement, signed remaining, all four threshold bands, met/breached. HTTP smoke: SuperAdmin created a definition through `/sla`; a technician got it auto-assigned on a new high ticket; panel rendered targets and health; explicit first response registered once; pause started/ended with audit (0 paused business-minutes at night — correct).

## Compliance reporting (2026-07-18, E-14)

La fórmula oficial de cumplimiento vive una sola vez en `slaMetrics` (`src/lib/report-metrics.ts`): sobre tickets **cerrados en el periodo** con SLA asignado, `% = cumplidos / evaluados` usando las banderas finales congeladas al cierre (`sla_resolution_met` / `sla_first_response_met`) — nunca recalculando contra targets vivos. Tickets sin SLA se excluyen y se reportan aparte (`excludedNoSla`); denominador 0 → "No disponible", nunca 0% ni 100% fabricado. Consumida por: el tipo de reporte `sla_report` y la sección SLA de los snapshots (desglose por prioridad), y el panel ejecutivo de `/indicators` (comparada contra el umbral configurable `sla_target_pct`, default 90). Ver `docs/features/reports.md` y `docs/features/indicator-definitions.md`.

## Postponed

Holidays evaluation · per-client calendars/SLAs (OQ-03) · category catalogs (OQ-09) · automatic first response from messaging channels (E-17) · SLA re-apply action for existing tickets · SLA breach notifications. Compliance reporting shipped (ver arriba).
