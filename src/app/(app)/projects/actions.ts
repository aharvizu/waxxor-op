"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { projects, tasks } from "@/db/schema";
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

export async function createProject(formData: FormData) {
  await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;

  const budgetRaw = String(formData.get("budget") ?? "").trim();
  const [project] = await db
    .insert(projects)
    .values({
      name,
      description: String(formData.get("description") ?? "").trim() || null,
      clientId: toId(formData.get("clientId")),
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
  await requireUser();
  const id = toId(formData.get("id"));
  if (!id) return;

  await db
    .update(projects)
    .set({ status: formData.get("status") as ProjectStatus })
    .where(eq(projects.id, id));

  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
}

export async function createTask(formData: FormData) {
  await requireUser();
  const projectId = toId(formData.get("projectId"));
  const title = String(formData.get("title") ?? "").trim();
  if (!projectId || !title) return;

  await db.insert(tasks).values({
    projectId,
    title,
    assigneeId: toId(formData.get("assigneeId")),
    dueDate: toDate(formData.get("dueDate")),
  });

  revalidatePath(`/projects/${projectId}`);
}

export async function updateTaskStatus(formData: FormData) {
  await requireUser();
  const id = toId(formData.get("id"));
  const projectId = toId(formData.get("projectId"));
  if (!id) return;

  await db
    .update(tasks)
    .set({ status: formData.get("status") as TaskStatus })
    .where(eq(tasks.id, id));

  if (projectId) revalidatePath(`/projects/${projectId}`);
}
