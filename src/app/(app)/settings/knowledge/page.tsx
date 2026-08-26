import type { Metadata } from "next";
import { getCategories } from "@/lib/knowledge-data";
import { getOrgLocale } from "@/lib/get-org-locale";
import { t } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { CategoryForm, CategoryRow } from "./knowledge-settings-forms";

export const metadata: Metadata = { title: "Configuración · Conocimiento" };

export default async function KnowledgeSettingsPage() {
  const user = await requireRole("superadmin", "administrator");
  const locale = await getOrgLocale(user.organizationId);
  const categories = await getCategories(user.organizationId, { includeInactive: true });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Conocimiento", "Knowledge", locale)}
        subtitle={t(
          "Categorías de la Base de Conocimiento (KB Operativa).",
          "Categories of the Knowledge Base (Operational KB).",
          locale,
        )}
      />

      <Card className="p-5">
        <CardHeader title={t("Nueva categoría", "New category", locale)} className="mb-4 px-0 pt-0" />
        <CategoryForm />
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title={`${t("Categorías", "Categories", locale)} (${categories.length})`} />
        {categories.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">{t("Sin categorías todavía.", "No categories yet.", locale)}</p>
        ) : (
          <ul className="divide-y divide-edge">
            {categories.map((c) => (
              <CategoryRow key={c.id} category={c} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
