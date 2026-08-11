import { Fragment } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUp } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { monthlySeries, type MetricsScope } from "@/lib/report-metrics";
import { formatMinutes } from "@/lib/time-entries";
import { BarChart, LineChart } from "@/components/charts";
import { Card, CardHeader, THead, Table, TBody, Td, Th, buttonSecondaryClass, cx } from "@/components/ui";

type MonthPoint = Awaited<ReturnType<typeof monthlySeries>>[number];

const ROWS: { label: string; get: (p: MonthPoint) => number | null; format: (v: number) => string }[] = [
  { label: "Total de tickets", get: (p) => p.totalTickets, format: (v) => String(v) },
  { label: "Clientes atendidos", get: (p) => p.clientsAttended, format: (v) => String(v) },
  { label: "Técnicos activos", get: (p) => p.techniciansActive, format: (v) => String(v) },
  { label: "Horas trabajadas", get: (p) => p.hoursWorked, format: (v) => formatMinutes(v) },
  { label: "Costo / Ingresos", get: (p) => p.costTotal, format: (v) => fmtMoney(v) },
  { label: "Tickets cobrables", get: (p) => p.billableTickets, format: (v) => String(v) },
  { label: "% tickets cobrables", get: (p) => p.billableRatePct, format: (v) => `${v}%` },
  { label: "Tickets remotos", get: (p) => p.remoteTickets, format: (v) => String(v) },
  { label: "Tickets en sitio", get: (p) => p.onsiteTickets, format: (v) => String(v) },
  { label: "Costo promedio por ticket", get: (p) => p.avgCostPerTicket, format: (v) => fmtMoney(v) },
  { label: "Horas promedio por ticket", get: (p) => p.avgHoursPerTicket, format: (v) => formatMinutes(v) },
];

const MONTH_OPTIONS = [3, 6, 12] as const;

function Delta({ prev, curr }: { prev: number | null; curr: number | null }) {
  if (prev === null || curr === null) return <span className="text-faint">—</span>;
  if (prev === 0) return <span className="text-faint">—</span>;
  const pct = ((curr - prev) / prev) * 100;
  const Icon = pct > 0 ? ArrowUp : pct < 0 ? ArrowDown : ArrowRight;
  const tone = pct > 0 ? "text-success" : pct < 0 ? "text-danger" : "text-faint";
  return (
    <span className={cx("inline-flex items-center gap-0.5 text-xs font-medium tabular-nums", tone)}>
      <Icon className="size-3" />
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

/** Pantalla 6 (Comparativa mensual) — generalKpis() run over N months, with month-over-month deltas and trend charts. */
export async function MonthlyComparisonPanel({
  orgId,
  months,
  scope,
  buildHref,
}: {
  orgId: number;
  months: number;
  scope: MetricsScope;
  buildHref: (patch: Record<string, string | undefined>) => string;
}) {
  const series = await monthlySeries(orgId, months, scope);
  const hasData = series.some((p) => p.totalTickets > 0);

  const revenueData = series.map((p) => ({ label: p.monthLabel, value: p.costTotal }));
  const ticketsData = series.map((p) => ({ label: p.monthLabel, total: p.totalTickets, cobrables: p.billableTickets }));
  const hoursData = series.map((p) => ({ label: p.monthLabel, horas: Math.round((p.hoursWorked / 60) * 10) / 10 }));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted">Ventana:</span>
        {MONTH_OPTIONS.map((m) => (
          <Link
            key={m}
            href={buildHref({ months: String(m) })}
            className={cx(
              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
              months === m ? "bg-primary-soft text-primary" : "border border-edge text-muted hover:bg-subtle hover:text-fg",
            )}
          >
            {m} meses
          </Link>
        ))}
      </div>

      {!hasData ? (
        <Card className="p-6 text-center text-sm text-muted">Sin tickets en ninguno de los meses de esta ventana.</Card>
      ) : (
        <>
          <Card className="overflow-hidden">
            <CardHeader title="Indicadores por mes" description="Cada columna Δ compara contra el mes inmediato anterior." />
            <Table density="compact">
              <THead>
                <tr>
                  <Th>Indicador</Th>
                  {series.map((p, i) => (
                    <Fragment key={p.monthKey}>
                      {i > 0 ? <Th>Δ</Th> : null}
                      <Th>{p.monthLabel}</Th>
                    </Fragment>
                  ))}
                </tr>
              </THead>
              <TBody>
                {ROWS.map((row) => (
                  <tr key={row.label}>
                    <Td className="font-medium text-fg">{row.label}</Td>
                    {series.map((p, i) => {
                      const curr = row.get(p);
                      const prev = i > 0 ? row.get(series[i - 1]) : null;
                      return (
                        <Fragment key={p.monthKey}>
                          {i > 0 ? (
                            <Td>
                              <Delta prev={prev} curr={curr} />
                            </Td>
                          ) : null}
                          <Td className="tabular-nums text-muted">{curr !== null ? row.format(curr) : "—"}</Td>
                        </Fragment>
                      );
                    })}
                  </tr>
                ))}
              </TBody>
            </Table>
          </Card>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card className="p-5">
              <CardHeader title="Ingresos por mes" className="mb-3 px-0 pt-0" />
              <LineChart data={revenueData} valueFormatter={(v) => fmtMoney(v)} />
            </Card>
            <Card className="p-5">
              <CardHeader title="Horas trabajadas por mes" className="mb-3 px-0 pt-0" />
              <BarChart
                data={hoursData}
                series={[{ key: "horas", label: "Horas", color: "primary" }]}
                valueFormatter={(v) => `${v}h`}
              />
            </Card>
            <Card className="p-5 lg:col-span-2">
              <CardHeader title="Tickets totales vs. cobrables por mes" className="mb-3 px-0 pt-0" />
              <BarChart
                data={ticketsData}
                series={[
                  { key: "total", label: "Total", color: "primary" },
                  { key: "cobrables", label: "Cobrables", color: "accent" },
                ]}
              />
            </Card>
          </div>
        </>
      )}

      <div className="flex justify-end">
        <Link href={buildHref({ view: "monthly" })} className={buttonSecondaryClass}>
          Ver detalle del mes actual
        </Link>
      </div>
    </div>
  );
}
