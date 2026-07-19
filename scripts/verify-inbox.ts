import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

/**
 * DB-level invariants for the Inbox feature (UI flows are exercised over HTTP
 * in the smoke run — see docs/features/inbox.md):
 *   1. Conversation without ticket (activity + client + project links) persists;
 *   2. postConversationMessage writes the message, bumps the conversation and
 *      sets the author's read cursor;
 *   3. Mentions: selected users get mention rows; the author is never
 *      self-mentioned; unread mention feeds resolve them;
 *   4. Unread semantics: another user sees the message as unread until their
 *      cursor moves;
 *   5. Logical delete preserves the row (deletedAt set, body intact for audit);
 *   6. SLA first response: an outbound message through the SHARED service on a
 *      ticket conversation stamps firstResponseAt exactly once;
 *   7. System events are direction "system" and excluded from unread counts;
 *   8. Ticket 1:1 rule holds — second conversation for the same ticket is
 *      rejected by the unique index;
 *   9. Organization isolation: another org resolves nothing;
 *  10. Rollback: audit failure aborts the message write.
 * Cleans up everything it creates. Exits 1 on any violation.
 */

async function main() {
  const { and, eq, sql } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const {
    activities,
    auditLogs,
    clients,
    conversationParticipants,
    conversations,
    messageMentions,
    messages,
    organizations,
    projects,
    tickets,
    users,
    workItems,
  } = await import("../src/db/schema");
  const { recordAudit } = await import("../src/lib/audit");
  const { ensureParticipant, postConversationMessage, recordSystemEvent } = await import(
    "../src/lib/conversations"
  );
  const { getUserUnreadMentions, listConversations, getConversationSummary } = await import(
    "../src/lib/inbox-data"
  );

  let failures = 0;
  const check = (name: string, ok: boolean, detail = "") => {
    if (!ok) failures += 1;
    console.log(`${name}: ${ok ? "PASS" : `FAIL ${detail}`}`);
  };

  const [org] = await db.select().from(organizations).where(eq(organizations.slug, "watson"));
  if (!org) throw new Error("Watson org missing");
  const [actor] = await db.select().from(users).where(eq(users.organizationId, org.id)).limit(1);
  if (!actor) throw new Error("No user in org");

  const [otherOrg] = await db
    .insert(organizations)
    .values({ name: "INB Verify Org", slug: "inb-verify-org" })
    .returning();

  const ids = {
    users: [] as number[],
    clients: [] as number[],
    projects: [] as number[],
    workItems: [] as number[],
    conversations: [] as number[],
  };

  try {
    const [colleague] = await db
      .insert(users)
      .values({
        organizationId: org.id,
        name: "INB Colleague",
        email: "inb-colleague@verify.local",
        passwordHash: "x",
        role: "technician",
      })
      .returning();
    ids.users.push(colleague.id);

    const [client] = await db
      .insert(clients)
      .values({ organizationId: org.id, name: "INB Verify Client" })
      .returning();
    ids.clients.push(client.id);

    const [project] = await db
      .insert(projects)
      .values({
        organizationId: org.id,
        folio: "PRJ-INB999",
        name: "INB Verify Project",
        status: "planning",
        createdById: actor.id,
      })
      .returning();
    ids.projects.push(project.id);

    /* 1. conversation linked to activity + client + project (no ticket) */
    const [activityItem] = await db
      .insert(workItems)
      .values({
        organizationId: org.id,
        type: "activity",
        title: "INB verify activity",
        status: "pending",
        priority: "medium",
        clientId: client.id,
        createdById: actor.id,
      })
      .returning();
    ids.workItems.push(activityItem.id);
    await db.insert(activities).values({ organizationId: org.id, workItemId: activityItem.id, activityType: "general" });

    const [conv] = await db
      .insert(conversations)
      .values({
        organizationId: org.id,
        subject: "INB conversación de actividad",
        clientId: client.id,
        workItemId: activityItem.id,
        projectId: project.id,
        channel: "internal",
        status: "open",
        createdById: actor.id,
      })
      .returning();
    ids.conversations.push(conv.id);
    check("conversation persists without ticket (activity+client+project links)", Boolean(conv.id) && conv.ticketId === null);

    /* 2-3. message with mention through the service */
    const before = conv.updatedAt;
    await new Promise((r) => setTimeout(r, 20));
    const msg = await db.transaction((tx) =>
      postConversationMessage(tx, {
        organizationId: org.id,
        actorUserId: actor.id,
        conversationId: conv.id,
        direction: "internal",
        body: "Nota con mención",
        channel: "internal",
        mentionUserIds: [colleague.id, actor.id], // self-mention must be dropped
      }),
    );
    const [convAfter] = await db.select().from(conversations).where(eq(conversations.id, conv.id));
    const mentionRows = await db
      .select()
      .from(messageMentions)
      .where(eq(messageMentions.messageId, msg.id));
    const [authorState] = await db
      .select()
      .from(conversationParticipants)
      .where(
        and(
          eq(conversationParticipants.conversationId, conv.id),
          eq(conversationParticipants.userId, actor.id),
        ),
      );
    check(
      "service bumps conversation and sets author's read cursor",
      convAfter.updatedAt > before && authorState?.lastReadAt != null,
    );
    check(
      "mention recorded for colleague only (no self-mention)",
      mentionRows.length === 1 && mentionRows[0].userId === colleague.id,
    );
    const colleagueMentions = await getUserUnreadMentions(org.id, colleague.id);
    check(
      "unread mention feed resolves the mention",
      colleagueMentions.some((m) => m.messageId === msg.id),
    );

    /* 4. unread semantics for the colleague */
    const colleagueList = await listConversations(org.id, colleague.id, { view: "unread" });
    const target = colleagueList.find((r) => r.id === conv.id);
    check("colleague sees the conversation as unread", Boolean(target && Number(target.unreadCount) >= 1));
    await db.transaction(async (tx) => {
      const p = await ensureParticipant(tx, conv.id, colleague.id);
      await tx
        .update(conversationParticipants)
        .set({ lastReadAt: new Date() })
        .where(eq(conversationParticipants.id, p!.id));
    });
    const afterRead = await listConversations(org.id, colleague.id, { view: "unread" });
    check("read cursor clears the unread state", !afterRead.some((r) => r.id === conv.id));

    /* 5. logical delete preserves the row */
    await db
      .update(messages)
      .set({ deletedAt: new Date(), deletedById: actor.id })
      .where(eq(messages.id, msg.id));
    const [deleted] = await db.select().from(messages).where(eq(messages.id, msg.id));
    check(
      "logical delete keeps the row and its body for audit",
      deleted.deletedAt != null && deleted.body === "Nota con mención",
    );

    /* 6. SLA first response via the shared service on a ticket conversation */
    const [ticketItem] = await db
      .insert(workItems)
      .values({
        organizationId: org.id,
        type: "ticket",
        title: "INB verify ticket",
        status: "new",
        priority: "medium",
        clientId: client.id,
        createdById: actor.id,
      })
      .returning();
    ids.workItems.push(ticketItem.id);
    const [ticket] = await db
      .insert(tickets)
      .values({ organizationId: org.id, workItemId: ticketItem.id, folio: "TCK-INB999" })
      .returning();
    const [ticketConv] = await db
      .insert(conversations)
      .values({
        organizationId: org.id,
        clientId: client.id,
        ticketId: ticket.id,
        channel: "internal",
        status: "open",
        createdById: actor.id,
      })
      .returning();
    ids.conversations.push(ticketConv.id);

    await db.transaction((tx) =>
      postConversationMessage(tx, {
        organizationId: org.id,
        actorUserId: actor.id,
        conversationId: ticketConv.id,
        direction: "outbound",
        body: "Primera respuesta al cliente",
        channel: "internal",
      }),
    );
    const [t1] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    const stamped = t1.firstResponseAt;
    check("first outbound stamps SLA first response", stamped != null);
    await new Promise((r) => setTimeout(r, 20));
    await db.transaction((tx) =>
      postConversationMessage(tx, {
        organizationId: org.id,
        actorUserId: actor.id,
        conversationId: ticketConv.id,
        direction: "outbound",
        body: "Segundo mensaje",
        channel: "internal",
      }),
    );
    const [t2] = await db.select().from(tickets).where(eq(tickets.id, ticket.id));
    check(
      "first response is never overwritten",
      t2.firstResponseAt?.getTime() === stamped?.getTime(),
    );

    /* 7. system events excluded from unread */
    await db.transaction((tx) =>
      recordSystemEvent(tx, {
        organizationId: org.id,
        actorUserId: actor.id,
        conversationId: ticketConv.id,
        body: "Estado cambiado a Pendiente.",
      }),
    );
    const [sysMsg] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.conversationId, ticketConv.id), eq(messages.direction, "system")));
    const colleagueTicketList = await listConversations(org.id, colleague.id, {});
    const ticketRow = colleagueTicketList.find((r) => r.id === ticketConv.id);
    check(
      "system event stored as direction=system and excluded from unread count",
      Boolean(sysMsg) && Number(ticketRow?.unreadCount ?? 0) === 2,
    );

    /* summary for integrations */
    const summary = await getConversationSummary(org.id, { clientId: client.id });
    check("integration summary counts conversations for the client", summary.total === 2);

    /* 8. one conversation per ticket */
    let uniqueHeld = false;
    try {
      await db.insert(conversations).values({
        organizationId: org.id,
        ticketId: ticket.id,
        channel: "internal",
        status: "open",
      });
    } catch {
      uniqueHeld = true;
    }
    check("a ticket admits exactly one conversation (unique index)", uniqueHeld);

    /* 9. org isolation */
    const otherList = await listConversations(otherOrg.id, actor.id, {});
    const otherSummary = await getConversationSummary(otherOrg.id, {});
    check(
      "another org sees no conversations",
      otherList.length === 0 && otherSummary.total === 0,
    );

    /* 10. rollback on audit failure */
    const countBefore = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(messages)
      .where(eq(messages.conversationId, conv.id));
    let rolledBack = false;
    try {
      await db.transaction(async (tx) => {
        await postConversationMessage(tx, {
          organizationId: org.id,
          actorUserId: actor.id,
          conversationId: conv.id,
          direction: "internal",
          body: "debe desaparecer con el rollback",
          channel: "internal",
        });
        await recordAudit(tx, {
          organizationId: null as unknown as number, // NOT NULL violation
          userId: actor.id,
          entityType: "message",
          entityId: 0,
          action: "create",
        });
      });
    } catch {
      rolledBack = true;
    }
    const countAfter = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(messages)
      .where(eq(messages.conversationId, conv.id));
    check(
      "audit failure rolls back the message write",
      rolledBack && Number(countAfter[0].n) === Number(countBefore[0].n),
    );
  } finally {
    /* cleanup — FK-safe order */
    for (const id of ids.conversations) {
      await db.delete(conversations).where(eq(conversations.id, id)); // messages/mentions/participants cascade
    }
    await db.delete(tickets).where(eq(tickets.folio, "TCK-INB999"));
    for (const id of ids.workItems) {
      await db.delete(activities).where(eq(activities.workItemId, id));
      await db.delete(workItems).where(eq(workItems.id, id));
    }
    for (const id of ids.projects) await db.delete(projects).where(eq(projects.id, id));
    for (const id of ids.clients) await db.delete(clients).where(eq(clients.id, id));
    await db
      .delete(auditLogs)
      .where(sql`${auditLogs.organizationId} = ${org.id} and ${auditLogs.createdAt} > now() - interval '10 minutes' and ${auditLogs.entityType} in ('ticket') and ${auditLogs.metadata}->>'via' = 'message'`);
    for (const id of ids.users) await db.delete(users).where(eq(users.id, id));
    await db.delete(organizations).where(eq(organizations.id, otherOrg.id));
  }

  console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
