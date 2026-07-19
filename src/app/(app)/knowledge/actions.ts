"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, type DbExecutor } from "@/db";
import {
  companies,
  knowledgeArticleFavorites,
  knowledgeArticleRelations,
  knowledgeArticleVersions,
  knowledgeArticles,
  knowledgeCategories,
  projects,
  tickets,
  workItems,
} from "@/db/schema";
import {
  type ActionState,
  businessError,
  parseForm,
  success,
  unexpectedError,
} from "@/lib/action-result";
import { recordAudit } from "@/lib/audit";
import {
  KNOWLEDGE_RELATION_TYPES,
  anonymizeText,
  canCreateDraft,
  canEditArticle,
  canPublish,
  canReview,
  canTransitionArticle,
  knowledgeStepsSchema,
  knowledgeTagsSchema,
  slugify,
  type KnowledgeStatus,
} from "@/lib/knowledge";
import { hasRole } from "@/lib/roles";
import { requireUser, type SessionUser } from "@/lib/session";

class RuleError extends Error {}
class NotFoundError extends Error {}

function fail(err: unknown): ActionState {
  if (err instanceof NotFoundError) return businessError("El artículo ya no existe.");
  if (err instanceof RuleError) return businessError(err.message);
  return unexpectedError(err);
}

function refresh(id?: number) {
  revalidatePath("/knowledge");
  if (id) revalidatePath(`/knowledge/${id}`);
}

async function loadArticle(tx: DbExecutor, user: SessionUser, id: number) {
  const [row] = await tx
    .select()
    .from(knowledgeArticles)
    .where(and(eq(knowledgeArticles.id, id), eq(knowledgeArticles.organizationId, user.organizationId)));
  if (!row) throw new NotFoundError();
  return row;
}

/** Inserts the immutable version snapshot and bumps articles.currentVersion — one place. */
async function saveVersion(
  tx: DbExecutor,
  article: typeof knowledgeArticles.$inferSelect,
  content: { title: string; problem: string | null; cause: string | null; solution: string | null; steps: string[]; notes: string | null },
  editedById: number,
  changeSummary?: string,
) {
  const nextVersion = article.currentVersion + 1;
  await tx.insert(knowledgeArticleVersions).values({
    articleId: article.id,
    versionNumber: nextVersion,
    title: content.title,
    problem: content.problem,
    cause: content.cause,
    solution: content.solution,
    steps: content.steps,
    notes: content.notes,
    editedById,
    changeSummary: changeSummary ?? null,
  });
  await tx
    .update(knowledgeArticles)
    .set({ ...content, currentVersion: nextVersion, updatedAt: new Date() })
    .where(eq(knowledgeArticles.id, article.id));
  return nextVersion;
}

const optionalText = z.preprocess(
  (v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v),
  z.string().trim().max(5000).nullable(),
);
const optionalId = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number().int().positive().nullable(),
);
const stepsField = z.preprocess((v) => {
  if (typeof v !== "string") return [];
  return v.split("\n").map((s) => s.trim()).filter(Boolean);
}, knowledgeStepsSchema);
const tagsField = z.preprocess((v) => {
  if (typeof v !== "string") return [];
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}, knowledgeTagsSchema);

/* ------------------------------------------------------------ create/edit */

const articleSchema = z.object({
  title: z.string().trim().min(1, "Título requerido.").max(200),
  categoryId: optionalId,
  problem: optionalText,
  cause: optionalText,
  solution: optionalText,
  steps: stepsField,
  notes: optionalText,
  tags: tagsField,
  companyId: optionalId,
  projectId: optionalId,
  ticketId: optionalId,
  workItemId: optionalId,
});

async function nextSlug(tx: DbExecutor, orgId: number, title: string): Promise<string> {
  const base = slugify(title);
  let candidate = base;
  let n = 1;
  // small, bounded loop — article volume never approaches a meaningful collision rate
  while (true) {
    const [existing] = await tx
      .select({ id: knowledgeArticles.id })
      .from(knowledgeArticles)
      .where(and(eq(knowledgeArticles.organizationId, orgId), eq(knowledgeArticles.slug, candidate)));
    if (!existing) return candidate;
    n += 1;
    candidate = `${base}-${n}`;
  }
}

