"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { ticketComments, tickets } from "@/db/schema";
import { requireUser } from "@/lib/session";

type TicketStatus = (typeof tickets.status.enumValues)[number];
type TicketPriority = (typeof tickets.priority.enumValues)[number];

function toId(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function createTicket(formData: FormData) {
  const user = await requireUser();
  const subject = String(formData.get("subject") ?? "").trim();
  if (!subject) return;

  const [ticket] = await db
    .insert(tickets)
    .values({
      subject,
      description: String(formData.get("description") ?? "").trim() || null,
      priority: (formData.get("priority") as TicketPriority) ?? "medium",
      clientId: toId(formData.get("clientId")),
      assigneeId: toId(formData.get("assigneeId")),
      createdById: Number(user.id),
    })
    .returning({ id: tickets.id });

  revalidatePath("/helpdesk");
  redirect(`/helpdesk/${ticket.id}`);
}

export async function updateTicket(formData: FormData) {
  await requireUser();
  const id = toId(formData.get("id"));
  if (!id) return;

  await db
    .update(tickets)
    .set({
      status: formData.get("status") as TicketStatus,
      priority: formData.get("priority") as TicketPriority,
      assigneeId: toId(formData.get("assigneeId")),
      updatedAt: new Date(),
    })
    .where(eq(tickets.id, id));

  revalidatePath(`/helpdesk/${id}`);
  revalidatePath("/helpdesk");
}

export async function addComment(formData: FormData) {
  const user = await requireUser();
  const ticketId = toId(formData.get("ticketId"));
  const body = String(formData.get("body") ?? "").trim();
  if (!ticketId || !body) return;

  await db.insert(ticketComments).values({
    ticketId,
    body,
    authorId: Number(user.id),
  });
  await db
    .update(tickets)
    .set({ updatedAt: new Date() })
    .where(eq(tickets.id, ticketId));

  revalidatePath(`/helpdesk/${ticketId}`);
}
