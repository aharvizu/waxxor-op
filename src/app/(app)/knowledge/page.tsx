import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen } from "lucide-react";
import { knowledgeStatusMeta } from "@/lib/labels";
import type { KnowledgeStatus } from "@/lib/knowledge";
import { getCategories, listArticles } from "@/lib/knowledge-data";
import { requireUser } from "@/lib/session";
import {
  Badge,
  Card,
  EmptyState,
  PageHeader,
  THead,
  Table,
  Td,
  Th,
  buttonClass,
  cx,
  inputClass,
} from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { AutoSubmitSelect } from "./knowledge-forms";

export const metadata: Metadata = { title: "Base de conocimiento" };

type Search = {
  status?: string;
  categoryId?: string;
  q?: string;
  favorites?: string;
  tag?: string;
};

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireUser();
  const params = await searchParams;
  // Every internal role that reaches this page can create/review/publish
  // something in the workflow (client is blocked earlier by requireUser),
  // so all statuses are visible — there is no "outside contributor" role here.

  const [articles, categories] = await Promise.all([
    listArticles(user.organizationId, Number(user.id), true, {
      status: params.status as KnowledgeStatus | undefined,
      categoryId: params.categoryId ? Number(params.categoryId) : undefined,
      q: params.q?.trim() || undefined,
      favoritesOnly: params.favorites === "1",
      tag: params.tag || undefined,
    }),
    getCategories(user.organizationId),
  ]);

  const href = (extra: Record<string, string | undefined>) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
    for (const [k, v] of Object.entries(extra)) {
      if (!v) q.delete(k);
      else q.set(k, v);
    }
    const qs = q.toString();
    return `/knowledge${qs ? `?${qs}` : ""}`;
  };

  return (
    <div>
      <PageHeader
        title="Base de conocimiento"
        subtitle="Procedimientos internos y soluciones técnicas reutilizables — artículos manuales o generados desde tickets resueltos."
        action={
          <Link href="/knowledge/new" className={buttonClass}>
            Nuevo artículo
          </Link>
        }
      />

      <form method="get" className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-4">
        {params.favorites ? <input type="hidden" name="favorites" value={params.favorites} /> : null}
        {params.tag ? <input type="hidden" name="tag" value={params.tag} /> : null}
        <input name="q" defaultValue={params.q ?? ""} placeholder="Buscar título, problema o solución…" className={cx(inputClass, "md:col-span-2")} />
        <AutoSubmitSelect name="status" defaultValue={params.status ?? ""} className={inputClass}>
          <option value="">Estado: todos</option>
          {Object.entries(knowledgeStatusMeta).map(([k, m]) => (
            <option key={k} value={k}>{m.label}</option>
          ))}
        </AutoSubmitSelect>
        <AutoSubmitSelect name="categoryId" defaultValue={params.categoryId ?? ""} className={inputClass}>
          <option value="">Categoría: todas</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </AutoSubmitSelect>
      </form>

      <div className="mb-4 flex flex-wrap gap-1.5 text-xs">
        <Link href={href({ favorites: params.favorites === "1" ? undefined : "1" })} className={cx("rounded-full border px-2.5 py-1", params.favorites === "1" ? "border-primary bg-primary-soft text-primary" : "border-edge text-muted hover:text-fg")}>
          ★ Favoritos
        </Link>
      </div>

      <Card className="overflow-hidden">
        {articles.length === 0 ? (
          <div className="p-5">
            <EmptyState icon={<BookOpen className="size-6" />} title="Sin artículos">
              Nada por aquí con los filtros actuales. Crea el primero o genera uno desde un ticket resuelto.
            </EmptyState>
          </div>
        ) : (
          <Table>
            <THead>
              <tr>
                <Th>Título</Th>
                <Th>Categoría</Th>
                <Th>Estado</Th>
                <Th>Autor</Th>
                <Th>Actualizado</Th>
              </tr>
            </THead>
            <tbody>
              {articles.map((a) => (
                <tr key={a.id} className="border-t border-edge">
                  <Td>
                    <Link href={`/knowledge/${a.id}`} className="font-medium text-fg hover:text-primary">
                      {a.isFavorite ? "★ " : ""}
                      {a.title}
                    </Link>
                    {(a.tags as string[]).length > 0 ? (
                      <span className="mt-0.5 block text-xs text-muted">{(a.tags as string[]).join(" · ")}</span>
                    ) : null}
                  </Td>
                  <Td className="text-sm text-muted">{a.categoryName ?? "—"}</Td>
                  <Td>
                    <Badge tone={knowledgeStatusMeta[a.status]?.tone ?? "slate"}>{knowledgeStatusMeta[a.status]?.label ?? a.status}</Badge>
                  </Td>
                  <Td className="text-sm text-muted">{a.authorName ?? "—"}</Td>
                  <Td className="text-xs text-faint">{fmtDateTime(a.updatedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
    </div>
  );
}