async function createRelations(
  tx: DbExecutor,
  user: SessionUser,
  articleId: number,
  links: { companyId: number | null; projectId: number | null; ticketId: number | null; workItemId: number | null },
  originType?: "ticket",
) {
  const entries: { relatedType: (typeof KNOWLEDGE_RELATION_TYPES)[number]; relatedId: number }[] = [];
  if (links.companyId) entries.push({ relatedType: "company", relatedId: links.companyId });
  if (links.projectId) entries.push({ relatedType: "project", relatedId: links.projectId });
  if (links.ticketId) entries.push({ relatedType: "ticket", relatedId: links.ticketId });
  if (links.workItemId) entries.push({ relatedType: "activity", relatedId: links.workItemId });
  for (const e of entries) {
    await tx
      .insert(knowledgeArticleRelations)
      .values({
        articleId,
        relatedType: e.relatedType,
        relatedId: e.relatedId,
        isOrigin: originType === "ticket" && e.relatedType === "ticket",
        createdById: Number(user.id),
      })
      .onConflictDoNothing();
  }
}

async function validateLinks(
  tx: DbExecutor,
  orgId: number,
  data: { companyId: number | null; projectId: number | null; ticketId: number | null; workItemId: number | null },
) {
  if (data.companyId) {
    const [c] = await tx.select({ id: companies.id }).from(companies).where(and(eq(companies.id, data.companyId), eq(companies.organizationId, orgId)));
    if (!c) throw new RuleError("El cliente no existe en esta organización.");
  }
  if (data.projectId) {
    const [p] = await tx.select({ id: projects.id }).from(projects).where(and(eq(projects.id, data.projectId), eq(projects.organizationId, orgId)));
    if (!p) throw new RuleError("El proyecto no existe en esta organización.");
  }
  if (data.ticketId) {
    const [t] = await tx.select({ id: tickets.id }).from(tickets).where(and(eq(tickets.id, data.ticketId), eq(tickets.organizationId, orgId)));
    if (!t) throw new RuleError("El ticket no existe en esta organización.");
  }
  if (data.workItemId) {
    const [w] = await tx.select({ id: workItems.id }).from(workItems).where(and(eq(workItems.id, data.workItemId), eq(workItems.organizationId, orgId), eq(workItems.type, "activity")));
    if (!w) throw new RuleError("La actividad no existe en esta organización.");
  }
}

export async function createArticle(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!canCreateDraft(user.role)) return businessError("No tienes permiso para crear artículos.");
  const { data, error } = parseForm(articleSchema, formData);
  if (error) return error;

  let articleId = 0;
  try {
    articleId = await db.transaction(async (tx) => {
      await validateLinks(tx, user.organizationId, data);
      if (data.categoryId) {
        const [cat] = await tx.select({ id: knowledgeCategories.id }).from(knowledgeCategories).where(and(eq(knowledgeCategories.id, data.categoryId), eq(knowledgeCategories.organizationId, user.organizationId)));
        if (!cat) throw new RuleError("La categoría no existe en esta organización.");
      }
      const slug = await nextSlug(tx, user.organizationId, data.title);
      const [created] = await tx
        .insert(knowledgeArticles)
        .values({
          organizationId: user.organizationId,
          categoryId: data.categoryId,
          title: data.title,
          slug,
          tags: data.tags,
          problem: data.problem,
          cause: data.cause,
          solution: data.solution,
          steps: data.steps,
          notes: data.notes,
          authorId: Number(user.id),
        })
        .returning({ id: knowledgeArticles.id });
      await tx.insert(knowledgeArticleVersions).values({
        articleId: created.id,
        versionNumber: 1,
        title: data.title,
        problem: data.problem,
        cause: data.cause,
        solution: data.solution,
        steps: data.steps,
        notes: data.notes,
        editedById: Number(user.id),
        changeSummary: "Creación",
      });
      await createRelations(tx, user, created.id, data);
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "knowledge_article",
        entityId: created.id,
        action: "create",
        metadata: { values: { title: data.title, categoryId: data.categoryId } },
      });
      return created.id;
    });
  } catch (err) {
    return fail(err);
  }
  refresh();
  redirect(`/knowledge/${articleId}`);
}

