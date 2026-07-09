import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { clients, projects, tasks } from "@/db/schema";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Td,
  Th,
  buttonClass,
} from "@/components/ui";
import { fmtDate, fmtMoney } from "@/lib/format";
import { projectStatusMeta } from "@/lib/labels";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      dueDate: projects.dueDate,
      budget: projects.budget,
      clientName: clients.name,
      taskCount: sql<number>`count(${tasks.id})::int`,
      doneCount: sql<number>`count(${tasks.id}) filter (where ${tasks.status} = 'done')::int`,
    })
    .from(projects)
    .leftJoin(clients, eq(projects.clientId, clients.id))
    .leftJoin(tasks, eq(tasks.projectId, projects.id))
    .groupBy(projects.id, clients.name)
    .orderBy(desc(projects.createdAt));

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Engagements, assessments, and internal projects."
        action={
          <Link href="/projects/new" className={buttonClass}>
            New project
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState>No projects yet. Create your first engagement.</EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50">
              <tr>
                <Th>Project</Th>
                <Th>Client</Th>
                <Th>Status</Th>
                <Th>Tasks</Th>
                <Th>Due</Th>
                <Th>Budget</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <Td>
                    <Link
                      href={`/projects/${p.id}`}
                      className="font-medium hover:text-purple-700"
                    >
                      {p.name}
                    </Link>
                  </Td>
                  <Td className="text-slate-500">{p.clientName ?? "Internal"}</Td>
                  <Td>
                    <Badge tone={projectStatusMeta[p.status].tone}>
                      {projectStatusMeta[p.status].label}
                    </Badge>
                  </Td>
                  <Td className="text-slate-500">
                    {p.taskCount > 0 ? `${p.doneCount}/${p.taskCount} done` : "—"}
                  </Td>
                  <Td className="text-slate-500">{fmtDate(p.dueDate)}</Td>
                  <Td className="text-slate-500">
                    {p.budget ? fmtMoney(p.budget) : "—"}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
