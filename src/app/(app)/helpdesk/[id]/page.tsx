import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, ticketComments, tickets, users } from "@/db/schema";
import { Badge, Card, PageHeader, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { fmtDateTime } from "@/lib/format";
import { ticketPriorityMeta, ticketStatusMeta } from "@/lib/labels";
import { addComment, updateTicket } from "../actions";

export const metadata: Metadata = { title: "Ticket" };

export default async function TicketPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ticketId = Number(id);
  if (!Number.isInteger(ticketId)) notFound();

  const [row] = await db
    .select({
      ticket: tickets,
      clientName: clients.name,
    })
    .from(tickets)
    .leftJoin(clients, eq(tickets.clientId, clients.id))
    .where(eq(tickets.id, ticketId));
  if (!row) notFound();

  const [comments, userRows] = await Promise.all([
    db
      .select({
        id: ticketComments.id,
        body: ticketComments.body,
        createdAt: ticketComments.createdAt,
        authorName: users.name,
      })
      .from(ticketComments)
      .leftJoin(users, eq(ticketComments.authorId, users.id))
      .where(eq(ticketComments.ticketId, ticketId))
      .orderBy(asc(ticketComments.createdAt)),
    db.select({ id: users.id, name: users.name }).from(users).orderBy(users.name),
  ]);

  const t = row.ticket;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={`#${t.id} ${t.subject}`}
        subtitle={`Opened ${fmtDateTime(t.createdAt)}${row.clientName ? ` · ${row.clientName}` : ""}`}
        action={
          <div className="flex gap-2">
            <Badge tone={ticketPriorityMeta[t.priority].tone}>
              {ticketPriorityMeta[t.priority].label}
            </Badge>
            <Badge tone={ticketStatusMeta[t.status].tone}>
              {ticketStatusMeta[t.status].label}
            </Badge>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {t.description ? (
            <Card className="p-5">
              <h2 className="mb-2 text-sm font-semibold">Description</h2>
              <p className="whitespace-pre-wrap text-sm text-slate-700">{t.description}</p>
            </Card>
          ) : null}

          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold">
              Activity {comments.length > 0 ? `(${comments.length})` : ""}
            </h2>
            <ul className="space-y-4">
              {comments.map((c) => (
                <li key={c.id} className="rounded-lg bg-slate-50 p-4">
                  <div className="mb-1 flex items-center justify-between text-xs text-slate-500">
                    <span className="font-medium text-slate-700">
                      {c.authorName ?? "Unknown"}
                    </span>
                    <span>{fmtDateTime(c.createdAt)}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{c.body}</p>
                </li>
              ))}
              {comments.length === 0 ? (
                <li className="text-sm text-slate-500">No comments yet.</li>
              ) : null}
            </ul>
            <form action={addComment} className="mt-4 space-y-3">
              <input type="hidden" name="ticketId" value={t.id} />
              <textarea
                name="body"
                rows={3}
                required
                placeholder="Add a comment…"
                className={inputClass}
              />
              <SubmitButton>Comment</SubmitButton>
            </form>
          </Card>
        </div>

        <Card className="h-fit p-5">
          <h2 className="mb-4 text-sm font-semibold">Manage</h2>
          <form action={updateTicket} className="space-y-4">
            <input type="hidden" name="id" value={t.id} />
            <div>
              <label htmlFor="status" className={labelClass}>
                Status
              </label>
              <select id="status" name="status" defaultValue={t.status} className={inputClass}>
                {Object.entries(ticketStatusMeta).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="priority" className={labelClass}>
                Priority
              </label>
              <select
                id="priority"
                name="priority"
                defaultValue={t.priority}
                className={inputClass}
              >
                {Object.entries(ticketPriorityMeta).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="assigneeId" className={labelClass}>
                Assignee
              </label>
              <select
                id="assigneeId"
                name="assigneeId"
                defaultValue={t.assigneeId ?? ""}
                className={inputClass}
              >
                <option value="">Unassigned</option>
                {userRows.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
            <SubmitButton>Update</SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
