import { count, inArray } from "drizzle-orm";
import { signOut } from "@/auth";
import { db } from "@/db";
import { tickets } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { AppShell } from "@/components/shell/app-shell";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();
  const [openTickets] = await db
    .select({ value: count() })
    .from(tickets)
    .where(inArray(tickets.status, ["open", "in_progress", "waiting_on_customer"]));

  return (
    <AppShell
      user={{
        name: user.name ?? "User",
        email: user.email ?? "",
        role: user.role,
      }}
      openTickets={openTickets.value}
      signOut={async () => {
        "use server";
        await signOut({ redirectTo: "/login" });
      }}
    >
      {children}
    </AppShell>
  );
}
