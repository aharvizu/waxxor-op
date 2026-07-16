# Watson — Technical Debt Register

> Audit date: 2026-07-15, commit `30d7a7a`. Debt found in the existing codebase, ranked by how much it endangers the PRD build-out.
> **Severity:** 🟥 blocks/undermines PRD goals · 🟧 will bite during development · 🟨 hygiene.
> No fixes have been applied — this is a register only.

## 🟥 Structural (schema-level, expensive to fix later)

### TD-01 · No audit infrastructure
No `audit_logs` table, no write-path hooks. Every mutation in the app is untracked. The PRD makes audit a founding principle ("audit everything important"; CLAUDE.md: "Everything important must be auditable") and retrofitting it means touching every action. **Resolve before adding any new module** (Phase 0 of the roadmap).

### TD-02 · Work model contradicts the PRD hierarchy — 🟨 PARTIALLY RESOLVED 2026-07-15
The shared `work_items` base now exists and **tickets run on it** (1:1 specialization, data migrated — see `docs/architecture/work-item-model.md`). Still pending: Activities (E-06), migrating project `tasks` to `work_items` (E-09, explicitly deferred), generalizing `ticket_comments` to work items, and the conversion flow (E-08).

### TD-03 · Two-role auth vs six PRD roles — ✅ RESOLVED 2026-07-15
Migrated to the six PRD roles (`drizzle/0003`, admin→superadmin, member→technician) with policy utilities in `src/lib/roles.ts` and guards in `src/lib/session.ts` (see `docs/architecture/roles-and-authorization.md`). Remaining follow-up: the fine-grained permission matrix per module is still open (OQ-10) — today all internal roles share operational access and only Users is role-restricted.

### TD-04 · Authorization is all-or-nothing
Beyond `/users` (admin), **every authenticated user can do everything**, including destructive deletes (`deleteQuoteItem`, `deleteKpi`, `deleteTemplate` are plain `requireUser`). No central permission check exists to extend — each action gates itself. Needs a real authorization layer when the 6 roles land.

### TD-05 · No transactions (driver limitation) — ✅ RESOLVED 2026-07-15
Driver migrated to `neon-serverless` (Pool/WebSocket); `db.transaction()` works and the audited Clients flow runs business write + audit atomically (see `docs/architecture/database-transactions.md`, verified by `scripts/verify-transactions.ts`). Remaining follow-up: legacy multi-step writes in unmigrated modules (e.g. `addComment`) still run outside transactions until each module is migrated.

## 🟧 Development-time hazards

### TD-06 · Zod installed, zero validation
All server actions hand-parse `FormData`; enum fields are blind casts (`formData.get("status") as TicketStatus`). A tampered or malformed POST reaches Postgres and throws an unhandled 500. Zod is already a dependency — adopt it per action, starting with the next module built.

### TD-07 · Silent failure UX in server actions
Most actions `return` on invalid input with no signal; the form just does nothing (only `users` uses `?error=` redirects, and login uses `useActionState`). Every new module copies this pattern unless a shared action-result convention is established first.

### TD-08 · No tests, no CI
Zero test files, no `.github/workflows`. CLAUDE.md requires lint + typecheck + tests after coding; nothing enforces it. Set up CI (lint, tsc, build) before feature work begins.

### TD-09 · Lint is currently failing
`npm run lint` → 2 × `react-hooks/set-state-in-effect` in `src/components/shell/theme-toggle.tsx`. Small fix, but it means the "run lint" gate is red at baseline.

### TD-10 · Missing DB indexes and timestamps
No indexes on any FK column (`tickets.client_id`, `tasks.project_id`, …) or on status columns the dashboard filters by. Only `tickets` has `updated_at`; nothing has soft-delete. Cheap now, painful after data grows.

### TD-11 · JWT sessions never invalidated
Deleting a user or changing their role does not revoke their JWT — the stale session (and stale role) survives until token expiry. Matters more once 6 roles exist and offboarding is real.

## 🟨 Hygiene

### TD-12 · Decorative UI elements that lie
Org switcher shows hardcoded "Waxxor · Enterprise plan"; notifications bell always says "0 new". Either wire them (E-02 / notifications feature) or remove until real.

### TD-13 · Unused/near-unused dependencies
`zod` (see TD-06), `framer-motion` (imported nowhere meaningful). Keep zod (it's the fix for TD-06); decide on framer-motion.

### TD-14 · next-auth pinned to a beta
`5.0.0-beta.31`. Track releases; betas have had breaking changes between snapshots.

### TD-15 · Race conditions in uniqueness checks
`emailTaken()` check-then-insert isn't atomic (unique index will still catch it, but as an unhandled 500, not a friendly error). Same pattern risk for future unique fields.

### TD-16 · `db:push` and `db:migrate` both available
Mixing push (schema sync) and migrate (SQL files) invites drift between `drizzle/` and the live DB. Pick migrations-only for anything beyond local prototyping.

### TD-17 · Single-file component library will outgrow itself
`src/components/ui.tsx` (400 lines) is fine today; split by component once form primitives (select, combobox, date picker, dialog — all needed for PRD modules and currently **absent**) get added. Note: there is no Dialog/Modal, no Select component, no DatePicker, no Toast — the PRD modules will need all four.

## Suggested burn-down order

1. **TD-09** (lint) + **TD-08** (CI) — restore a green baseline and keep it.
2. **TD-01** (audit infra) + **TD-06/TD-07** (validation + action-result convention) — before the first new module, so nothing new is built on the old patterns.
3. **TD-05** (transactional driver) + **TD-03/TD-04** (roles + authorization) — Phase 0/1 of the roadmap.
4. **TD-02** (work model) — the Phase 2 schema migration, planned deliberately with OQ-08/OQ-11/OQ-20 answered.
5. Everything 🟨 opportunistically, never as standalone refactors (CLAUDE.md: never refactor unrelated code).
