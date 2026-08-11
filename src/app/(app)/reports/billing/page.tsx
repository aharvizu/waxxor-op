import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { billingSupportData } from "@/lib/report-metrics";
import { ORG_TIMEZONE, PERIOD_RULES, resolvePeriod, type PeriodRule } from "@/lib/reports";
import { requireUser } from "@/lib/session";
import { formatMinutes } from "@/lib/time-entries";
import { Card, CardHeader, EmptyState, PageHeader, THead, Table, TBody, Td, Th, buttonClass, buttonSecondaryClass, cx } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";

export const metadata: Metadata = { title: "Cobros y facturación" };

const PERIOD_LABELS: Record<string, string> = {
  current_week: "Semana actual",
  previous_week: "Semana anterior",
  current_month: "Mes actual",
  previous_month: "Mes anterior",
  current_quarter: "Trimestre actual",
  previous_quarter: "Trimestre anterior",
  current_year: "Año actual",
};

/**
 * Reportes → Cobros y facturación (Pantalla 5 of the legacy KPI brief) — a
 * per-client billing-support statement, one section per client, ready to
 * print/PDF and send as backup for an invoice. Lives in Reportes (not
 * Indicadores) because it's explicitly a client-facing document — see
 * billing/print/page.tsx for the printable layout.
 */
export default async function BillingSupportPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const periodRule = (
    PERIOD_RULES.includes(params.period as PeriodRule) && params.period !== "custom" ? params.period : "current_month"
  ) as Exclude<PeriodRule, "custom">;
  const period = resolvePeriod(periodRule, ORG_TIMEZONE, new Date());

  const { clients, totals } = await billingSupportData(user.organizationId, period, {});

  return (
    <div>
      <PageHeader
        title="Cobros y facturación"
        subtitle={`${PERIOD_LABELS[periodRule]} · ${period.start} – ${period.end} · solo clientes con al menos un ticket cobrable.`}
        action={
          clients.length > 0 ? (
            <Link href={`/reports/billing/print?period=${periodRule}`} className={buttonClass} target="_blank">
              <FileText className="size-4" /> Exportar todos (PDF)
            </Link>
          ) : undefined
        }
      />

      <form method="get" className="mb-6 flex flex-wrap items-center gap-3">
        <SearchableSelect
          name="period"
          defaultValue={periodRule}
          className="w-auto"
          options={PERIOD_RULES.filter((r) => r !== "custom").map((r) => ({ value: r, label: PERIOD_LABELS[r] ?? r }))}
        />
        <button type="submit" className={buttonSecondaryClass}>Aplicar</button>
      </form>

      {clients.length === 0 ? (
        <EmptyState icon={<FileText className="size-8" />} title="Sin tickets cobrables en el periodo">
          Ningún ticket del periodo tiene un importe calculado mayor a $0.
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-4">
            <Card className="p-5">
              <div className="text-[13px] font-medium text-muted">Clientes</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{clients.length}</div>
            </Card>
            <Card className="p-5">
              <div className="text-[13px] font-medium text-muted">Tickets cobrables</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{totals.tickets}</div>
            </Card>
            <Card className="p-5">
              <div className="text-[13px] font-medium text-muted">Total a cobrar</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{fmtMoney(totals.cost)}</div>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader title="Clientes con cobro en el periodo" />
            <Table>
              <THead>
                <tr>
                  <Th>Cliente</Th>
                  <Th>Tickets</Th>
                  <Th>Horas</Th>
                  <Th>Total</Th>
                  <Th />
                </tr>
              </THead>
              <TBody striped>
                {clients.map((c) => (
                  <tr key={c.companyId ?? "none"}>
                    <Td className="font-medium text-fg">{c.companyName}</Td>
                    <Td className="tabular-nums text-muted">{c.tickets.length}</Td>
                    <Td className="tabular-nums text-muted">{formatMinutes(c.totalMinutes)}</Td>
                    <Td className="tabular-nums text-muted">{fmtMoney(c.totalCost)}</Td>
                    <Td className="text-right">
                      <Link
                        href={`/reports/billing/print?period=${periodRule}${c.companyId ? `&companyId=${c.companyId}` : ""}`}
                        target="_blank"
                        className={cx(buttonSecondaryClass, "h-8 px-3 text-xs")}
                      >
                        Exportar
                      </Link>
                    </Td>
                  </tr>
                ))}
              </TBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}
