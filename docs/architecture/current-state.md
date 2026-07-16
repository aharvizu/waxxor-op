# Watson — Current State (Technical Audit)

> Audit date: 2026-07-15. Audited at commit `30d7a7a` (branch `main`, clean tree).
> Companion documents: `docs/backlog/current-status.md` (feature-by-feature status vs PRD) and `docs/decisions/technical-debt.md` (debt register).

## 1. What this codebase is

A working **proto-Watson**: a Next.js App Router application ("Waxxor Ops") with login, dashboard, helpdesk, projects+tasks, clients, quotes, reports, KPIs and user administration. It is a functional internal-ops tool, but it was built **before** the Watson PRD and matches roughly a third of the MVP, with two areas that contradict it (see §12 and current-status.md).

## 2. Technology stack

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Framework | Next.js (App Router, RSC) | 16.2.10 | No custom `next.config` options |
| UI runtime | React | 19.2.4 | Server Components + a few client components |
| Language | TypeScript | ^5, `strict: true` | `npx tsc --noEmit` passes clean |
| Auth | next-auth (Auth.js) | 5.0.0-beta.31 | Credentials provider, JWT sessions |
| ORM | Drizzle ORM | 0.45.2 | `neon-http` driver |
| Database | PostgreSQL | Neon serverless | Connection via `DATABASE_URL` in `.env` |
| Validation | Zod | 4.4.3 | **Installed but never imported** |
| Styling | Tailwind CSS | 4 (postcss plugin) | Design tokens in `globals.css` |
| Icons / motion | lucide-react, framer-motion | | framer-motion barely used |
| Passwords | bcryptjs | cost 12 | |

No test framework, no CI (`.github/` absent), no Prettier config, no error monitoring.

## 3. Folder structure

```
src/
├── app/
│   ├── (app)/                 # Authenticated area (guard in layout.tsx)
│   │   ├── page.tsx           # Dashboard
│   │   ├── clients/           # page, [id], actions.ts
│   │   ├── helpdesk/          # page, [id], new, actions.ts
│   │   ├── projects/          # page, [id], new, actions.ts
│   │   ├── quotes/            # page, [id], new, actions.ts
│   │   ├── reports/           # page, [id], new, templates, actions.ts
│   │   ├── kpis/              # page, actions.ts
│   │   └── users/             # page, [id], actions.ts  (admin-only)
│   ├── api/auth/[...nextauth]/ # Auth.js route handler (only API route)
│   ├── login/                 # page, login-form (client), actions.ts
│   ├── layout.tsx             # Root: fonts, theme-init script
│   └── globals.css            # Tailwind 4 + design tokens (light/dark)
├── auth.ts                    # NextAuth config (credentials + JWT callbacks)
├── components/
│   ├── ui.tsx                 # Component library (Card, Badge, Table, StatCard…)
│   ├── shell/                 # AppShell, sidebar, topbar, command menu (⌘K),
│   │                          # breadcrumbs, dropdown, theme toggle
│   ├── submit-button.tsx      # useFormStatus pending state
│   └── print-button.tsx
├── db/
│   ├── index.ts               # neon() + drizzle()
│   └── schema.ts              # 12 tables, 7 pg enums (single file)
└── lib/
    ├── session.ts             # requireUser / requireAdmin
    ├── labels.ts              # enum → {label, tone} metadata for badges
    └── format.ts              # date/money formatters
scripts/seed.ts                # Admin user + 2 report templates (env-driven)
drizzle/                       # 2 SQL migrations + meta
```

Consistent per-module convention: `page.tsx` (list) + `[id]/page.tsx` (detail) + optional `new/page.tsx` + `actions.ts` (server actions).

## 4. Database (12 tables, 7 enums)

| Table | Purpose | Notable columns / constraints |
|---|---|---|
| `users` | Auth + staff directory | `role` enum **admin\|member**, unique email, `password_hash` |
| `clients` | Client registry | Contact data inline (`contact_name`, email, phone) — **no Contact table** |
| `tickets` | Helpdesk | status (5 states), priority (4), nullable `client_id`, `assignee_id`, `created_by_id`; `updated_at` maintained manually |
| `ticket_comments` | Ticket thread | cascade delete with ticket |
| `projects` | Projects | status (5 states), budget numeric, start/due dates |
| `tasks` | Flat project tasks | status **todo\|in_progress\|done**, cascade delete with project |
| `quotes` / `quote_items` | Sales quotes | currency, tax rate; items cascade |
| `report_templates` / `reports` | Document generation | freeform text `content` with `{{placeholders}}`; draft/sent |
| `kpis` / `kpi_entries` | Manual KPI tracking | value per period, target; entries cascade |

Characteristics:

- `serial` integer PKs everywhere; FKs present but **no indexes** beyond PKs/unique email.
- Only `tickets` has `updated_at`; no table has soft delete or audit columns.
- 2 migrations exist and match the schema (`drizzle/meta/_journal.json`).
- **Missing vs PRD domain model:** organizations, teams, contacts, services, contracts, work_items, activities, time_entries, conversations, messages, recurrence_templates, charge_items, audit_logs, and any SLA structure — 13 of the PRD's 18 entities have no table.

## 5. Drizzle ORM

