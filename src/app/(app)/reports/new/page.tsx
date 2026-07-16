import type { Metadata } from "next";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { clients, reportTemplates } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { Card, PageHeader, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { createReport } from "../actions";

export const metadata: Metadata = { title: "New report" };

export default async function NewReportPage() {
  const user = await requireUser();
  const [templateRows, clientRows] = await Promise.all([
    db
      .select({ id: reportTemplates.id, name: reportTemplates.name })
      .from(reportTemplates)
      .where(eq(reportTemplates.organizationId, user.organizationId))
      .orderBy(asc(reportTemplates.name)),
    db
      .select({ id: clients.id, name: clients.name })
      .from(clients)
      .where(eq(clients.organizationId, user.organizationId))
      .orderBy(asc(clients.name)),
  ]);

  return (
    <div className="max-w-2xl">
      <PageHeader
        title="New report"
        subtitle="Pick a template and client — placeholders are filled in automatically, then you can edit the result."
      />
      <Card className="p-6">
        <form action={createReport} className="space-y-4">
          <div>
            <label htmlFor="title" className={labelClass}>
              Report title
            </label>
            <input
              id="title"
              name="title"
              required
              placeholder="e.g. Monthly security summary — July 2026"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="templateId" className={labelClass}>
                Template
              </label>
              <select id="templateId" name="templateId" className={inputClass}>
                <option value="">Blank report</option>
                {templateRows.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="clientId" className={labelClass}>
                Client
              </label>
              <select id="clientId" name="clientId" className={inputClass}>
                <option value="">— None —</option>
                {clientRows.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <SubmitButton>Generate report</SubmitButton>
        </form>
      </Card>
    </div>
  );
}
