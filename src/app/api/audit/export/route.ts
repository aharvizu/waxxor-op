import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs, users } from "@/db/schema";
import { auth } from "@/auth";
import { buildAuditConditions, type AuditFilters } from "@/lib/audit-query";
import { hasRole } from "@/lib/roles";
import { toCsv } from "@/lib/reports";

const EXPORT_LIMIT = 5000;

/**
 * CSV export of the audit browser — same org-scoped filters as
 * /settings/audit, CSV-injection-safe via toCsv. SuperAdmin/Administrator only
 * (the roles that see the technical log elsewhere).
 */
export async function GET(req: Request) {
  const session = await auth();
  const user = session?.user;
  if (!user || !user.organizationId || !hasRole(user.role, ["superadmin", "administrator"])) {
    return new Response("Unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const filters: AuditFilters = {
    entityType: url.searchParams.get("entityType") ?? undefined,
    action: url.searchParams.get("action") ?? undefined,
    userId: url.searchParams.get("userId") ?? undefined,
    entityId: url.searchParams.get("entityId") ?? undefined,
    from: url.searchParams.get("from") ?? undefined,
    to: url.searchParams.get("to") ?? undefined,
  };

  const rows = await db
    .select({
      createdAt: auditLogs.createdAt,
      actorName: users.name,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      action: auditLogs.action,
      field: auditLogs.field,
      oldValue: auditLogs.oldValue,
      newValue: auditLogs.newValue,
      source: auditLogs.source,
    })
    .from(auditLogs)
    .leftJoin(users, eq(users.id, auditLogs.userId))
    .where(and(...buildAuditConditions(user.organizationId, filters)))
    .orderBy(desc(auditLogs.createdAt))
    .limit(EXPORT_LIMIT);

  const csv = toCsv(
    ["fecha", "actor", "entidad", "id", "accion", "campo", "valor_anterior", "valor_nuevo", "origen"],
    rows.map((r) => [
      r.createdAt.toISOString(),
      r.actorName ?? "Sistema",
      r.entityType,
      r.entityId,
      r.action,
      r.field ?? "",
      r.oldValue ?? "",
      r.newValue ?? "",
      r.source,
    ]),
  );

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="auditoria-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
