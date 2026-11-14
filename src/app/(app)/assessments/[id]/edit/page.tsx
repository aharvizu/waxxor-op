import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { assessments } from "@/db/schema";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/session";
import { listProposalCompanies } from "../../../proposals/form-data";
import { AssessmentForm } from "../../assessment-form";

export const metadata: Metadata = { title: "Editar levantamiento" };

export default async function EditAssessmentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const assessmentId = Number(id);
  if (!Number.isInteger(assessmentId)) notFound();

  const [[row], companies] = await Promise.all([
    db.select().from(assessments).where(and(eq(assessments.id, assessmentId), eq(assessments.organizationId, user.organizationId))),
    listProposalCompanies(user.organizationId),
  ]);
  if (!row) notFound();

  return (
    <div>
      <PageHeader title="Editar levantamiento" subtitle={row.clientName} />
      <AssessmentForm
        companies={companies}
        initial={{
          id: row.id,
          companyId: row.companyId,
          clientName: row.clientName,
          contactName: row.contactName ?? "",
          contactEmail: row.contactEmail ?? "",
          contactPhone: row.contactPhone ?? "",
          conductedOn: row.conductedOn,
          status: row.status,
          notes: row.notes ?? "",
          answers: row.answers,
        }}
      />
    </div>
  );
}
