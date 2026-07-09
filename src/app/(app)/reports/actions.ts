"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { clients, reportTemplates, reports } from "@/db/schema";
import { requireUser } from "@/lib/session";

function toId(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function createTemplate(formData: FormData) {
  await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!name || !content) return;

  await db.insert(reportTemplates).values({
    name,
    description: String(formData.get("description") ?? "").trim() || null,
    content,
  });
  revalidatePath("/reports/templates");
}

export async function deleteTemplate(formData: FormData) {
  await requireUser();
  const id = toId(formData.get("id"));
  if (!id) return;

  await db.delete(reportTemplates).where(eq(reportTemplates.id, id));
  revalidatePath("/reports/templates");
}

export async function createReport(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const templateId = toId(formData.get("templateId"));
  const clientId = toId(formData.get("clientId"));
  if (!title) return;

  let content = "";
  if (templateId) {
    const [template] = await db
      .select()
      .from(reportTemplates)
      .where(eq(reportTemplates.id, templateId));
    content = template?.content ?? "";
  }

  let clientName = "";
  if (clientId) {
    const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
    clientName = client?.name ?? "";
  }

  const today = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  content = content
    .replaceAll("{{client}}", clientName || "{{client}}")
    .replaceAll("{{date}}", today)
    .replaceAll("{{title}}", title)
    .replaceAll("{{author}}", user.name ?? "");

  const [report] = await db
    .insert(reports)
    .values({ title, content, templateId, clientId })
    .returning({ id: reports.id });

  revalidatePath("/reports");
  redirect(`/reports/${report.id}`);
}

export async function updateReport(formData: FormData) {
  await requireUser();
  const id = toId(formData.get("id"));
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "");
  if (!id || !title) return;

  await db.update(reports).set({ title, content }).where(eq(reports.id, id));
  revalidatePath(`/reports/${id}`);
  revalidatePath("/reports");
}

export async function markReportSent(formData: FormData) {
  await requireUser();
  const id = toId(formData.get("id"));
  if (!id) return;

  await db
    .update(reports)
    .set({ status: "sent", sentAt: new Date() })
    .where(eq(reports.id, id));
  revalidatePath(`/reports/${id}`);
  revalidatePath("/reports");
}
