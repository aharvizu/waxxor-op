import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, projects, tasks, users } from "@/db/schema";
import { Badge, Card, PageHeader, cx, inputClass, labelClass } from "@/components/ui";
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
        <Card className="mb-6 p-5">
          <h2 className="mb-2 text-sm font-semibold">Description</h2>
          <p className="whitespace-pre-wrap text-sm text-slate-700">{p.description}</p>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card className="p-5">
            <h2 className="mb-4 text-sm font-semibold">
              Tasks {taskRows.length > 0 ? `(${done}/${taskRows.length} done)` : ""}
            </h2>
            <ul className="space-y-2">
              {taskRows.map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3"
                >
                  <div>
                    <div
                      className={cx(
                        "text-sm font-medium",
                        t.status === "done" && "text-slate-400 line-through",
                      )}
                    >
                      {t.title}
                    </div>
                    <div className="text-xs text-slate-500">
                      {t.assigneeName ?? "Unassigned"}
                      {t.dueDate ? ` · Due ${fmtDate(t.dueDate)}` : ""}
                    </div>
                  </div>
                  <form action={updateTaskStatus} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="projectId" value={p.id} />
                    <select
                      name="status"
                      defaultValue={t.status}
                      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs"
                    >
                      {Object.entries(taskStatusMeta).map(([key, meta]) => (
                        <option key={key} value={key}>
                          {meta.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="submit"
                      className="text-xs font-medium text-cyan-700 hover:underline"
                    >
                      Set
                    </button>
                  </form>
                </li>
              ))}
              {taskRows.length === 0 ? (
                <li className="text-sm text-slate-500">No tasks yet.</li>
              ) : null}
            </ul>

            <form action={createTask} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
              <input type="hidden" name="projectId" value={p.id} />
              <input
                name="title"
                required
                placeholder="New task…"
                className={cx(inputClass, "sm:col-span-2")}
              />
              <select name="assigneeId" className={inputClass}>
                <option value="">Unassigned</option>
                {userRows.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
              <SubmitButton>Add task</SubmitButton>
            </form>
          </Card>
        </div>

        <Card className="h-fit p-5">
          <h2 className="mb-4 text-sm font-semibold">Manage</h2>
          <form action={updateProjectStatus} className="space-y-4">
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
