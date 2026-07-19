import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  auditLogs,
  companies,
  contacts,
  conversations,
  messages,
  tickets,
  users,
  workItems,
} from "@/db/schema";

/**
 * Data layer for Contact 360. Mirrors the shape of company360-data.ts —
 * header/summary in one pass, tabs queried on demand. Contact is now an
 * independent entity (2026-07-20 Company/Contact split); relations to
 * tickets/activities/conversations run off work_items.contactId and
 * conversations.contactId, both real FKs added in that same migration.
 */

export async function getContactsDirectory(
  orgId: number,
  opts: { q?: string; companyId?: number; status?: string } = {},
) {
  const conditions = [eq(contacts.organizationId, orgId)];
  if (opts.companyId) conditions.push(eq(contacts.companyId, opts.companyId));
  if (opts.status === "active") conditions.push(eq(contacts.isActive, true));
  else if (opts.status === "inactive") conditions.push(eq(contacts.isActive, false));
  if (opts.q) {
    const term = `%${opts.q.trim()}%`;
    conditions.push(
      sql`(
        ${contacts.firstName} || ' ' || ${contacts.lastName} ilike ${term}
        or coalesce(${contacts.email}, '') ilike ${term}
        or coalesce(${contacts.phone}, '') ilike ${term}
        or coalesce(${contacts.mobile}, '') ilike ${term}
        or ${companies.name} ilike ${term}
      )`,
    );
  }

  return db
    .select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      jobTitle: contacts.jobTitle,
      department: contacts.department,
      email: contacts.email,
      phone: contacts.phone,
      mobile: contacts.mobile,
      contactType: contacts.contactType,
      isPrimary: contacts.isPrimary,
      isActive: contacts.isActive,
      companyId: contacts.companyId,
      companyName: companies.name,
      openTickets: sql<number>`(select count(*)::int from ${workItems} w
        where w.contact_id = ${contacts.id} and w.type = 'ticket'
        and w.status in ('new','assigned','in_progress','waiting_customer','waiting_third_party','scheduled','reopened'))`,
    })
    .from(contacts)
    .innerJoin(companies, eq(contacts.companyId, companies.id))
    .where(and(...conditions))
    .orderBy(desc(contacts.isPrimary), asc(contacts.lastName))
    .limit(200);
}

export async function getContactSummary(orgId: number, contactId: number) {
  const [row] = await db
    .select({
      contact: contacts,
      companyId: companies.id,
      companyName: companies.name,
      companyStatus: companies.status,
    })
    .from(contacts)
    .innerJoin(companies, eq(contacts.companyId, companies.id))
    .where(and(eq(contacts.id, contactId), eq(contacts.organizationId, orgId)));
  return row ?? null;
}

export async function getContactWorkItems(
  orgId: number,
  contactId: number,
  type: "ticket" | "activity",
  limit = 100,
) {
  return db
    .select({
      id: type === "ticket" ? tickets.id : activities.id,
      workItemId: workItems.id,
      folio: tickets.folio,
      title: workItems.title,
      status: workItems.status,
      priority: workItems.priority,
      assigneeName: users.name,
      companyId: workItems.companyId,
      dueDate: workItems.dueDate,
      updatedAt: workItems.updatedAt,
    })
    .from(workItems)
    .leftJoin(tickets, eq(tickets.workItemId, workItems.id))
    .leftJoin(activities, eq(activities.workItemId, workItems.id))
    .leftJoin(users, eq(workItems.assigneeId, users.id))
    .where(
      and(
        eq(workItems.organizationId, orgId),
        eq(workItems.contactId, contactId),
        eq(workItems.type, type),
      ),
    )
    .orderBy(desc(workItems.updatedAt))
    .limit(limit);
}

export async function getContactConversations(orgId: number, contactId: number, limit = 20) {
  const lastMessage = db.$with("last_message").as(
    db
      .selectDistinctOn([messages.conversationId], {
        conversationId: messages.conversationId,
        direction: messages.direction,
        occurredAt: messages.occurredAt,
        body: messages.body,
        channel: messages.channel,
      })
      .from(messages)
      .orderBy(messages.conversationId, desc(messages.occurredAt)),
  );
  return db
    .with(lastMessage)
    .select({
      conversationId: conversations.id,
      status: conversations.status,
      subject: conversations.subject,
      ticketId: tickets.id,
      folio: tickets.folio,
      title: workItems.title,
      assigneeName: users.name,
      direction: lastMessage.direction,
      channel: lastMessage.channel,
      body: lastMessage.body,
      occurredAt: lastMessage.occurredAt,
    })
    .from(conversations)
    .leftJoin(lastMessage, eq(lastMessage.conversationId, conversations.id))
    .leftJoin(tickets, eq(conversations.ticketId, tickets.id))
    .leftJoin(workItems, eq(tickets.workItemId, workItems.id))
    .leftJoin(users, eq(workItems.assigneeId, users.id))
    .where(and(eq(conversations.organizationId, orgId), eq(conversations.contactId, contactId)))
    .orderBy(sql`${lastMessage.occurredAt} desc nulls last`)
    .limit(limit);
}

/** Every AuditLog row for this contact (readable history tab). */
export async function getContactAuditTrail(orgId: number, contactId: number, limit = 100) {
  return db
    .select({ log: auditLogs, actorName: users.name })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(
      and(
        eq(auditLogs.organizationId, orgId),
        eq(auditLogs.entityType, "contact"),
        eq(auditLogs.entityId, contactId),
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

/** Sibling contacts at the same company, for cross-navigation. */
export async function getCompanyContactsExcluding(orgId: number, companyId: number, excludeId: number) {
  return db
    .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName, jobTitle: contacts.jobTitle })
    .from(contacts)
    .where(
      and(
        eq(contacts.organizationId, orgId),
        eq(contacts.companyId, companyId),
        ne(contacts.id, excludeId),
      ),
    )
    .orderBy(asc(contacts.lastName));
}