const updateSchema = articleSchema.omit({ companyId: true, projectId: true, ticketId: true, workItemId: true }).extend({
  id: z.coerce.number().int().positive(),
  changeSummary: optionalText,
});

export async function updateArticle(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(updateSchema, formData);
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const article = await loadArticle(tx, user, data.id);
      if (!canEditArticle(user.role, article, Number(user.id))) {
        throw new RuleError("No tienes permiso para editar este artículo.");
      }
      if (data.categoryId) {
        const [cat] = await tx.select({ id: knowledgeCategories.id }).from(knowledgeCategories).where(and(eq(knowledgeCategories.id, data.categoryId), eq(knowledgeCategories.organizationId, user.organizationId)));
        if (!cat) throw new RuleError("La categoría no existe en esta organización.");
      }
      await tx.update(knowledgeArticles).set({ categoryId: data.categoryId, tags: data.tags }).where(eq(knowledgeArticles.id, article.id));
      const versionNumber = await saveVersion(
        tx,
        article,
        { title: data.title, problem: data.problem, cause: data.cause, solution: data.solution, steps: data.steps, notes: data.notes },
        Number(user.id),
        data.changeSummary ?? undefined,
      );
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "knowledge_article",
        entityId: article.id,
        action: "update",
        field: "content",
        metadata: { event: "version_saved", versionNumber },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.id);
  return success("Artículo actualizado.");
}

/* ---------------------------------------------------------------- status */

