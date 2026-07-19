import { and, count, eq, inArray } from "drizzle-orm";
import { signOut } from "@/auth";
import { db } from "@/db";
import { workItems } from "@/db/schema";
import { listTutorials } from "@/lib/help-data";
import { requireUser } from "@/lib/session";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const [[openTickets], tutorials] = await Promise.all([
    db
      .select({ value: count() })
      .from(workItems)
      .where(
        and(
          eq(workItems.organizationId, user.organizationId),
          eq(workItems.type, "ticket"),
          inArray(workItems.status, ["new", "assigned", "in_progress", "waiting_customer", "waiting_third_party", "scheduled", "reopened"]),
        ),
      ),
    listTutorials(),
  ]);

  return (
    <AppShell
      user={{
        name: user.name ?? "User",
        email: user.email ?? "",
        role: user.role,
      }}
      openTickets={openTickets.value}
      tutorials={tutorials.map((t) => ({ slug: t.slug, title: t.title, module: t.module }))}
      signOut={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      {children}
    </AppShell>
  );
}
