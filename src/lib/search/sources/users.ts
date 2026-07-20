import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { users } from "@/db/schema";
import { bestRankOf, matchesAny } from "../normalize";
import { registerSource } from "../engine";
import type { SearchResultItem } from "../types";

const ROLE_LABEL: Record<string, string> = {
  superadmin: "SuperAdmin",
  administrator: "Administrator",
  director: "Director",
  project_manager: "Project Manager",
  technician: "Technician",
  client: "Client",
};

registerSource({
  category: "users",
  label: "Usuarios",
  iconKey: "user",
  async search(ctx, query, limit) {
    const rank = bestRankOf([users.name, users.email], query);
    const rows = await db
      .select({ id: users.id, name: users.name, email: users.email, role: users.role, title: users.title, isActive: users.isActive, rank })
      .from(users)
      .where(and(eq(users.organizationId, ctx.orgId), matchesAny([users.name, users.email], query)))
      .orderBy(rank)
      .limit(limit);

    return rows.map(
      (r): SearchResultItem => ({
        id: `users:${r.id}`,
        category: "users",
        iconKey: "user",
        title: r.name,
        description: r.title ?? r.email,
        status: r.isActive ? (ROLE_LABEL[r.role] ?? r.role) : "Inactivo",
        route: `/users/${r.id}`,
        breadcrumb: ["Usuarios", r.name],
        rank: r.rank,
      }),
    );
  },
});
