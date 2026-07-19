import { z } from "zod";
import { knowledgeArticleStatus, knowledgeRelationType, knowledgeVisibility } from "@/db/schema";
import type { Role } from "@/lib/roles";

/**
 * Pure KB Operativa domain: status/visibility catalogs, the state machine,
 * per-action permission checks and the Ticket->KB anonymization helper.
 * No DB access here — reads live in knowledge-data.ts, writes in the
 * /knowledge actions.
 */

export const KNOWLEDGE_STATUSES = knowledgeArticleStatus.enumValues;
export type KnowledgeStatus = (typeof KNOWLEDGE_STATUSES)[number];

export const KNOWLEDGE_VISIBILITIES = knowledgeVisibility.enumValues;
export type KnowledgeVisibility = (typeof KNOWLEDGE_VISIBILITIES)[number];

export const KNOWLEDGE_RELATION_TYPES = knowledgeRelationType.enumValues;
export type KnowledgeRelationType = (typeof KNOWLEDGE_RELATION_TYPES)[number];

/**
 * draft -> in_review -> published -> archived, with in_review -> draft
 * (changes requested) and archived -> draft (restore). Administrator/
 * Director/SuperAdmin may also publish directly from draft — they already
 * hold publish authority, so forcing a formal review step adds no control.
 */
const TRANSITIONS: Record<KnowledgeStatus, KnowledgeStatus[]> = {
  draft: ["in_review", "published"],
  in_review: ["draft", "published"],
  published: ["archived"],
  archived: ["draft"],
};

export function canTransitionArticle(from: KnowledgeStatus, to: KnowledgeStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** Roles allowed to submit a draft for review (or publish it directly, per canTransitionArticle). */
const AUTHOR_ROLES: readonly Role[] = [
  "superadmin",
  "administrator",
  "director",
  "project_manager",
  "technician",
];

/** "Project Manager puede revisar" — plus the roles that can publish anyway. */
const REVIEWER_ROLES: readonly Role[] = ["superadmin", "administrator", "director", "project_manager"];

/** "Administrator y Director pueden publicar" (SuperAdmin always passes via hasRole). */
const PUBLISHER_ROLES: readonly Role[] = ["superadmin", "administrator", "director"];

export function canCreateDraft(role: Role): boolean {
  return AUTHOR_ROLES.includes(role);
}

export function canReview(role: Role): boolean {
  return REVIEWER_ROLES.includes(role);
}

export function canPublish(role: Role): boolean {
  return PUBLISHER_ROLES.includes(role);
}

/**
 * Editing rules: the author may always edit their own non-archived article;
 * roles with publish authority may edit anything (oversight); a reviewer may
 * edit only while an article is in review (part of the review itself).
 */
export function canEditArticle(
  role: Role,
  article: { status: KnowledgeStatus; authorId: number | null },
  userId: number,
): boolean {
  if (article.status === "archived") return false;
  if (PUBLISHER_ROLES.includes(role)) return true;
  if (article.authorId === userId) return true;
  if (REVIEWER_ROLES.includes(role) && article.status === "in_review") return true;
  return false;
}

export const knowledgeStepsSchema = z.array(z.string().trim().min(1)).max(30);
export const knowledgeTagsSchema = z.array(z.string().trim().min(1).max(40)).max(15);

/**
 * Best-effort anonymization for the Ticket->KB flow: strips things that read
 * like a person/company name or contact detail from free text. Deterministic
 * regex-based redaction, not NLP — documented limitation, not a promise of
 * perfect PII removal.
 */
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /(?:\+?\d[\d\s.-]{7,}\d)/g;

export function anonymizeText(
  text: string | null,
  replacements: { companyName?: string | null; contactName?: string | null },
): string | null {
  if (!text) return text;
  let out = text;
  if (replacements.companyName) {
    out = out.split(replacements.companyName).join("[cliente]");
  }
  if (replacements.contactName) {
    out = out.split(replacements.contactName).join("[contacto]");
  }
  out = out.replace(EMAIL_RE, "[correo]").replace(PHONE_RE, "[teléfono]");
  return out;
}

export function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining diacritics after NFD split
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "articulo";
}
