import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { reportTemplates } from "@/db/schema";
import { reportTypeMeta } from "@/lib/labels";
import { defaultSections } from "@/lib/reports";
import { requireUser } from "@/lib/session";
import { Badge, Card, CardHeader, PageHeader, buttonSecondaryClass } from "@/components/ui";
import { TemplateEditor } from "./template-editor";

export const metadata: Metadata = { title: "Report templates" };

export default async function ReportTemplatesPage() {
  const user = await requireUser();
  const rows = await db
    .select()
    .from(reportTemplates)
    .where(eq(reportTemplates.organizationId, user.organizationId))
    .orderBy(asc(reportTemplates.name));

  return (
    <div>
      <PageHeader
        title="Plantillas de reporte"
        subtitle="Secciones activas, orden y títulos de cada tipo de reporte — sin editor visual complejo."
        action={<Link href="/reports" className={buttonSecondaryClass}>Volver a reportes</Link>}
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="p-6">
          <CardHeader title="Nueva plantilla" className="mb-4 px-0 pt-0" />
          <TemplateEditor defaultSectionsJson={JSON.stringify(defaultSections(), null, 2)} />
        </Card>
        <div className="space-y-4">
          {rows.map((t) => (
            <Card key={t.id} className="p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="font-medium text-fg">{t.name}</span>
                <Badge tone={reportTypeMeta[t.reportType]?.tone ?? "slate"}>
                  {reportTypeMeta[t.reportType]?.label ?? t.reportType}
                </Badge>
              </div>
              <details>
                <summary className="cursor-pointer text-xs text-muted hover:text-fg">Editar</summary>
                <div className="mt-3">
                  <TemplateEditor
                    template={{
                      id: t.id,
                      name: t.name,
                      reportType: t.reportType,
                      description: t.description,
                      includeLogo: t.includeLogo,
                      includeCover: t.includeCover,
                      includeExecutiveSummary: t.includeExecutiveSummary,
                      includeConclusions: t.includeConclusions,
                      includeRecommendations: t.includeRecommendations,
                    }}
                    defaultSectionsJson={JSON.stringify(t.sections ?? defaultSections(), null, 2)}
                  />
                </div>
              </details>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
