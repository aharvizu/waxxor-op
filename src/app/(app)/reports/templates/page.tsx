import type { Metadata } from "next";
import { asc } from "drizzle-orm";
import { db } from "@/db";
import { reportTemplates } from "@/db/schema";
import { LayoutTemplate, Trash2 } from "lucide-react";
import {
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  inputClass,
  labelClass,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createTemplate, deleteTemplate } from "../actions";

export const metadata: Metadata = { title: "Report templates" };

export default async function TemplatesPage() {
  const rows = await db.select().from(reportTemplates).orderBy(asc(reportTemplates.name));

  return (
    <div>
      <PageHeader
        title="Report templates"
        subtitle="Reusable report bodies. Placeholders: {{client}}, {{date}}, {{title}}, {{author}}."
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          {rows.length === 0 ? (
            <EmptyState icon={<LayoutTemplate />} title="No templates yet">
              Create a reusable report body on the right — placeholders are filled
              in automatically when you generate a report.
            </EmptyState>
          ) : (
            rows.map((t) => (
              <Card key={t.id} className="p-5 hover:shadow-card-hover">
                <div className="mb-2 flex items-start justify-between gap-4">
                  <div>
                    <h2 className="text-sm font-semibold">{t.name}</h2>
                    {t.description ? (
                      <p className="mt-0.5 text-sm text-muted">{t.description}</p>
                    ) : null}
                  </div>
                  <form action={deleteTemplate}>
                    <input type="hidden" name="id" value={t.id} />
                    <button
                      type="submit"
                      aria-label={`Delete template ${t.name}`}
                      className="flex size-8 items-center justify-center rounded-lg text-faint transition-colors duration-150 hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </form>
                </div>
                <pre className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-edge bg-inset p-3 font-mono text-xs text-muted">
                  {t.content}
                </pre>
              </Card>
            ))
          )}
        </div>

        <Card className="h-fit overflow-hidden">
          <CardHeader title="New template" description="A reusable report body." />
          <form action={createTemplate} className="space-y-4 p-5">
            <div>
              <label htmlFor="name" className={labelClass}>
                Name
              </label>
              <input
                id="name"
                name="name"
                required
                placeholder="e.g. Monthly security summary"
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="description" className={labelClass}>
                Description
              </label>
              <input id="description" name="description" className={inputClass} />
            </div>
            <div>
              <label htmlFor="content" className={labelClass}>
                Content
              </label>
              <textarea
                id="content"
                name="content"
                rows={12}
                required
                placeholder={`# {{title}}\n\nPrepared for {{client}} on {{date}} by {{author}}.\n\n## Executive summary\n\n…`}
                className={`${inputClass} font-mono`}
              />
            </div>
            <SubmitButton>Create template</SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
