import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, ticketComments, tickets, users } from "@/db/schema";
import {
  Avatar,
  Badge,
  Card,
  CardHeader,
  PageHeader,
  inputClass,
  labelClass,
} from "@/components/ui";
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
            <Card className="overflow-hidden">
              <CardHeader title="Description" />
              <p className="p-5 text-sm leading-6 whitespace-pre-wrap text-fg">
                {t.description}
              </p>
            </Card>
          ) : null}

          <Card className="overflow-hidden">
            <CardHeader
              title={`Activity${comments.length > 0 ? ` (${comments.length})` : ""}`}
              description="Comments and updates on this ticket."
            />
            <div className="p-5">
              <ul className="space-y-5">
                {comments.map((c, i) => (
                  <li key={c.id} className="relative flex gap-3.5">
                    {i < comments.length - 1 ? (
                      <span
                        aria-hidden
                        className="absolute top-9 left-4 h-[calc(100%-16px)] w-px bg-edge"
                      />
                    ) : null}
                    <Avatar name={c.authorName ?? "?"} size="sm" className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <span className="text-sm font-medium text-fg">
                          {c.authorName ?? "Unknown"}
                        </span>
                        <span className="shrink-0 text-xs text-faint tabular-nums">
                          {fmtDateTime(c.createdAt)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm leading-6 whitespace-pre-wrap text-muted">
                        {c.body}
                      </p>
                    </div>
                  </li>
                ))}
                {comments.length === 0 ? (
                  <li className="text-sm text-muted">No comments yet.</li>
                ) : null}
              </ul>
              <form action={addComment} className="mt-5 space-y-3 border-t border-edge pt-5">
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
            </div>
          </Card>
        </div>

        <Card className="h-fit overflow-hidden">
          <CardHeader title="Manage" description="Status, priority, and owner." />
          <form action={updateTicket} className="space-y-4 p-5">
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
