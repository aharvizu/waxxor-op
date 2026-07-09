import type { Metadata } from "next";
import { db } from "@/db";
import { clients, users } from "@/db/schema";
import { Card, PageHeader, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createTicket } from "../actions";

export const metadata: Metadata = { title: "New ticket" };

export default async function NewTicketPage() {
  const [clientRows, userRows] = await Promise.all([
    db.select({ id: clients.id, name: clients.name }).from(clients).orderBy(clients.name),
    db.select({ id: users.id, name: users.name }).from(users).orderBy(users.name),
  ]);

  return (
    <div className="max-w-2xl">
      <PageHeader title="New ticket" subtitle="Log a customer request or internal issue." />
      <Card className="p-6">
        <form action={createTicket} className="space-y-4">
          <div>
            <label htmlFor="subject" className={labelClass}>
              Subject
            </label>
            <input id="subject" name="subject" required className={inputClass} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="clientId" className={labelClass}>
                Client
              </label>
              <select id="clientId" name="clientId" className={inputClass}>
                <option value="">— None —</option>
                {clientRows.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="priority" className={labelClass}>
                Priority
              </label>
              <select id="priority" name="priority" defaultValue="medium" className={inputClass}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div>
              <label htmlFor="assigneeId" className={labelClass}>
                Assignee
              </label>
              <select id="assigneeId" name="assigneeId" className={inputClass}>
                <option value="">Unassigned</option>
                {userRows.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="description" className={labelClass}>
              Description
            </label>
            <textarea id="description" name="description" rows={6} className={inputClass} />
          </div>
          <SubmitButton>Create ticket</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
