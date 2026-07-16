import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { FolderKanban, Plus } from "lucide-react";
import { db } from "@/db";
import { clients, projects, tasks } from "@/db/schema";
import { requireUser } from "@/lib/session";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  Progress,
  THead,
  Table,
  Td,
  Th,
  buttonClass,
} from "@/components/ui";
import { fmtDate, fmtMoney } from "@/lib/format";
import { projectStatusMeta } from "@/lib/labels";

export const metadata: Metadata = { title: "Projects" };

export default async function ProjectsPage() {
  const user = await requireUser();
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
    .where(eq(projects.organizationId, user.organizationId))
    .groupBy(projects.id, clients.name)
    .orderBy(desc(projects.createdAt));

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Engagements, assessments, and internal projects."
        action={
          <Link href="/projects/new" className={buttonClass}>
            <Plus /> New project
          </Link>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          icon={<FolderKanban />}
          title="No projects yet"
          action={
            <Link href="/projects/new" className={buttonClass}>
              <Plus /> New project
            </Link>
          }
        >
          Create your first engagement to start tracking tasks, budgets, and due
          dates.
        </EmptyState>
      ) : (
        <Card className="overflow-visible">
          <Table>
            <THead>
              <tr>
                <Th>Project</Th>
                <Th>Client</Th>
                <Th>Status</Th>
                <Th>Tasks</Th>
                <Th>Due</Th>
                <Th className="text-right">Budget</Th>
              </tr>
            </THead>
            <tbody className="divide-y divide-edge">
              {rows.map((p) => (
                <tr key={p.id} className="group transition-colors hover:bg-subtle">
                  <Td>
                    <Link
                      href={`/projects/${p.id}`}
                      className="font-medium text-fg transition-colors group-hover:text-primary"
                    >
                      {p.name}
                    </Link>
                  </Td>
                  <Td className="text-muted">{p.clientName ?? "Internal"}</Td>
                  <Td>
                    <Badge tone={projectStatusMeta[p.status].tone}>
                      {projectStatusMeta[p.status].label}
                    </Badge>
                  </Td>
                  <Td>
                    {p.taskCount > 0 ? (
                      <span className="flex items-center gap-2.5">
                        <Progress
                          value={(p.doneCount / p.taskCount) * 100}
                          className="w-20"
                        />
                        <span className="text-xs text-muted tabular-nums">
                          {p.doneCount}/{p.taskCount}
                        </span>
                      </span>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </Td>
                  <Td className="text-muted tabular-nums">{fmtDate(p.dueDate)}</Td>
                  <Td className="text-right font-medium tabular-nums">
                    {p.budget ? fmtMoney(p.budget) : <span className="text-faint">—</span>}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
