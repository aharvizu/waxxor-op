import type { DbExecutor } from "@/db";
import { auditLogs } from "@/db/schema";

/**
 * Audit event conventions — see docs/architecture/audit-log.md.
 * create/delete: one event, snapshot in `metadata`.
 * update: one event per changed field, with old/new values as strings.
 */
export type AuditEvent = {
  /** Required: every audit event belongs to an organization. */
  organizationId: number;
  userId?: number | null;
  entityType: string;
  entityId: number;
  action: "create" | "update" | "delete" | "convert";
  field?: string;
  oldValue?: string | null;
  newValue?: string | null;
  metadata?: Record<string, unknown>;
  /** Channel the change came from: "web" (default), "seed", "system". */
  source?: string;
};

/** Serialize a column value for old_value/new_value. */
function toAuditValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/**
 * Writes audit events on the given executor — pass the open transaction so the
 * business write and its audit trail commit or roll back together. Errors
 * propagate: an audit failure must abort the caller's transaction.
 */
export async function recordAudit(
  tx: DbExecutor,
  events: AuditEvent | AuditEvent[],
): Promise<void> {
  const list = Array.isArray(events) ? events : [events];
  if (list.length === 0) return;
  await tx.insert(auditLogs).values(
    list.map((e) => ({
      organizationId: e.organizationId,
      userId: e.userId ?? null,
      entityType: e.entityType,
      entityId: e.entityId,
      action: e.action,
      field: e.field ?? null,
      oldValue: e.oldValue ?? null,
      newValue: e.newValue ?? null,
      metadata: e.metadata ?? null,
      source: e.source ?? "web",
    })),
  );
}

/**
 * Compares two records over `fields` and returns one update event per field
 * that actually changed. Returns [] when nothing changed.
 */
export function diffFields<T extends Record<string, unknown>>(
  base: Omit<AuditEvent, "action" | "field" | "oldValue" | "newValue">,
  before: T,
  after: Partial<T>,
  fields: readonly (keyof T & string)[],
): AuditEvent[] {
  const events: AuditEvent[] = [];
  for (const field of fields) {
    const oldValue = toAuditValue(before[field]);
    const newValue = toAuditValue(after[field]);
    if (oldValue !== newValue) {
      events.push({ ...base, action: "update", field, oldValue, newValue });
    }
  }
  return events;
}
