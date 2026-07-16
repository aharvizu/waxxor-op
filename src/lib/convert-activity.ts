import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { activities, tickets, workItems } from "@/db/schema";
import { recordAudit } from "@/lib/audit";
import { buildSlaSnapshot, getOrgCalendar, resolveSlaDefinition } from "@/lib/sla";
import type { SessionUser } from "@/lib/session";
import type { WorkItemPriority } from "@/lib/work-items";

/**
 * Activity → Ticket conversion. Same work_items row (identity and history are
 * preserved by construction); the activity specialization becomes a tombstone
 * pointing at the new ticket. See docs/architecture/work-item-model.md.
 */

export const TICKET_CHANNELS = [
  "email",
  "phone",
  "whatsapp",
  "portal",
  "in_person",
  "internal",
] as const;
export const TICKET_MODALITIES = ["remote", "onsite"] as const;

export type ConversionBlock =
  | "not_found"
  | "already_converted"
  | "archived"
  | "no_client"
  | "needs_confirmation";

export class ConversionError extends Error {
  constructor(public readonly reason: ConversionBlock) {
    super(`conversion blocked: ${reason}`);
  }
}

export type ConvertInput = {
  activityId: number;
  /** Final client (already validated against the org). Falls back to the activity's. */
  clientId: number | null;
  contact?: string | null;
  category: string;
  subcategory?: string | null;
  channel: (typeof TICKET_CHANNELS)[number];
  modality: (typeof TICKET_MODALITIES)[number];
  priority: WorkItemPriority;
  /** Already validated against the org. undefined = keep the activity's assignee. */
  assigneeId?: number | null;
  confirmCancelled?: boolean;
  /** Honored only when the caller is superadmin (checked by the action). */
  slaDefinitionId?: number | null;
};

/** Pure guard — the reason conversion is blocked, or null when allowed. */
export function conversionBlockReason(state: {
  convertedAt: Date | null;
  archivedAt: Date | null;
  status: string;
  finalClientId: number | null;
  confirmCancelled: boolean;
}): ConversionBlock | null {
  if (state.convertedAt) return "already_converted";
  if (state.archivedAt) return "archived";
  if (!state.finalClientId) return "no_client";
  if (state.status === "cancelled" && !state.confirmCancelled) {
    return "needs_confirmation";
  }
  return null;
}

/**
 * Runs the whole conversion in ONE transaction: work_item flip, activity
 * tombstone, ticket creation, folio generation and audit. Any failure rolls
 * everything back. Throws ConversionError for business blocks.
 */
export async function convertActivityToTicket(
  user: SessionUser,
  input: ConvertInput,
): Promise<{ ticketId: number; folio: string; workItemId: number }> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({ activity: activities, item: workItems })
      .from(activities)
      .innerJoin(workItems, eq(activities.workItemId, workItems.id))
      .where(
        and(
          eq(activities.id, input.activityId),
          eq(activities.organizationId, user.organizationId),
        ),
      );
    if (!row) throw new ConversionError("not_found");

    const finalClientId = input.clientId ?? row.item.clientId;
    const blocked = conversionBlockReason({
      convertedAt: row.activity.convertedAt,
      archivedAt: row.activity.archivedAt,
      status: row.item.status,
      finalClientId,
      confirmCancelled: input.confirmCancelled ?? false,
    });
    if (blocked) throw new ConversionError(blocked);

    const previous = {
      type: row.item.type,
      status: row.item.status,
      priority: row.item.priority,
      activityType: row.activity.activityType,
      completedAt: row.item.completedAt?.toISOString() ?? null,
    };

    // 1. flip the shared work item — same id, ticket starts as "new"
    await tx
      .update(workItems)
      .set({
        type: "ticket",
        status: "new",
        priority: input.priority,
        clientId: finalClientId,
        assigneeId:
          input.assigneeId !== undefined ? input.assigneeId : row.item.assigneeId,
        completedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(workItems.id, row.item.id));

    // 2. ticket specialization with its immutable, sequence-generated folio
    // SLA cascade: explicit (superadmin) → active default for the priority → none
    const definition = await resolveSlaDefinition(
      tx,
      user.organizationId,
      input.priority,
      user.role === "superadmin" ? (input.slaDefinitionId ?? null) : null,
    );
    const snapshot = definition
      ? buildSlaSnapshot(
          definition,
          await getOrgCalendar(tx, user.organizationId),
          new Date(),
        )
      : {};
    const [ticket] = await tx
      .insert(tickets)
      .values({
        organizationId: user.organizationId,
        workItemId: row.item.id,
        folio: sql`'TK-' || lpad(nextval('ticket_folio_seq')::text, 6, '0')`,
        category: input.category,
        subcategory: input.subcategory ?? null,
        channel: input.channel,
        modality: input.modality,
        contact: input.contact ?? null,
        ...snapshot,
      })
      .returning({ id: tickets.id, folio: tickets.folio });

    // 3. deactivate the activity as a tombstone that redirects old links
    await tx
      .update(activities)
      .set({ convertedTicketId: ticket.id, convertedAt: new Date() })
      .where(eq(activities.id, row.activity.id));

    // 4. full audit: the conversion on the work item + the ticket's birth
    await recordAudit(tx, [
      {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "work_item",
        entityId: row.item.id,
        action: "convert",
        metadata: {
          from: "activity",
          to: "ticket",
          previous,
          activityId: row.activity.id,
          ticketId: ticket.id,
          folio: ticket.folio,
        },
      },
      {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "ticket",
        entityId: ticket.id,
        action: "create",
        metadata: {
          workItemId: row.item.id,
          folio: ticket.folio,
          convertedFromActivityId: row.activity.id,
        },
      },
    ]);

    return { ticketId: ticket.id, folio: ticket.folio, workItemId: row.item.id };
  });
}
