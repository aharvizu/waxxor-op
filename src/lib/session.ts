import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** Returns the signed-in user or redirects to /login. Use at the top of pages and server actions. */
export async function requireUser() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  return session.user;
}

/** Like requireUser, but also requires the admin role; members are sent to the dashboard. */
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") redirect("/");
  return user;
}
