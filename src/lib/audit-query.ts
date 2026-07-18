import { eq, gte, lte, type SQL } from "drizzle-orm";
import { auditLogs } from "@/db/schema";

export type AuditFilters = {
  entityType?: string;
  action?: string;
  userId?: string;
  entityId?: string;
  from?: string;
  to?: string;
};

/**
 * Shared filter builder for the audit browser page and its CSV export route —
 * both surfaces apply exactly the same org-scoped conditions.
 */
export function buildAuditConditions(orgId: number, f: AuditFilters): SQL[] {
  const conditions: SQL[] = [eq(auditLogs.organizationId, orgId)];
  if (f.entityType) conditions.push(eq(auditLogs.entityType, f.entityType));
  if (f.action) conditions.push(eq(auditLogs.action, f.action));
  if (f.userId && Number.isInteger(Number(f.userId))) {
    conditions.push(eq(auditLogs.userId, Number(f.userId)));
  }
  if (f.entityId && Number.isInteger(Number(f.entityId))) {
    conditions.push(eq(auditLogs.entityId, Number(f.entityId)));
  }
  if (f.from && /^\d{4}-\d{2}-\d{2}$/.test(f.from)) {
    conditions.push(gte(auditLogs.createdAt, new Date(`${f.from}T00:00:00`)));
  }
  if (f.to && /^\d{4}-\d{2}-\d{2}$/.test(f.to)) {
    conditions.push(lte(auditLogs.createdAt, new Date(`${f.to}T23:59:59.999`)));
  }
  return conditions;
}
