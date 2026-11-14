import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, ilike, type SQL } from "drizzle-orm";
import { FileSearch, Plus } from "lucide-react";
import { db } from "@/db";
import { assessments } from "@/db/schema";
import { Badge, Card, EmptyState, PageHeader, THead, Table, Td, Th, buttonClass, cx, inputClass } from "@/components/ui";
import { ALL_QUESTIONS, answeredCount } from "@/lib/assessments/questionnaire";
import { deriveOpportunities } from "@/lib/assessments/recommendations";
import { fmtDate } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Levantamientos" };

/**
 * Levantamientos (Sales): la base de conocimiento del entorno de cada cliente
 * o prospecto y el punto de partida de sus propuestas.
 * Ver docs/features/assessments.md.
 */
export default async function AssessmentsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const q = ((await searchParams).q ?? "").trim();
  const conditions: SQL[] = [eq(assessments.organizationId, user.organizationId)];
  if (q) conditions.push(ilike(assessments.clientName, `%${q}%`));

  const rows = await db
    .select()
    .from(assessments)
    .where(and(...conditions))
    .orderBy(desc(assessments.conductedOn), desc(assessments.id))
    .limit(200);

  return (
    <div>
      <PageHeader
        title="Levantamientos"
        subtitle="Análisis básico del entorno de cada cliente: la información para generar propuestas."
        action={
          <Link href="/assessments/new" className={buttonClass}>
            <Plus /> Nuevo levantamiento
          </Link>
        }
      />

      <form method="get" className="mb-4">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Buscar empresa o prospecto…"
          aria-label="Buscar empresa o prospecto"
          className={cx(inputClass, "h-8 w-64 text-xs")}
        />
      </form>

      {rows.length === 0 ? (
        <EmptyState icon={<FileSearch />} title={q ? "Sin resultados" : "Aún no hay levantamientos"}>
          {q
            ? "Ningún levantamiento coincide con la búsqueda."
            : "Registra el primero: dominios, correo, protección de equipos, respaldos y capacitación, en una sola visita."}
        </EmptyState>
      ) : (
        <Card>
          <Table>
            <THead>
              <tr>
                <Th>Empresa o prospecto</Th>
                <Th>Fecha</Th>
                <Th>Estado</Th>
                <Th>Avance</Th>
                <Th>Oportunidades</Th>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => {
                const opportunities = deriveOpportunities(r.answers);
                return (
                  <tr key={r.id} className="border-t border-edge">
                    <Td>
                      <Link href={`/assessments/${r.id}`} className="font-medium text-primary hover:underline">
                        {r.clientName}
                      </Link>
                      {r.companyId === null ? <span className="ml-2 text-xs text-faint">prospecto</span> : null}
                    </Td>
                    <Td className="tabular-nums">{fmtDate(r.conductedOn)}</Td>
                    <Td>
                      <Badge tone={r.status === "completed" ? "green" : "amber"}>{r.status === "completed" ? "Completado" : "En proceso"}</Badge>
                    </Td>
                    <Td className="tabular-nums text-muted">
                      {answeredCount(r.answers)} / {ALL_QUESTIONS.length}
                    </Td>
                    <Td className="text-muted">{opportunities.length === 0 ? "—" : opportunities.map((o) => o.title).join(" · ")}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
