import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { organizations, reportTemplates, users } from "../src/db/schema";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (expected in .env)");

  const email = (process.env.SEED_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  const name = process.env.SEED_ADMIN_NAME ?? "Admin";
  if (!email || !password) {
    throw new Error("SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD must be set in .env");
  }

  const db = drizzle(neon(url));

  // Default organization: everything belongs to Watson (slug: watson).
  let [org] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.slug, "watson"));
  if (!org) {
    [org] = await db
      .insert(organizations)
      .values({ name: "Watson", slug: "watson" })
      .returning();
    console.log(`Created organization ${org.name} (id ${org.id}).`);
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) {
    console.log(`Admin user ${email} already exists (id ${existing.id}) — skipping.`);
  } else {
    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await db
      .insert(users)
      .values({ name, email, passwordHash, role: "superadmin", organizationId: org.id })
      .returning({ id: users.id });
    console.log(`Created admin user ${email} (id ${user.id}).`);
  }

  const templates = [
    {
      name: "Monthly security summary",
      description: "Recurring customer-facing status report.",
      content: `# {{title}}

Prepared for {{client}} on {{date}} by {{author}}.
Waxxor — Information Security · waxxor.com

## Executive summary

<One-paragraph summary of the month's security posture and highlights.>

## Activity this period

- Tickets handled:
- Changes / maintenance performed:
- Incidents (if any):

## Findings & recommendations

| # | Finding | Severity | Recommendation |
|---|---------|----------|----------------|
| 1 |         |          |                |

## Next steps

- `,
    },
    {
      name: "Penetration test report",
      description: "Deliverable skeleton for a pentest engagement.",
      content: `# {{title}}

Client: {{client}}
Date: {{date}}
Lead consultant: {{author}}
Classification: CONFIDENTIAL

## 1. Executive summary

## 2. Scope & methodology

## 3. Findings summary

| ID | Title | Severity | Status |
|----|-------|----------|--------|

## 4. Detailed findings

### WX-001 — <Title>
- Severity:
- Description:
- Impact:
- Remediation:

## 5. Conclusions & next steps
`,
    },
  ];

  const existingTemplates = await db.select({ name: reportTemplates.name }).from(reportTemplates);
  const have = new Set(existingTemplates.map((t) => t.name));
  for (const t of templates) {
    if (have.has(t.name)) {
      console.log(`Template "${t.name}" already exists — skipping.`);
      continue;
    }
    await db.insert(reportTemplates).values({ ...t, organizationId: org.id });
    console.log(`Created report template "${t.name}".`);
  }

  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
