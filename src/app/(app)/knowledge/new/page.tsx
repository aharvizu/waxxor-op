import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { canCreateDraft } from "@/lib/knowledge";
import { getCategories } from "@/lib/knowledge-data";
import { requireUser } from "@/lib/session";
import { ArticleForm } from "../knowledge-forms";

export const metadata: Metadata = { title: "Nuevo artículo" };

export default async function NewKnowledgeArticlePage() {
  const user = await requireUser();
  if (!canCreateDraft(user.role)) redirect("/knowledge");
  const categories = await getCategories(user.organizationId);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="Nuevo artículo"
        subtitle="Se crea como borrador — nunca se publica automáticamente."
      />
      <Card className="p-6">
        <ArticleForm categories={categories} />
      </Card>
    </div>
  );
}
