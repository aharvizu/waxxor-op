import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { FilePlus2, Pencil } from "lucide-react";
import { db } from "@/db";
import { assessments, proposals } from "@/db/schema";
import { Badge, Card, PageHeader, buttonClass, buttonSecondaryClass } from "@/components/ui";
import { ALL_QUESTIONS, ASSESSMENT_SECTIONS, answerLabel, answeredCount } from "@/lib/assessments/questionnaire";
import { deriveOpportunities } from "@/lib/assessments/recommendations";
import { fmtDate } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Levantamiento" };

export default async function AssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const assessmentId = Number(id);
  if (!Number.isInteger(assessmentId)) notFound();
  const orgId = user.organizationId;

  const [[row], linked] = await Promise.all([
    db.select().from(assessments).where(and(eq(assessments.id, assessmentId), eq(assessments.organizationId, orgId))),
    db
      .select({ id: proposals.id, folio: proposals.folio, status: proposals.status, productKey: proposals.productKey })
      .from(proposals)
      .where(and(eq(proposals.assessmentId, assessmentId), eq(proposals.organizationId, orgId)))
      .orderBy(desc(proposals.createdAt)),
  ]);
  if (!row) notFound();

  const opportunities = deriveOpportunities(row.answers);
  const contact = [row.contactName, row.contactEmail, row.contactPhone].filter(Boolean).join(" · ");

  return (
    <div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {row.clientName}
            <Badge tone={row.status === "completed" ? "green" : "amber"}>{row.status === "completed" ? "Completado" : "En proceso"}</Badge>
          </span>
        }
        subtitle={`Levantamiento del ${fmtDate(row.conductedOn)} · ${answeredCount(row.answers)} de ${ALL_QUESTIONS.length} preguntas${contact ? ` · ${contact}` : ""}`}
        action={
          <Link href={`/assessments/${row.id}/edit`} className={buttonSecondaryClass}>
            <Pencil /> Editar
          </Link>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-6">
          {ASSESSMENT_SECTIONS.map((section) => {
            const answered = section.questions
              .map((q) => ({ q, label: answerLabel(q, row.answers) }))
              .filter((x): x is { q: (typeof section.questions)[number]; label: string } => x.label !== null);
            return (
              <Card key={section.key} className="p-5">
                <h2 className="mb-3 text-sm font-semibold text-fg">{section.title}</h2>
                {answered.length === 0 ? (
                  <p className="text-sm text-faint">Sin respuestas todavía.</p>
                ) : (
                  <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
                    {answered.map(({ q, label }) => (
                      <div key={q.key} className={q.type === "textarea" ? "sm:col-span-2" : undefined}>
                        <dt className="text-xs text-muted">{q.label}</dt>
                        <dd className="whitespace-pre-wrap text-sm text-fg">{label}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </Card>
            );
          })}
          {row.notes ? (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold text-fg">Notas generales</h2>
              <p className="whitespace-pre-wrap text-sm text-fg">{row.notes}</p>
            </Card>
          ) : null}
        </div>

        <aside className="space-y-4">
          <Card className="p-5">
            <h2 className="text-sm font-semibold text-fg">Oportunidades</h2>
            <p className="mt-1 text-xs text-muted">Derivadas de las respuestas; cada una cita el hallazgo que la sustenta.</p>
            {opportunities.length === 0 ? (
              <p className="mt-4 text-sm text-faint">
                Las respuestas actuales no señalan ninguna. Aparecen conforme se contesta el cuestionario.
              </p>
            ) : (
              <ul className="mt-4 space-y-5">
                {opportunities.map((o) => (
                  <li key={o.key}>
                    <p className="text-sm font-medium text-fg">{o.title}</p>
                    <ul className="mt-1.5 list-disc space-y-1 pl-4 text-sm text-muted">
                      {o.reasons.map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                    {o.productKey ? (
                      <Link
                        href={`/proposals/new?product=${o.productKey}${o.planKey ? `&plan=${o.planKey}` : ""}&assessmentId=${row.id}`}
                        className={`${buttonClass} mt-3`}
                      >
                        <FilePlus2 /> Generar propuesta
                      </Link>
                    ) : (
                      <p className="mt-2 text-xs text-faint">Aún no hay formato de propuesta para este servicio.</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {linked.length > 0 ? (
            <Card className="p-5">
              <h2 className="mb-3 text-sm font-semibold text-fg">Propuestas de este levantamiento</h2>
              <ul className="space-y-2 text-sm">
                {linked.map((p) => (
                  <li key={p.id}>
                    <Link href={`/proposals/${p.id}`} className="text-primary hover:underline">
                      {p.folio ?? "Borrador"}
                    </Link>
                    <span className="ml-2 text-muted">{p.productKey}</span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
