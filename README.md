# Waxxor Ops

Internal business operations app for **Waxxor — Information Security** ([waxxor.com](https://waxxor.com)).

Modules:

- **Dashboard** — at-a-glance KPIs: open tickets, active projects, quote pipeline and acceptance rate.
- **Helpdesk** — customer tickets with priority, status, assignee, and comment threads.
- **Projects** — engagements with tasks, budgets, and due dates.
- **Quotes** — quotation builder with line items, tax, currency, and a print-ready layout.
- **Reports** — reusable report templates (`{{client}}`, `{{date}}`, `{{title}}`, `{{author}}` placeholders) → generate, edit, print/PDF, and mark as sent.
- **KPIs** — define custom metrics with targets and record values over time.
- **Clients** — the customer directory the other modules link to.

## Stack

- [Next.js](https://nextjs.org) (App Router) + TypeScript + Tailwind CSS v4
- [Neon](https://neon.tech) serverless Postgres + [Drizzle ORM](https://orm.drizzle.team)
- [Auth.js](https://authjs.dev) (NextAuth v5) — credentials login with bcrypt-hashed passwords

## Getting started

1. **Create a Neon database** at [console.neon.tech](https://console.neon.tech) (free tier is fine) and copy the pooled connection string.

2. **Configure environment** — edit `.env` (created from `.env.example`):

   ```bash
   DATABASE_URL="<your Neon connection string>"
   AUTH_SECRET="<openssl rand -base64 32>"
   SEED_ADMIN_EMAIL="you@waxxor.com"
   SEED_ADMIN_PASSWORD="<a strong password>"
   ```

3. **Create the schema and seed the admin user + starter report templates:**

   ```bash
   npm run db:migrate   # applies migrations in ./drizzle
   npm run db:seed      # creates the admin user and two report templates
   ```

4. **Run it:**

   ```bash
   npm run dev
   ```

   Open http://localhost:3000 and sign in with the seeded admin credentials.

## Database workflow

- Edit the schema in `src/db/schema.ts`
- `npm run db:generate` — generate a new SQL migration into `./drizzle`
- `npm run db:migrate` — apply migrations
- `npm run db:push` — push schema directly (prototyping only)

## Adding users

There is no self-registration (internal tool). Re-run `npm run db:seed` with different
`SEED_ADMIN_*` values, or insert a user with a bcrypt hash directly.

## Notes

- "Mark as sent" on reports records the timestamp; actual email delivery is a good next step
  (e.g. [Resend](https://resend.com)) — the print/PDF view works today via the Print button.
- Deploys cleanly to [Vercel](https://vercel.com): set `DATABASE_URL` and `AUTH_SECRET` in project env vars.
