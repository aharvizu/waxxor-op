import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, type DbExecutor } from "@/db";
import { tickets, workItems } from "@/db/schema";
import { diffFields, recordAudit } from "@/lib/audit";
import type { SessionUser } from "@/lib/session";

/** Domain layer for the shared WorkItem model — see docs/architecture/work-item-model.md. */

export type WorkItemType = (typeof workItems.type.enumValues)[number];
export type WorkItemStatus = (typeof workItems.status.enumValues)[number];
export type WorkItemPriority = (typeof workItems.priority.enumValues)[number];
export type WorkItem = typeof workItems.$inferSelect;

export const WORK_ITEM_TYPES = workItems.type.enumValues;

export function isWorkItemType(value: unknown): value is WorkItemType {
  return (
    typeof value === "string" &&
    (WORK_ITEM_TYPES as readonly string[]).includes(value)
  );
}

export const workItemTypeSchema = z.enum(workItems.type.enumValues);
export const workItemStatusSchema = z.enum(workItems.status.enumValues);
export const workItemPrioritySchema = z.enum(workItems.priority.enumValues);

/** Common fields callers may set on creation. */
const createInputSchema = z.object({
  type: workItemTypeSchema,
  title: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  status: workItemStatusSchema.optional(),
  priority: workItemPrioritySchema.optional(),
  companyId: z.number().int().positive().nullable().optional(),
  contactId: z.number().int().positive().nullable().optional(),
  assigneeId: z.number().int().positive().nullable().optional(),
  startDate: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  estimatedMinutes: z.number().int().positive().nullable().optional(),
});
export type CreateWorkItemInput = z.input<typeof createInputSchema>;

/** Common fields callers may change after creation. */
export const WORK_ITEM_UPDATABLE_FIELDS = [
  "title",
  "description",
  "status",
  "priority",
  "companyId",
  "contactId",
  "assigneeId",
  "startDate",
  "dueDate",
  "completedAt",
  "estimatedMinutes",
] as const;
export type UpdateWorkItemPatch = Partial<
  Pick<WorkItem, (typeof WORK_ITEM_UPDATABLE_FIELDS)[number]>
>;

/**
 * Inserts a work item stamped with the caller's organization and writes its
 * audit event. Run inside the caller's transaction (pass tx) so specialization
 * rows and audit commit atomically. Throws ZodError on invalid input.
 */
export async function createWorkItem(
  tx: DbExecutor,
  user: SessionUser,
  input: CreateWorkItemInput,
): Promise<WorkItem> {
  const data = createInputSchema.parse(input);
  const [item] = await tx
    .insert(workItems)
    .values({
      ...data,
      organizationId: user.organizationId,
      createdById: Number(user.id),
    })
    .returning();
  await recordAudit(tx, {
    organizationId: user.organizationId,
    userId: Number(user.id),
    entityType: "work_item",
    entityId: item.id,
    action: "create",
    metadata: { values: { ...data, type: item.type } },
  });
  return item;
}

/**
 * Updates common fields on an org-scoped work item, auditing one event per
 * changed field, and bumps updatedAt. Returns the changed field names
 * ([] when nothing changed, null when the item doesn't exist in the org).
 */
export async function updateWorkItemFields(
  tx: DbExecutor,
  user: SessionUser,
  workItemId: number,
  patch: UpdateWorkItemPatch,
): Promise<string[] | null> {
  const scope = and(
    eq(workItems.id, workItemId),
    eq(workItems.organizationId, user.organizationId),
  );
  const [before] = await tx.select().from(workItems).where(scope);
  if (!before) return null;

  // undefined means "leave untouched" (drizzle ignores it too) — never diff it
  const fields = WORK_ITEM_UPDATABLE_FIELDS.filter(
    (f) => f in patch && patch[f] !== undefined,
  );
  const changes = diffFields(
    {
      organizationId: user.organizationId,
      userId: Number(user.id),
      entityType: "work_item",
      entityId: workItemId,
    },
    before,
    patch,
    fields,
  );
  if (changes.length === 0) return [];

  await tx
    .update(workItems)
    .set({ ...patch, updatedAt: new Date() })
    .where(scope);
  await recordAudit(tx, changes);
  return changes.map((c) => c.field!) as string[];
}

/**
 * Fetches an org-scoped work item together with its specialization row
 * (ticket for type "ticket"; future types return spec: null until they exist).
 */
export async function getWorkItemWithSpecialization(
  user: SessionUser,
  workItemId: number,
): Promise<
  | { item: WorkItem; ticket: typeof tickets.$inferSelect | null }
  | null
> {
  const [item] = await db
    .select()
    .from(workItems)
    .where(
      and(
        eq(workItems.id, workItemId),
        eq(workItems.organizationId, user.organizationId),
      ),
    );
  if (!item) return null;

  if (item.type !== "ticket") return { item, ticket: null };
  const [ticket] = await db
    .select()
    .from(tickets)
    .where(eq(tickets.workItemId, item.id));
  return { item, ticket: ticket ?? null };
}
