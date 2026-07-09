import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, projects, tasks, users } from "@/db/schema";
import {
  Badge,
  Card,
  CardHeader,
  PageHeader,
  cx,
  inputClass,
  labelClass,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { fmtDate, fmtMoney } from "@/lib/format";
import { projectStatusMeta, taskStatusMeta } from "@/lib/labels";
import { createTask, updateProjectStatus, updateTaskStatus } from "../actions";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const projectId = Number(id);
  if (!Number.isInteger(projectId)) notFound();

  const [row] = await db
    .select({ project: projects, clientName: clients.name })
    .from(projects)
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .where(eq(projects.id, projectId));
  if (!row) notFound();

  const [taskRows, userRows] = await Promise.all([
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        dueDate: tasks.dueDate,
        assigneeName: users.name,
      })
      .from(tasks)
      .leftJoin(users, eq(tasks.assigneeId, users.id))
      .where(eq(tasks.projectId, projectId))
      .orderBy(asc(tasks.createdAt)),
    db.select({ id: users.id, name: users.name }).from(users).orderBy(users.name),
  ]);

  const p = row.project;
  const done = taskRows.filter((t) => t.status === "done").length;

  return (
    <div className="max-w-4xl">
      <PageHeader
        title={p.name}
        subtitle={`${row.clientName ?? "Internal"}${p.dueDate ? ` · Due ${fmtDate(p.dueDate)}` : ""}${p.budget ? ` · Budget ${fmtMoney(p.budget)}` : ""}`}
        action={
          <Badge tone={projectStatusMeta[p.status].tone}>
            {projectStatusMeta[p.status].label}
          </Badge>
        }
      />

      {p.description ? (
        <Card className="mb-6 overflow-hidden">
          <CardHeader title="Description" />
          <p className="p-5 text-sm leading-6 whitespace-pre-wrap text-fg">
            {p.description}
          </p>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="overflow-hidden">
            <CardHeader
              title={`Tasks${taskRows.length > 0 ? ` (${done}/${taskRows.length} done)` : ""}`}
              description="Work items for this engagement."
            />
            <div className="p-5">
              <ul className="space-y-2">
                {taskRows.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-edge bg-subtle px-4 py-3 transition-colors hover:border-edge-strong"
                  >
                    <div className="min-w-0">
                      <div
                        className={cx(
                          "truncate text-sm font-medium text-fg",
                          t.status === "done" && "text-faint line-through",
                        )}
                      >
                        {t.title}
                      </div>
                      <div className="text-xs text-muted">
                        {t.assigneeName ?? "Unassigned"}
                        {t.dueDate ? ` · Due ${fmtDate(t.dueDate)}` : ""}
                      </div>
                    </div>
                    <form action={updateTaskStatus} className="flex shrink-0 items-center gap-2">
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="projectId" value={p.id} />
                      <select
                        name="status"
                        defaultValue={t.status}
                        aria-label={`Status for ${t.title}`}
                        className={cx(inputClass, "h-8 w-auto text-xs")}
                      >
                        {Object.entries(taskStatusMeta).map(([key, meta]) => (
                          <option key={key} value={key}>
                            {meta.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="submit"
                        className="rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      >
                        Set
                      </button>
                    </form>
                  </li>
                ))}
                {taskRows.length === 0 ? (
                  <li className="text-sm text-muted">No tasks yet.</li>
                ) : null}
              </ul>

              <form
                action={createTask}
                className="mt-4 grid grid-cols-1 gap-3 border-t border-edge pt-4 sm:grid-cols-4"
              >
                <input type="hidden" name="projectId" value={p.id} />
                <input
                  name="title"
                  required
                  placeholder="New task…"
                  className={cx(inputClass, "sm:col-span-2")}
                />
                <select name="assigneeId" aria-label="Assignee" className={inputClass}>
                  <option value="">Unassigned</option>
                  {userRows.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
                <SubmitButton>Add task</SubmitButton>
              </form>
            </div>
          </Card>
        </div>

        <Card className="h-fit overflow-hidden">
          <CardHeader title="Manage" description="Project state." />
          <form action={updateProjectStatus} className="space-y-4 p-5">
            <input type="hidden" name="id" value={p.id} />
            <div>
              <label htmlFor="status" className={labelClass}>
                Status
              </label>
              <select id="status" name="status" defaultValue={p.status} className={inputClass}>
                {Object.entries(projectStatusMeta).map(([key, meta]) => (
                  <option key={key} value={key}>
                    {meta.label}
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
