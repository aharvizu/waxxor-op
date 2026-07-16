import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { Card, PageHeader, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createProject } from "../actions";
import { projectStatusMeta } from "@/lib/labels";

export const metadata: Metadata = { title: "New project" };

export default async function NewProjectPage() {
  const user = await requireUser();
  const clientRows = await db
    .select({ id: clients.id, name: clients.name })
    .from(clients)
    .where(eq(clients.organizationId, user.organizationId))
    .orderBy(asc(clients.name));

  return (
    <div className="max-w-2xl">
      <PageHeader title="New project" subtitle="Start a new engagement or internal project." />
      <Card className="p-6">
        <form action={createProject} className="space-y-4">
          <div>
            <label htmlFor="name" className={labelClass}>
              Project name
            </label>
            <input id="name" name="name" required className={inputClass} />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="clientId" className={labelClass}>
                Client
              </label>
              <select id="clientId" name="clientId" className={inputClass}>
                <option value="">Internal</option>
                {clientRows.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="status" className={labelClass}>
                Status
              </label>
              <select id="status" name="status" defaultValue="planning" className={inputClass}>
                {Object.entries(projectStatusMeta).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="startDate" className={labelClass}>
                Start date
              </label>
              <input id="startDate" name="startDate" type="date" className={inputClass} />
            </div>
            <div>
              <label htmlFor="dueDate" className={labelClass}>
                Due date
              </label>
              <input id="dueDate" name="dueDate" type="date" className={inputClass} />
            </div>
            <div>
              <label htmlFor="budget" className={labelClass}>
                Budget (USD)
              </label>
              <input
                id="budget"
                name="budget"
                type="number"
                step="0.01"
                min="0"
                className={inputClass}
              />
            </div>
          </div>
          <div>
            <label htmlFor="description" className={labelClass}>
              Description
            </label>
            <textarea id="description" name="description" rows={5} className={inputClass} />
          </div>
          <SubmitButton>Create project</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
