import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  auditLogs,
  clientNotes,
  clientServices,
  clients,
  contacts,
  contracts,
  conversations,
  messages,
  projects,
  reports,
  services,
  tickets,
  timeEntries,
  users,
  workItems,
} from "@/db/schema";
import type { RenewalItem } from "@/lib/client360";

/**
 * Data layer for Client 360. Header/summary aggregates run in ONE SQL pass
 * per source (no N+1); tabs query on demand (single tab rendered per request).
 * Time and conversations are limited/paginated — never full history.
 */

/** All upcoming/overdue renewals for the org (feeds Client 360 AND Today). */
export async function getOrgRenewals(orgId: number, horizonDays = 90): Promise<RenewalItem[]> {
  const horizon = new Date(Date.now() + horizonDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const [serviceRows, contractRows] = await Promise.all([
    db
      .select({
        sourceId: clientServices.id,
        clientId: clientServices.clientId,
        clientName: clients.name,
        concept: services.name,
        kind: clientServices.serviceType,
        date: clientServices.renewalDate,
        amount: clientServices.clientPrice,
        ownerName: users.name,
        status: clientServices.status,
      })
      .from(clientServices)
      .innerJoin(clients, eq(clientServices.clientId, clients.id))
      .innerJoin(services, eq(clientServices.serviceId, services.id))
      .leftJoin(users, eq(clients.accountOwnerId, users.id))
      .where(
        and(
          eq(clientServices.organizationId, orgId),
          eq(clientServices.status, "active"),
          sql`${clientServices.renewalDate} is not null and ${clientServices.renewalDate} <= ${horizon}`,
        ),
      ),
    db
      .select({
        sourceId: contracts.id,
        clientId: contracts.clientId,
        clientName: clients.name,
        concept: contracts.name,
        kind: contracts.contractType,
        date: contracts.endDate,
        amount: contracts.monthlyAmount,
        ownerName: users.name,
        status: contracts.status,
      })
      .from(contracts)
      .innerJoin(clients, eq(contracts.clientId, clients.id))
      .leftJoin(users, eq(clients.accountOwnerId, users.id))
      .where(
        and(
          eq(contracts.organizationId, orgId),
          eq(contracts.status, "active"),
          sql`${contracts.endDate} is not null and ${contracts.endDate} <= ${horizon}`,
        ),
      ),
  ]);
  const items: RenewalItem[] = [];
  for (const r of serviceRows) {
    items.push({ source: "client_service", ...r, date: r.date! });
  }
  for (const r of contractRows) {
    items.push({ source: "contract", ...r, date: r.date! });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Client directory rows: search across name/legal name/contacts/services and
 * per-row aggregates as correlated subqueries (one round trip, no N+1).
 */
export async function getClientsDirectory(
  orgId: number,
  opts: { q?: string; status?: string; filter?: "renewal" | "open_tickets" | "pending_billing" } = {},
) {
  const conditions = [eq(clients.organizationId, orgId)];
  if (opts.status && ["active", "inactive", "prospect_legacy", "archived"].includes(opts.status)) {
    conditions.push(eq(clients.status, opts.status as typeof clients.$inferSelect.status));
  } else if (!opts.status) {
    conditions.push(ne(clients.status, "archived"));
  }
  if (opts.q) {
    const term = `%${opts.q.trim()}%`;
    conditions.push(
      sql`(
        ${clients.name} ilike ${term}
        or coalesce(${clients.legalName}, '') ilike ${term}
        or coalesce(${clients.email}, '') ilike ${term}
        or coalesce(${clients.phone}, '') ilike ${term}
        or exists (select 1 from ${contacts} c where c.client_id = ${clients.id}
          and (c.first_name || ' ' || c.last_name ilike ${term}
            or coalesce(c.email, '') ilike ${term}
            or coalesce(c.phone, '') ilike ${term}
            or coalesce(c.mobile, '') ilike ${term}))
        or exists (select 1 from ${clientServices} cs join ${services} s on s.id = cs.service_id
          where cs.client_id = ${clients.id} and s.name ilike ${term})
      )`,
    );
  }

  const openTickets = sql<number>`(select count(*)::int from ${workItems} w
    where w.client_id = ${clients.id} and w.type = 'ticket'
    and w.status in ('new','assigned','in_progress','waiting_customer','waiting_third_party','scheduled','reopened'))`;
  const pendingBilling = sql<number>`(select count(*)::int from ${tickets} t
    join ${workItems} w on w.id = t.work_item_id
    where w.client_id = ${clients.id} and t.billing_status = 'pending_review')`;
  const nextRenewal = sql<string | null>`(select min(d) from (
    select cs.renewal_date as d from ${clientServices} cs
      where cs.client_id = ${clients.id} and cs.status = 'active' and cs.renewal_date is not null
    union all
    select ct.end_date from ${contracts} ct
      where ct.client_id = ${clients.id} and ct.status = 'active' and ct.end_date is not null
  ) r)`;

  if (opts.filter === "renewal") {
    conditions.push(sql`${nextRenewal} <= current_date + 30`);
  } else if (opts.filter === "open_tickets") {
    conditions.push(sql`${openTickets} > 0`);
  } else if (opts.filter === "pending_billing") {
    conditions.push(sql`${pendingBilling} > 0`);
  }

  return db
    .select({
      id: clients.id,
      name: clients.name,
      status: clients.status,
      email: clients.email,
      phone: clients.phone,
      primaryContact: sql<string | null>`(select c.first_name || ' ' || c.last_name
        from ${contacts} c where c.id = ${clients.primaryContactId})`,
      accountOwnerName: users.name,
      activeServices: sql<number>`(select count(*)::int from ${clientServices} cs
        where cs.client_id = ${clients.id} and cs.status = 'active')`,
      openTickets,
      pendingBilling,
      nextRenewal,
      lastTouchAt: sql<Date | null>`(select max(w.updated_at) from ${workItems} w
        where w.client_id = ${clients.id})`,
    })
    .from(clients)
    .leftJoin(users, eq(clients.accountOwnerId, users.id))
    .where(and(...conditions))
    .orderBy(asc(clients.name))
    .limit(200);
}

/** Header + summary aggregates for one client, in parallel single-pass queries. */
export async function getClientSummary(orgId: number, clientId: number) {
  const now = new Date();
  const [workAgg, timeAgg, convAgg, lastTouch, activeServices, activeContracts, notesCount] =
    await Promise.all([
      db
        .select({
          openTickets: sql<number>`count(*) filter (where ${workItems.type} = 'ticket' and ${workItems.status} in ('new','assigned','in_progress','waiting_customer','waiting_third_party','scheduled','reopened'))::int`,
          overdueTickets: sql<number>`count(*) filter (where ${workItems.type} = 'ticket' and ${workItems.status} in ('new','assigned','in_progress','scheduled','reopened') and ${tickets.resolutionTargetAt} < now() and ${tickets.slaPausedAt} is null)::int`,
          slaAtRisk: sql<number>`count(*) filter (where ${workItems.type} = 'ticket' and ${workItems.status} in ('new','assigned','in_progress','scheduled','reopened') and ${tickets.slaPausedAt} is null and ${tickets.resolutionTargetAt} > now() and ${tickets.resolutionTargetAt} < now() + (${tickets.slaResolutionMinutes} * interval '1 minute') * 0.25)::int`,
          pendingConfirmation: sql<number>`count(*) filter (where ${workItems.status} = 'pending_confirmation')::int`,
          openActivities: sql<number>`count(*) filter (where ${workItems.type} = 'activity' and ${workItems.status} in ('pending','in_progress','waiting','blocked'))::int`,
          overdueActivities: sql<number>`count(*) filter (where ${workItems.type} = 'activity' and ${workItems.status} in ('pending','in_progress','waiting','blocked') and ${workItems.dueDate} < current_date)::int`,
          billingPendingReview: sql<number>`count(*) filter (where ${tickets.billingStatus} = 'pending_review')::int`,
        })
        .from(workItems)
        .leftJoin(tickets, eq(tickets.workItemId, workItems.id))
        .where(and(eq(workItems.organizationId, orgId), eq(workItems.clientId, clientId))),
      db
        .select({
          monthMinutes: sql<number>`coalesce(sum(${timeEntries.durationMinutes}) filter (where date_trunc('month', ${timeEntries.date}::date) = date_trunc('month', current_date)), 0)::int`,
          totalMinutes: sql<number>`coalesce(sum(${timeEntries.durationMinutes}), 0)::int`,
        })
        .from(timeEntries)
        .innerJoin(workItems, eq(timeEntries.workItemId, workItems.id))
        .where(
          and(
            eq(timeEntries.organizationId, orgId),
            eq(workItems.clientId, clientId),
            isNull(timeEntries.voidedAt),
          ),
        ),
      db
        .select({
          unanswered: sql<number>`count(*)::int`,
        })
        .from(conversations)
        .where(
          and(
            eq(conversations.organizationId, orgId),
            eq(conversations.clientId, clientId),
            sql`${conversations.status} in ('open', 'pending')`,
            sql`exists (select 1 from ${messages} m where m.conversation_id = ${conversations.id} and m.direction = 'inbound' and m.occurred_at = (select max(m2.occurred_at) from ${messages} m2 where m2.conversation_id = ${conversations.id}))`,
          ),
        ),
      db
        .select({ last: sql<Date | null>`max(${workItems.updatedAt})` })
        .from(workItems)
        .where(and(eq(workItems.organizationId, orgId), eq(workItems.clientId, clientId))),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(clientServices)
        .where(
          and(
            eq(clientServices.organizationId, orgId),
            eq(clientServices.clientId, clientId),
            eq(clientServices.status, "active"),
          ),
        ),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(contracts)
        .where(
          and(
            eq(contracts.organizationId, orgId),
            eq(contracts.clientId, clientId),
            eq(contracts.status, "active"),
          ),
        ),
      db
        .select({ n: sql<number>`count(*)::int` })
        .from(clientNotes)
        .where(and(eq(clientNotes.organizationId, orgId), eq(clientNotes.clientId, clientId))),
    ]);
  return {
    ...workAgg[0],
    ...timeAgg[0],
    unansweredConversations: convAgg[0].unanswered,
    lastTouchAt: lastTouch[0].last ? new Date(lastTouch[0].last) : null,
    activeServices: activeServices[0].n,
    activeContracts: activeContracts[0].n,
    notesCount: notesCount[0].n,
    now,
  };
}

export async function getClientWorkItems(
  orgId: number,
  clientId: number,
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
      category: tickets.category,
      slaName: tickets.slaName,
      resolutionTargetAt: tickets.resolutionTargetAt,
      billingStatus: tickets.billingStatus,
      calculatedAmount: tickets.calculatedAmount,
      billingModality: tickets.billingModality,
      billingPeriod: tickets.billingPeriod,
      externalReference: tickets.externalReference,
      dueDate: workItems.dueDate,
      updatedAt: workItems.updatedAt,
      parentTicketId: activities.parentTicketId,
      minutes: sql<number>`coalesce((select sum(te.duration_minutes)::int from ${timeEntries} te where te.work_item_id = ${workItems.id} and te.voided_at is null), 0)`,
    })
    .from(workItems)
    .leftJoin(tickets, eq(tickets.workItemId, workItems.id))
    .leftJoin(activities, eq(activities.workItemId, workItems.id))
    .leftJoin(users, eq(workItems.assigneeId, users.id))
    .where(
      and(
        eq(workItems.organizationId, orgId),
        eq(workItems.clientId, clientId),
        eq(workItems.type, type),
      ),
    )
    .orderBy(desc(workItems.updatedAt))
    .limit(limit);
}

export async function getClientContacts(orgId: number, clientId: number) {
  return db
    .select()
    .from(contacts)
    .where(and(eq(contacts.organizationId, orgId), eq(contacts.clientId, clientId)))
    .orderBy(desc(contacts.isPrimary), asc(contacts.lastName));
}

export async function getClientServicesList(orgId: number, clientId: number) {
  return db
    .select({ cs: clientServices, serviceName: services.name, serviceCategory: services.category })
    .from(clientServices)
    .innerJoin(services, eq(clientServices.serviceId, services.id))
    .where(and(eq(clientServices.organizationId, orgId), eq(clientServices.clientId, clientId)))
    .orderBy(asc(services.name));
}

export async function getClientContracts(orgId: number, clientId: number) {
  return db
    .select()
    .from(contracts)
    .where(and(eq(contracts.organizationId, orgId), eq(contracts.clientId, clientId)))
    .orderBy(desc(contracts.startDate));
}

/** Contract consumed hours = client's included_in_contract time within the period. */
export async function getContractConsumedMinutes(
  orgId: number,
  clientId: number,
  startDate: string,
  endDate: string | null,
): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${timeEntries.durationMinutes}), 0)::int` })
    .from(timeEntries)
    .innerJoin(workItems, eq(timeEntries.workItemId, workItems.id))
    .where(
      and(
        eq(timeEntries.organizationId, orgId),
        eq(workItems.clientId, clientId),
        isNull(timeEntries.voidedAt),
        eq(timeEntries.billingStatus, "included_in_contract"),
        sql`${timeEntries.date} >= ${startDate}`,
        endDate ? sql`${timeEntries.date} <= ${endDate}` : sql`true`,
      ),
    );
  return row.total;
}

export async function getClientConversations(orgId: number, clientId: number, limit = 20) {
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
    .where(and(eq(conversations.organizationId, orgId), eq(conversations.clientId, clientId)))
    .orderBy(sql`${lastMessage.occurredAt} desc nulls last`)
    .limit(limit);
}

/** Time rollups for the client (single pass; entries paginated separately). */
export async function getClientTimeRollup(
  orgId: number,
  clientId: number,
  from: string,
  to: string,
) {
  const base = and(
    eq(timeEntries.organizationId, orgId),
    eq(workItems.clientId, clientId),
    isNull(timeEntries.voidedAt),
    sql`${timeEntries.date} >= ${from} and ${timeEntries.date} <= ${to}`,
  );
  const [totals, byUser, byType, byItem] = await Promise.all([
    db
      .select({
        total: sql<number>`coalesce(sum(${timeEntries.durationMinutes}), 0)::int`,
        billable: sql<number>`coalesce(sum(${timeEntries.durationMinutes}) filter (where ${timeEntries.billingStatus} = 'billable'), 0)::int`,
        nonBillable: sql<number>`coalesce(sum(${timeEntries.durationMinutes}) filter (where ${timeEntries.billingStatus} = 'non_billable'), 0)::int`,
        inContract: sql<number>`coalesce(sum(${timeEntries.durationMinutes}) filter (where ${timeEntries.billingStatus} = 'included_in_contract'), 0)::int`,
        pendingReview: sql<number>`coalesce(sum(${timeEntries.durationMinutes}) filter (where ${timeEntries.billingStatus} = 'pending_review'), 0)::int`,
      })
      .from(timeEntries)
      .innerJoin(workItems, eq(timeEntries.workItemId, workItems.id))
      .where(base),
    db
      .select({
        name: users.name,
        minutes: sql<number>`sum(${timeEntries.durationMinutes})::int`,
      })
      .from(timeEntries)
      .innerJoin(workItems, eq(timeEntries.workItemId, workItems.id))
      .leftJoin(users, eq(timeEntries.userId, users.id))
      .where(base)
      .groupBy(users.name)
      .orderBy(desc(sql`sum(${timeEntries.durationMinutes})`)),
    db
      .select({
        timeType: timeEntries.timeType,
        minutes: sql<number>`sum(${timeEntries.durationMinutes})::int`,
      })
      .from(timeEntries)
      .innerJoin(workItems, eq(timeEntries.workItemId, workItems.id))
      .where(base)
      .groupBy(timeEntries.timeType)
      .orderBy(desc(sql`sum(${timeEntries.durationMinutes})`)),
    db
      .select({
        title: workItems.title,
        type: workItems.type,
        minutes: sql<number>`sum(${timeEntries.durationMinutes})::int`,
      })
      .from(timeEntries)
      .innerJoin(workItems, eq(timeEntries.workItemId, workItems.id))
      .where(base)
      .groupBy(workItems.title, workItems.type)
      .orderBy(desc(sql`sum(${timeEntries.durationMinutes})`))
      .limit(15),
  ]);
  return { totals: totals[0], byUser, byType, byItem };
}

export async function getClientNotes(orgId: number, clientId: number) {
  return db
    .select({ note: clientNotes, authorName: users.name })
    .from(clientNotes)
    .leftJoin(users, eq(clientNotes.authorId, users.id))
    .where(and(eq(clientNotes.organizationId, orgId), eq(clientNotes.clientId, clientId)))
    .orderBy(desc(clientNotes.createdAt))
    .limit(50);
}

export async function getClientProjects(orgId: number, clientId: number) {
  return db
    .select({
      id: projects.id,
      folio: projects.folio,
      name: projects.name,
      status: projects.status,
      healthStatus: projects.healthStatus,
      priority: projects.priority,
      startDate: projects.startDate,
      targetDate: projects.targetDate,
      managerName: users.name,
      totalActivities: sql<number>`(select count(*)::int from activities a
        join work_items w on w.id = a.work_item_id
        where a.project_id = ${projects.id} and a.converted_at is null
        and w.status not in ('cancelled','archived'))`,
      completedActivities: sql<number>`(select count(*)::int from activities a
        join work_items w on w.id = a.work_item_id
        where a.project_id = ${projects.id} and a.converted_at is null
        and w.status = 'completed')`,
      loggedMinutes: sql<number>`coalesce((select sum(te.duration_minutes)::int
        from time_entries te join activities a on a.work_item_id = te.work_item_id
        where a.project_id = ${projects.id} and te.voided_at is null), 0)`,
      nextMilestone: sql<string | null>`(select m.name || ' · ' || m.target_date::text
        from project_milestones m
        where m.project_id = ${projects.id} and m.status in ('pending','in_progress','delayed')
        order by m.target_date asc limit 1)`,
      openHighRisks: sql<number>`(select count(*)::int from project_risks r
        where r.project_id = ${projects.id} and r.status in ('open','monitoring','occurred')
        and (r.probability = 'high' and r.impact in ('high','critical')
          or r.impact = 'critical' and r.probability in ('medium','high')
          or r.probability = 'medium' and r.impact = 'critical'))`,
    })
    .from(projects)
    .leftJoin(users, eq(projects.projectManagerId, users.id))
    .where(and(eq(projects.organizationId, orgId), eq(projects.clientId, clientId)))
    .orderBy(desc(projects.createdAt));
}

/**
 * Every AuditLog row for this client and everything that belongs to it
 * (contacts, services, contracts, notes). Feeds both the readable timeline
 * (all internal roles) and the raw technical view (SuperAdmin/Administrator only).
 */
export async function getClientAuditTrail(orgId: number, clientId: number, limit = 100) {
  const [contactIds, serviceIds, contractIds, noteIds] = await Promise.all([
    db.select({ id: contacts.id }).from(contacts).where(eq(contacts.clientId, clientId)),
    db.select({ id: clientServices.id }).from(clientServices).where(eq(clientServices.clientId, clientId)),
    db.select({ id: contracts.id }).from(contracts).where(eq(contracts.clientId, clientId)),
    db.select({ id: clientNotes.id }).from(clientNotes).where(eq(clientNotes.clientId, clientId)),
  ]);

  const scoped = (entityType: string, ids: number[]) =>
    ids.length > 0
      ? and(eq(auditLogs.entityType, entityType), inArray(auditLogs.entityId, ids))
      : sql`false`;

  return db
    .select({ log: auditLogs, actorName: users.name })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(
      and(
        eq(auditLogs.organizationId, orgId),
        or(
          and(eq(auditLogs.entityType, "client"), eq(auditLogs.entityId, clientId)),
          scoped(
            "contact",
            contactIds.map((r) => r.id),
          ),
          scoped(
            "client_service",
            serviceIds.map((r) => r.id),
          ),
          scoped(
            "contract",
            contractIds.map((r) => r.id),
          ),
          scoped(
            "client_note",
            noteIds.map((r) => r.id),
          ),
        ),
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

export async function getClientReports(orgId: number, clientId: number) {
  return db
    .select()
    .from(reports)
    .where(and(eq(reports.organizationId, orgId), eq(reports.clientId, clientId)))
    .orderBy(desc(reports.createdAt))
    .limit(20);
}
