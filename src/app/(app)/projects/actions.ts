"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { clients, projects, tasks, users } from "@/db/schema";
import { requireUser } from "@/lib/session";

type ProjectStatus = (typeof projects.status.enumValues)[number];
type TaskStatus = (typeof tasks.status.enumValues)[number];

function toId(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function toDate(value: FormDataEntryValue | null): string | null {
  const s = String(value ?? "").trim();
  return s || null;
}

async function orgClientId(orgId: number, id: number | null) {
  if (id === null) return null;
  const [row] = await db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, id), eq(clients.organizationId, orgId)));
  return row?.id ?? null;
}

async function orgUserId(orgId: number, id: number | null) {
  if (id === null) return null;
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, id), eq(users.organizationId, orgId)));
  return row?.id ?? null;
}

export async function createProject(formData: FormData) {
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const budgetRaw = String(formData.get("budget") ?? "").trim();
  const [project] = await db
    .insert(projects)
    .values({
      organizationId: user.organizationId,
      name,
      description: String(formData.get("description") ?? "").trim() || null,
      clientId: await orgClientId(user.organizationId, toId(formData.get("clientId"))),
      status: (formData.get("status") as ProjectStatus) ?? "planning",
      startDate: toDate(formData.get("startDate")),
      dueDate: toDate(formData.get("dueDate")),
      budget: budgetRaw && !Number.isNaN(Number(budgetRaw)) ? budgetRaw : null,
    })
    .returning({ id: projects.id });

  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

export async function updateProjectStatus(formData: FormData) {
  const user = await requireUser();
  const id = toId(formData.get("id"));
  if (!id) return;

  await db
    .update(projects)
    .set({ status: formData.get("status") as ProjectStatus })
    .where(and(eq(projects.id, id), eq(projects.organizationId, user.organizationId)));

  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
}

export async function createTask(formData: FormData) {
  const user = await requireUser();
  const projectId = toId(formData.get("projectId"));
  const title = String(formData.get("title") ?? "").trim();
  if (!projectId || !title) return;

  const [project] = await db
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(eq(projects.id, projectId), eq(projects.organizationId, user.organizationId)),
    );
  if (!project) return;

  await db.insert(tasks).values({
    organizationId: user.organizationId,
    projectId,
    title,
    assigneeId: await orgUserId(user.organizationId, toId(formData.get("assigneeId"))),
    dueDate: toDate(formData.get("dueDate")),
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function updateTaskStatus(formData: FormData) {
  const user = await requireUser();
  const id = toId(formData.get("id"));
  const projectId = toId(formData.get("projectId"));
  if (!id) return;

  await db
    .update(tasks)
    .set({ status: formData.get("status") as TaskStatus })
    .where(and(eq(tasks.id, id), eq(tasks.organizationId, user.organizationId)));

  if (projectId) revalidatePath(`/projects/${projectId}`);
}
