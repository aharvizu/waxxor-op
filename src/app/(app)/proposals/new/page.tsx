import type { Metadata } from "next";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { assessments } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { assessmentPrefill } from "@/lib/assessments/recommendations";
import { presentRecurrences } from "@/lib/proposals/calc";
import { getProduct, resolvePeriod } from "@/lib/proposals/catalog";
import { ORG_TIMEZONE } from "@/lib/reports";
import { requireUser } from "@/lib/session";
import { listProposalCompanies } from "../form-data";
import { ProposalForm, type ProposalFormInitial } from "../proposal-form";

export const metadata: Metadata = { title: "Nueva propuesta" };

/**
 * Nueva propuesta. `?product=` preselecciona el producto; `?assessmentId=`
 * la arranca desde un levantamiento: cliente, empresa y cantidades sugeridas
 * (usuarios → licencias, equipos → agentes) salen de sus respuestas.
 */
export default async function NewProposalPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string; plan?: string; assessmentId?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const product = getProduct(params.product ?? "") ?? getProduct("sentinelone")!;
  const planKey = product.plans.some((p) => p.key === params.plan) ? params.plan! : product.defaultPlan;
  const period = resolvePeriod(product, null);
  const ctx = { planKey, period, validityDays: 30 };

  const assessmentId = Number(params.assessmentId);
  const [[assessment], companies] = await Promise.all([
    Number.isInteger(assessmentId) && assessmentId > 0
      ? db
          .select()
          .from(assessments)
          .where(and(eq(assessments.id, assessmentId), eq(assessments.organizationId, user.organizationId)))
      : Promise.resolve([]),
    listProposalCompanies(user.organizationId),
  ]);

  let items = product.suggestedItems(ctx);
  if (assessment) items = assessmentPrefill(product.key, assessment.answers, items);

  const initial: ProposalFormInitial = {
    id: null,
    assessmentId: assessment?.id ?? null,
    companyId: assessment?.companyId ?? null,
    clientName: assessment?.clientName ?? "",
    preparedBy: `${user.name ?? "Waxxor"} · Waxxor`,
    date: new Intl.DateTimeFormat("en-CA", { timeZone: ORG_TIMEZONE }).format(new Date()),
    validityDays: 30,
    productKey: product.key,
    planKey,
    billingPeriod: period,
    items,
    note: product.defaultNote(ctx, presentRecurrences(items)),
    ivaBps: 1600,
  };

  return (
    <div>
      <PageHeader
        title="Nueva propuesta"
        subtitle={
          assessment
            ? `A partir del levantamiento de ${assessment.clientName}. Se guarda como borrador; el folio se asigna al emitir.`
            : "Se guarda como borrador; el folio se asigna al emitir."
        }
      />
      <ProposalForm initial={initial} companies={companies} />
    </div>
  );
}
