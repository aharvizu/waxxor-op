import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { knowledgeRelationTypeMeta, knowledgeStatusMeta, knowledgeVisibilityMeta } from "@/lib/labels";
import { canCreateDraft, canEditArticle, canPublish, canReview } from "@/lib/knowledge";
import { getArticleDetail, getCategories } from "@/lib/knowledge-data";
import { requireUser } from "@/lib/session";
import { fmtDateTime } from "@/lib/format";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { ArticleForm, ArticleWorkflowPanel, FavoriteButton } from "../knowledge-forms";

export const metadata: Metadata = { title: "Artículo" };

const RELATION_HREF: Record<string, (id: number) => string> = {
  ticket: (id) => `/helpdesk/${id}`,
  company: (id) => `/companies/${id}`,
  project: (id) => `/projects/${id}`,
  activity: (id) => `/activities/${id}`,
};

export default async function KnowledgeArticlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const { id } = await params;
  const articleId = Number(id);
  if (!Number.isInteger(articleId)) notFound();

  const detail = await getArticleDetail(user.organizationId, Number(user.id), articleId);
  if (!detail) notFound();
  if (detail.article.status !== "published" && !canCreateDraft(user.role)) notFound();

  const categories = await getCategories(user.organizationId);
  const a = detail.article;
  const editable = canEditArticle(user.role, a, Number(user.id));

  return (
    <div>
      <PageHeader
        title={a.title}
        subtitle={`v${a.currentVersion} · ${detail.categoryName ?? "Sin categoría"} · Autor: ${detail.authorName ?? "—"}${detail.reviewerName ? ` · Revisor: ${detail.reviewerName}` : ""}`}
        action={
          <span className="flex items-center gap-2">
            <FavoriteButton articleId={a.id} isFavorite={detail.isFavorite} />
            <Badge tone={knowledgeStatusMeta[a.status]?.tone ?? "slate"}>{knowledgeStatusMeta[a.status]?.label ?? a.status}</Badge>
            <Badge tone={knowledgeVisibilityMeta[a.visibility]?.tone ?? "slate"}>{knowledgeVisibilityMeta[a.visibility]?.label ?? a.visibility}</Badge>
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          {a.anonymized ? (
            <div role="status" className="rounded-lg border border-edge bg-subtle px-4 py-2.5 text-xs text-muted">
              Este artículo fue generado desde un ticket con datos anonimizados.
            </div>
          ) : null}

          {editable ? (
            <Card className="p-6">
              <CardHeader title="Editar contenido" className="mb-4 px-0 pt-0" />
              <ArticleForm
                categories={categories}
                article={{
                  id: a.id,
                  title: a.title,
                  categoryId: a.categoryId,
                  problem: a.problem,
                  cause: a.cause,
                  solution: a.solution,
                  steps: (a.steps as string[]) ?? [],
                  notes: a.notes,
                  tags: (a.tags as string[]) ?? [],
                }}
                submitLabel="Guardar (crea nueva versión)"
              />
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <CardHeader title="Contenido" />
              <div className="space-y-4 p-5 text-sm text-fg">
                {a.problem ? <p><strong className="text-muted">Problema:</strong> {a.problem}</p> : null}
                {a.cause ? <p><strong className="text-muted">Causa:</strong> {a.cause}</p> : null}
                {a.solution ? <p className="whitespace-pre-wrap"><strong className="text-muted">Solución:</strong> {a.solution}</p> : null}
                {(a.steps as string[])?.length > 0 ? (
                  <div>
                    <strong className="text-muted">Pasos:</strong>
                    <ol className="mt-1 list-decimal space-y-1 pl-5">
                      {(a.steps as string[]).map((s, i) => <li key={i}>{s}</li>)}
                    </ol>
                  </div>
                ) : null}
                {a.notes ? <p><strong className="text-muted">Notas:</strong> {a.notes}</p> : null}
              </div>
            </Card>
          )}

          <Card className="overflow-hidden">
            <CardHeader title={`Historial de versiones (${detail.versions.length})`} />
            <ul className="divide-y divide-edge">
              {detail.versions.map((v) => (
                <li key={v.id} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                  <span>
                    <span className="font-medium text-fg">v{v.versionNumber}</span>{" "}
                    <span className="text-muted">{v.changeSummary ?? "—"}</span>
                  </span>
                  <span className="shrink-0 text-xs text-faint">{v.editedByName ?? "—"} · {fmtDateTime(v.createdAt)}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-5">
            <CardHeader title="Flujo" className="mb-3 px-0 pt-0" />
            <ArticleWorkflowPanel
              articleId={a.id}
              status={a.status}
              canReview={canReview(user.role)}
              canPublish={canPublish(user.role)}
            />
            {a.reviewNotes ? (
              <p className="mt-3 rounded-lg border border-amber-300/50 bg-amber-50/50 p-3 text-xs text-fg dark:bg-amber-400/5">
                <strong>Notas de revisión:</strong> {a.reviewNotes}
              </p>
            ) : null}
          </Card>

          <Card className="p-5">
            <CardHeader title="Relacionado" className="mb-3 px-0 pt-0" />
            {detail.relations.length === 0 ? (
              <p className="text-sm text-muted">Sin relaciones.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {detail.relations.map((r) => (
                  <li key={r.id} className="flex items-center gap-2">
                    <Badge tone={knowledgeRelationTypeMeta[r.relatedType]?.tone ?? "slate"}>
                      {knowledgeRelationTypeMeta[r.relatedType]?.label ?? r.relatedType}
                    </Badge>
                    <Link href={RELATION_HREF[r.relatedType]?.(r.relatedId) ?? "#"} className="text-primary hover:underline">
                      {r.label}
                    </Link>
                    {r.isOrigin ? <span className="text-xs text-faint">(origen)</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