async function transition(
  formData: FormData,
  to: KnowledgeStatus,
  guard: (role: SessionUser["role"]) => boolean,
  guardMessage: string,
  event: string,
  extra?: (tx: DbExecutor, user: SessionUser, article: typeof knowledgeArticles.$inferSelect, notes: string | null) => Promise<void>,
): Promise<ActionState> {
  const user = await requireUser();
  const schema = z.object({ id: z.coerce.number().int().positive(), notes: optionalText });
  const { data, error } = parseForm(schema, formData);
  if (error) return error;
  if (!guard(user.role)) return businessError(guardMessage);

  try {
    await db.transaction(async (tx) => {
      const article = await loadArticle(tx, user, data.id);
      if (!canTransitionArticle(article.status, to)) {
        throw new RuleError(`No se puede pasar de ${article.status} a ${to}.`);
      }
      await tx.update(knowledgeArticles).set({
        status: to,
        publishedAt: to === "published" ? new Date() : article.publishedAt,
        archivedAt: to === "archived" ? new Date() : null,
        updatedAt: new Date(),
      }).where(eq(knowledgeArticles.id, article.id));
      if (extra) await extra(tx, user, article, data.notes);
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "knowledge_article",
        entityId: article.id,
        action: "update",
        field: "status",
        oldValue: article.status,
        newValue: to,
        metadata: { event, notes: data.notes },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.id);
  return success();
}

export async function submitForReview(_prev: ActionState, formData: FormData) {
  return transition(formData, "in_review", canCreateDraft, "No tienes permiso para enviar a revisión.", "submitted_for_review");
}

export async function requestChanges(_prev: ActionState, formData: FormData) {
  return transition(formData, "draft", canReview, "No tienes permiso para revisar artículos.", "changes_requested", async (tx, user, article, notes) => {
    await tx.update(knowledgeArticles).set({ reviewerId: Number(user.id), reviewNotes: notes }).where(eq(knowledgeArticles.id, article.id));
  });
}

export async function publishArticle(_prev: ActionState, formData: FormData) {
  return transition(formData, "published", canPublish, "No tienes permiso para publicar artículos.", "published", async (tx, user, article) => {
    if (!article.reviewerId) {
      await tx.update(knowledgeArticles).set({ reviewerId: Number(user.id) }).where(eq(knowledgeArticles.id, article.id));
    }
  });
}

export async function archiveArticle(_prev: ActionState, formData: FormData) {
  return transition(formData, "archived", canPublish, "No tienes permiso para archivar artículos.", "archived");
}

export async function restoreArticle(_prev: ActionState, formData: FormData) {
  return transition(formData, "draft", canPublish, "No tienes permiso para restaurar artículos.", "restored");
}

/* -------------------------------------------------------------- favorite */

export async function toggleFavoriteArticle(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const id = z.coerce.number().int().positive().parse(formData.get("id"));
  try {
    await db.transaction(async (tx) => {
      await loadArticle(tx, user, id);
      const [existing] = await tx
        .select({ id: knowledgeArticleFavorites.id })
        .from(knowledgeArticleFavorites)
        .where(and(eq(knowledgeArticleFavorites.articleId, id), eq(knowledgeArticleFavorites.userId, Number(user.id))));
      if (existing) {
        await tx.delete(knowledgeArticleFavorites).where(eq(knowledgeArticleFavorites.id, existing.id));
      } else {
        await tx.insert(knowledgeArticleFavorites).values({ articleId: id, userId: Number(user.id) });
      }
    });
  } catch (err) {
    return fail(err);
  }
  refresh(id);
  return success();
}

/* ---------------------------------------------------- Ticket -> KB flow */

const fromTicketSchema = z.object({
  ticketId: z.coerce.number().int().positive(),
  title: z.string().trim().min(1, "Título requerido.").max(200),
  categoryId: optionalId,
  problem: optionalText,
  cause: optionalText,
  solution: optionalText,
  steps: stepsField,
  notes: optionalText,
  anonymize: z.enum(["true", "false"]).default("false"),
});

/**
 * Creates a DRAFT article from a resolved ticket. Never publishes
 * automatically (spec: "nunca publicar automáticamente"). Internal notes,
 * billing notes and any other sensitive ticket field are never read here —
 * only the fields the caller explicitly submits through the prefilled form.
 */
export async function createArticleFromTicket(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  if (!canCreateDraft(user.role)) return businessError("No tienes permiso para crear artículos.");
  const { data, error } = parseForm(fromTicketSchema, formData);
  if (error) return error;

  let articleId = 0;
  try {
    articleId = await db.transaction(async (tx) => {
      const [row] = await tx
        .select({ ticket: tickets, item: workItems })
        .from(tickets)
        .innerJoin(workItems, eq(tickets.workItemId, workItems.id))
        .where(and(eq(tickets.id, data.ticketId), eq(tickets.organizationId, user.organizationId)));
      if (!row) throw new RuleError("El ticket no existe en esta organización.");

      const [existing] = await tx
        .select({ id: knowledgeArticles.id })
        .from(knowledgeArticles)
        .where(eq(knowledgeArticles.sourceTicketId, data.ticketId));
      if (existing) throw new RuleError("Este ticket ya generó un artículo de conocimiento.");

      let anonReplacements: { companyName?: string | null; contactName?: string | null } = {};
      if (data.anonymize === "true") {
        const [client] = row.item.companyId
          ? await tx.select({ name: companies.name }).from(companies).where(eq(companies.id, row.item.companyId))
          : [];
        // tickets.contact is free text (no Contact FK yet — see schema comment), used as-is.
        anonReplacements = { companyName: client?.name ?? null, contactName: row.ticket.contact };
      }
      const anon = (t: string | null) => (data.anonymize === "true" ? anonymizeText(t, anonReplacements) : t);

      const slug = await nextSlug(tx, user.organizationId, data.title);
      const [created] = await tx
        .insert(knowledgeArticles)
        .values({
          organizationId: user.organizationId,
          categoryId: data.categoryId,
          title: data.title,
          slug,
          status: "draft",
          problem: anon(data.problem),
          cause: anon(data.cause),
          solution: anon(data.solution),
          steps: data.steps.map((s) => anon(s) ?? s),
          notes: anon(data.notes),
          anonymized: data.anonymize === "true",
          authorId: Number(user.id),
          sourceTicketId: data.ticketId,
        })
        .returning({ id: knowledgeArticles.id });

      await tx.insert(knowledgeArticleVersions).values({
        articleId: created.id,
        versionNumber: 1,
        title: data.title,
        problem: anon(data.problem),
        cause: anon(data.cause),
        solution: anon(data.solution),
        steps: data.steps.map((s) => anon(s) ?? s),
        notes: anon(data.notes),
        editedById: Number(user.id),
        changeSummary: `Generado desde el ticket ${row.ticket.folio}`,
      });

      await createRelations(
        tx,
        user,
        created.id,
        { companyId: row.item.companyId, projectId: null, ticketId: data.ticketId, workItemId: null },
        "ticket",
      );

      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "knowledge_article",
        entityId: created.id,
        action: "create",
        metadata: {
          event: "created_from_ticket",
          ticketId: data.ticketId,
          folio: row.ticket.folio,
          anonymized: data.anonymize === "true",
        },
      });
      return created.id;
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath(`/helpdesk/${data.ticketId}`);
  refresh();
  redirect(`/knowledge/${articleId}`);
}

/* ------------------------------------------------------------------ delete (SuperAdmin) */

export async function deleteArticle(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!hasRole(user.role, ["superadmin"])) return businessError("Solo SuperAdmin puede eliminar artículos.");
  const id = z.coerce.number().int().positive().parse(formData.get("id"));
  try {
    await db.transaction(async (tx) => {
      const article = await loadArticle(tx, user, id);
      await tx.delete(knowledgeArticles).where(eq(knowledgeArticles.id, id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "knowledge_article",
        entityId: id,
        action: "delete",
        metadata: { values: { title: article.title } },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh();
  return success("Artículo eliminado.");
}

/* ------------------------------------------------------------- categories */

const categorySchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido.").max(120),
  description: optionalText,
  color: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable()),
});

export async function createCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!hasRole(user.role, ["superadmin", "administrator", "director"])) {
    return businessError("No tienes permiso para administrar categorías.");
  }
  const { data, error } = parseForm(categorySchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const slug = slugify(data.name);
      const [existing] = await tx.select({ id: knowledgeCategories.id }).from(knowledgeCategories).where(and(eq(knowledgeCategories.organizationId, user.organizationId), eq(knowledgeCategories.slug, slug)));
      if (existing) throw new RuleError("Ya existe una categoría con ese nombre.");
      const [created] = await tx
        .insert(knowledgeCategories)
        .values({ organizationId: user.organizationId, name: data.name, slug, description: data.description, color: data.color, createdById: Number(user.id) })
        .returning({ id: knowledgeCategories.id });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "knowledge_category",
        entityId: created.id,
        action: "create",
        metadata: { values: data },
      });
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/settings/knowledge");
  revalidatePath("/knowledge");
  return success("Categoría creada.");
}

export async function toggleCategory(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  if (!hasRole(user.role, ["superadmin", "administrator", "director"])) {
    return businessError("No tienes permiso para administrar categorías.");
  }
  const id = z.coerce.number().int().positive().parse(formData.get("id"));
  try {
    await db.transaction(async (tx) => {
      const [cat] = await tx.select().from(knowledgeCategories).where(and(eq(knowledgeCategories.id, id), eq(knowledgeCategories.organizationId, user.organizationId)));
      if (!cat) throw new NotFoundError();
      const next = !cat.isActive;
      await tx.update(knowledgeCategories).set({ isActive: next, updatedAt: new Date() }).where(eq(knowledgeCategories.id, id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "knowledge_category",
        entityId: id,
        action: "update",
        field: "isActive",
        oldValue: String(cat.isActive),
        newValue: String(next),
        metadata: { event: next ? "restored" : "archived" },
      });
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/settings/knowledge");
  revalidatePath("/knowledge");
  return success();
}
