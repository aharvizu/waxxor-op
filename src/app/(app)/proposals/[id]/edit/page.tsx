import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { proposals } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { listProposalCompanies } from "../../form-data";
import { ProposalForm } from "../../proposal-form";

export const metadata: Metadata = { title: "Editar propuesta" };

export default async function EditProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const proposalId = Number(id);
  if (!Number.isInteger(proposalId)) notFound();

  const [[row], companies] = await Promise.all([
    db.select().from(proposals).where(and(eq(proposals.id, proposalId), eq(proposals.organizationId, user.organizationId))),
    listProposalCompanies(user.organizationId),
  ]);
  if (!row) notFound();
  // Lo emitido es inmutable: para corregirlo se cancela y se clona.
  if (row.status !== "draft") redirect(`/proposals/${row.id}`);

  return (
    <div>
      <PageHeader title="Editar borrador" subtitle={`${row.clientName} · sin folio todavía`} />
      <ProposalForm
        companies={companies}
        initial={{
          id: row.id,
          assessmentId: row.assessmentId,
          companyId: row.companyId,
          clientName: row.clientName,
          preparedBy: row.preparedBy,
          date: row.date,
          validityDays: row.validityDays,
          productKey: row.productKey,
          planKey: row.planKey,
          billingPeriod: row.billingPeriod,
          items: row.items,
          note: row.note,
          ivaBps: row.ivaBps,
        }}
      />
    </div>
  );
}
