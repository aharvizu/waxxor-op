import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { assessments, companies, proposals } from "@/db/schema";
import { Badge, PageHeader } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { getLabels } from "@/lib/labels";
import { getOrgLocale } from "@/lib/get-org-locale";
import { getPlan, getProduct } from "@/lib/proposals/catalog";
import { allowedTransitions, effectiveStatus } from "@/lib/proposals/lifecycle";
import { COLUMN_LABELS, presentRecurrences } from "@/lib/proposals/calc";
import { formatCents } from "@/lib/proposals/money";
import type { Recurrence } from "@/lib/proposals/types";
import { ORG_TIMEZONE } from "@/lib/reports";
import { requireUser } from "@/lib/session";
import { ProposalWorkspace } from "./proposal-workspace";

export const metadata: Metadata = { title: "Propuesta" };

export default async function ProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const proposalId = Number(id);
  if (!Number.isInteger(proposalId)) notFound();
  const orgId = user.organizationId;

  const [row] = await db
    .select({ proposal: proposals, companyName: companies.name, assessmentClient: assessments.clientName })
    .from(proposals)
    .leftJoin(companies, eq(proposals.companyId, companies.id))
    .leftJoin(assessments, eq(proposals.assessmentId, assessments.id))
    .where(and(eq(proposals.id, proposalId), eq(proposals.organizationId, orgId)));
  if (!row) notFound();
  const p = row.proposal;

  // "Sustituye a…" y "Sustituida por…": el rastro de una corrección por cancelar y clonar.
  const [[replaces], replacedBy] = await Promise.all([
    p.replacesProposalId
      ? db
          .select({ id: proposals.id, folio: proposals.folio })
          .from(proposals)
          .where(and(eq(proposals.id, p.replacesProposalId), eq(proposals.organizationId, orgId)))
      : Promise.resolve([]),
    db
      .select({ id: proposals.id, folio: proposals.folio })
      .from(proposals)
      .where(and(eq(proposals.replacesProposalId, p.id), eq(proposals.organizationId, orgId))),
  ]);

  const locale = await getOrgLocale(orgId);
  const { proposalStatusMeta } = getLabels(locale);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: ORG_TIMEZONE }).format(new Date());
  const status = effectiveStatus(p.status, p.expiresAt, today);
  const product = getProduct(p.productKey);
  const productName = product ? (product.planLabel ? getPlan(product, p.planKey).name : product.name) : p.productKey;

  const facts: { label: string; value: React.ReactNode }[] = [
    { label: "Cliente", value: p.companyId ? <Link className="text-primary hover:underline" href={`/companies/${p.companyId}`}>{row.companyName ?? p.clientName}</Link> : `${p.clientName} (prospecto)` },
    { label: "Producto", value: productName },
    { label: "Fecha", value: fmtDate(p.date) },
    { label: "Vence", value: fmtDate(p.expiresAt) },
  ];
  // Una cifra por columna presente, igual que el documento: nunca un gran total.
  const columnTotals: Record<Recurrence, number> = {
    one_time: p.totalOneTimeCents,
    monthly: p.totalMonthlyCents,
    annual: p.totalAnnualCents,
  };
  for (const r of presentRecurrences(p.items)) {
    facts.push({
      label: product?.totalsMode === "single" ? "Inversión total" : COLUMN_LABELS[r].header,
      value: formatCents(columnTotals[r]),
    });
  }
  if (p.issuedAt) facts.push({ label: "Emitida", value: fmtDateTime(p.issuedAt) });

  return (
    <div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {p.folio ?? "Borrador sin folio"}
            <Badge tone={proposalStatusMeta[status]?.tone ?? "slate"}>{proposalStatusMeta[status]?.label ?? status}</Badge>
          </span>
        }
        subtitle={`${p.clientName} · ${productName}`}
      />

      <dl className="mb-4 flex flex-wrap gap-x-8 gap-y-3 rounded-xl border border-edge bg-surface px-5 py-4 text-sm">
        {facts.map((f) => (
          <div key={f.label}>
            <dt className="text-xs text-muted">{f.label}</dt>
            <dd className="font-medium tabular-nums text-fg">{f.value}</dd>
          </div>
        ))}
      </dl>

      {replaces || replacedBy.length > 0 || p.assessmentId ? (
        <p className="mb-4 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted">
          {replaces ? (
            <span>
              Sustituye a{" "}
              <Link className="text-primary hover:underline" href={`/proposals/${replaces.id}`}>{replaces.folio ?? "un borrador"}</Link>
            </span>
          ) : null}
          {replacedBy.map((r) => (
            <span key={r.id}>
              Sustituida por{" "}
              <Link className="text-primary hover:underline" href={`/proposals/${r.id}`}>{r.folio ?? "un borrador"}</Link>
            </span>
          ))}
          {p.assessmentId ? (
            <span>
              Basada en el{" "}
              <Link className="text-primary hover:underline" href={`/assessments/${p.assessmentId}`}>
                levantamiento de {row.assessmentClient ?? p.clientName}
              </Link>
            </span>
          ) : null}
        </p>
      ) : null}

      <ProposalWorkspace id={p.id} status={status} allowed={allowedTransitions(status)} version={p.updatedAt.toISOString()} />
    </div>
  );
}
