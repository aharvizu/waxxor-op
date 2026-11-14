import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { ORG_TIMEZONE } from "@/lib/reports";
import { requireUser } from "@/lib/session";
import { listProposalCompanies } from "../../proposals/form-data";
import { AssessmentForm } from "../assessment-form";

export const metadata: Metadata = { title: "Nuevo levantamiento" };

export default async function NewAssessmentPage({ searchParams }: { searchParams: Promise<{ companyId?: string }> }) {
  const user = await requireUser();
  const params = await searchParams;
  const companies = await listProposalCompanies(user.organizationId);
  const company = companies.find((c) => String(c.id) === params.companyId) ?? null;

  return (
    <div>
      <PageHeader
        title="Nuevo levantamiento"
        subtitle="Análisis básico del entorno del cliente. Nada es obligatorio: guarda lo que tengas y complétalo después."
      />
      <AssessmentForm
        companies={companies}
        initial={{
          id: null,
          companyId: company?.id ?? null,
          clientName: company?.name ?? "",
          contactName: "",
          contactEmail: "",
          contactPhone: "",
          conductedOn: new Intl.DateTimeFormat("en-CA", { timeZone: ORG_TIMEZONE }).format(new Date()),
          status: "draft",
          notes: "",
          answers: {},
        }}
      />
    </div>
  );
}