- Single-file schema (`src/db/schema.ts`), clean and idiomatic; enum types derived via `enumValues` in actions.
- Driver is **`neon-http`**, which does **not support transactions** — and no `db.transaction` call exists. Multi-step writes (e.g. `addComment` inserts a comment then updates the ticket) are non-atomic.
- `drizzle.config.ts` loads `.env.local` then `.env` (project convention: `.env`).
- Scripts: `db:generate`, `db:migrate`, `db:push`, `db:seed`. Presence of both `migrate` and `push` invites schema drift if mixed.

## 6. UI components

- `src/components/ui.tsx` is a small but coherent design system (Untitled UI-flavored): buttons (6 variants as class strings), inputs, Card, PageHeader, Badge (7 tones), Avatar, Table, EmptyState, StatCard, Progress, Skeleton.
- Shell: fixed sidebar (collapsible, persisted in localStorage), topbar with breadcrumbs, quick-create menu, ⌘K command menu (static route list, no data search), theme toggle (light/dark, no-flash init script), print support.
- Quality is high: focus rings, aria labels, empty states, tabular-nums, dark mode throughout. Matches CLAUDE.md's "modern SaaS UX" mandate.
- Decorative-only elements: org switcher (hardcoded "Waxxor · Enterprise plan"), notifications bell (always "0 new").

## 7. Routes

| Route | Access | Status |
|---|---|---|
| `/login` | Public | Works (error state via useActionState) |
| `/` | Authenticated | Dashboard (stats, recent tickets, KPIs) |
| `/helpdesk`, `/helpdesk/new`, `/helpdesk/[id]` | Authenticated | Full CRUD + comments |
| `/projects`, `/projects/new`, `/projects/[id]` | Authenticated | CRUD + flat tasks |
| `/clients`, `/clients/[id]` | Authenticated | CRUD (create inline on list page) |
| `/quotes`, `/quotes/new`, `/quotes/[id]` | Authenticated | CRUD + line items + totals |
| `/reports`, `/reports/new`, `/reports/[id]`, `/reports/templates` | Authenticated | Template-based doc generation |
| `/kpis` | Authenticated | KPI defs + manual entries |
| `/users`, `/users/[id]` | **Admin only** | User CRUD, delete guarded |
| `/api/auth/[...nextauth]` | — | Only API route in the app |

No `middleware.ts`: route protection = `requireUser()` in the `(app)` layout plus per-action `requireUser/requireAdmin` calls (every action does call one — verified).

## 8. Frontend state

- Almost fully server-rendered; client components only where needed (shell, login form, submit/print buttons, command menu, theme toggle, dropdowns).
- No client data-fetching library, no global state — mutations via server actions + `revalidatePath`. Appropriate for the app's size.
- Forms are uncontrolled HTML forms posting to server actions; pending states via `useFormStatus`. **No field-level error feedback** — server-side validation failures return silently (form appears to do nothing).

## 9. Backend state

- Pattern: server actions per module; `FormData` parsed by hand (`String(...)`, `toId`), no Zod despite it being a dependency; enum fields cast with `as` (an invalid value would throw a Postgres error → unhandled 500).
- All list pages query Drizzle directly in RSC; dashboard runs 10 queries via `Promise.all`.
- Authorization: `requireAdmin` only on user management; **every other action is open to any authenticated user**, including destructive deletes (quote items, KPIs, templates).
- No service layer — business logic lives in actions/pages. Fine at this size; will not scale to WorkItem/SLA/audit semantics.
- No audit, no logging, no rate limiting, no error boundaries beyond Next defaults.

## 10. Authentication

- Auth.js v5 credentials provider: email lookup → bcrypt compare; JWT strategy; role propagated via jwt/session callbacks; `trustHost: true`.
- `requireUser` / `requireAdmin` in `src/lib/session.ts` (redirect-based).
- Seed script creates the admin from `SEED_ADMIN_EMAIL/PASSWORD/NAME` env vars; also seeds 2 report templates.
- Gaps vs PRD: **2 roles vs 6** (SuperAdmin, Administrator, Director, Project Manager, Technician, Client); no session invalidation on user delete (JWT stays valid until expiry); no password reset; no login rate limiting.

## 11. Dependencies

- Lean and modern; no dead weight except **zod (unused)** and framer-motion (near-unused).
- Risk: `next-auth@5.0.0-beta.31` is a beta pin. Next 16 / React 19 / Tailwind 4 are current.

## 12. Code quality

- **Typecheck:** `tsc --noEmit` passes with zero errors (strict mode).
- **Lint:** `npm run lint` **fails** — 2 × `react-hooks/set-state-in-effect` in `src/components/shell/theme-toggle.tsx`.
- Style is consistent, idiomatic App Router code; naming and file conventions uniform; comments sparse but useful.
- No tests of any kind.

## 13. PRD alignment snapshot

Detailed mapping lives in `docs/backlog/current-status.md`. Summary:

- **Aligned foundations:** auth, clients, tickets, projects shell, UI system, seed/config conventions.
- **Missing:** 13 of 18 domain entities; Activities, Time, Today, Contracts/Services, Recurrence, Audit, Messaging, Client 360, SLA, Configuration.
- **Contradicts PRD:** Quotes module (billing/quoting is future scope §10); 2-role model (§7); Projects contain flat `tasks`, not Lists > Activities > Subactivities (§6 R4); Reports are freeform documents rather than operational reports (§2); KPIs are manually keyed numbers rather than measured SLA/productivity/profitability; no AuditLog despite "audit everything important" (§3).
