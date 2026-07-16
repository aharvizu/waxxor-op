"use server";

import { and, eq } from "drizzle-orm";
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
  const user = await requireUser();
  const name = String(formData.get("name") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  if (!name || !content) return;

  await db.insert(reportTemplates).values({
    organizationId: user.organizationId,
    name,
    description: String(formData.get("description") ?? "").trim() || null,
    content,
  });
  revalidatePath("/reports/templates");
}

export async function deleteTemplate(formData: FormData) {
  const user = await requireUser();
  const id = toId(formData.get("id"));
  if (!id) return;

  await db
    .delete(reportTemplates)
    .where(
      and(
        eq(reportTemplates.id, id),
        eq(reportTemplates.organizationId, user.organizationId),
      ),
    );
  revalidatePath("/reports/templates");
}

export async function createReport(formData: FormData) {
  const user = await requireUser();
  const title = String(formData.get("title") ?? "").trim();
  const templateId = toId(formData.get("templateId"));
  const clientId = toId(formData.get("clientId"));
  if (!title) return;

  let content = "";
  let scopedTemplateId: number | null = null;
  if (templateId) {
    const [template] = await db
      .select()
      .from(reportTemplates)
      .where(
        and(
          eq(reportTemplates.id, templateId),
          eq(reportTemplates.organizationId, user.organizationId),
        ),
      );
    content = template?.content ?? "";
    scopedTemplateId = template?.id ?? null;
  }

  let clientName = "";
  let scopedClientId: number | null = null;
  if (clientId) {
    const [client] = await db
      .select()
      .from(clients)
      .where(
        and(eq(clients.id, clientId), eq(clients.organizationId, user.organizationId)),
      );
    clientName = client?.name ?? "";
    scopedClientId = client?.id ?? null;
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
    .values({
      organizationId: user.organizationId,
      title,
      content,
      templateId: scopedTemplateId,
      clientId: scopedClientId,
    })
    .returning({ id: reports.id });

  revalidatePath("/reports");
  redirect(`/reports/${report.id}`);
}

export async function updateReport(formData: FormData) {
  const user = await requireUser();
  const id = toId(formData.get("id"));
  const title = String(formData.get("title") ?? "").trim();
  const content = String(formData.get("content") ?? "");
  if (!id || !title) return;

  await db
    .update(reports)
    .set({ title, content })
    .where(and(eq(reports.id, id), eq(reports.organizationId, user.organizationId)));
  revalidatePath(`/reports/${id}`);
  revalidatePath("/reports");
}

export async function markReportSent(formData: FormData) {
  const user = await requireUser();
  const id = toId(formData.get("id"));
  if (!id) return;

  await db
    .update(reports)
    .set({ status: "sent", sentAt: new Date() })
    .where(and(eq(reports.id, id), eq(reports.organizationId, user.organizationId)));
  revalidatePath(`/reports/${id}`);
  revalidatePath("/reports");
}
