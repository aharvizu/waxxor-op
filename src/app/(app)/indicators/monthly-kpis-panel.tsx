import { fmtMoney } from "@/lib/format";
import {
  categoryKpis,
  clientKpis,
  generalKpis,
  modalityKpis,
  slaMetrics,
  ticketMetrics,
  timeMetrics,
  type MetricsScope,
  type Period,
} from "@/lib/report-metrics";
import { formatMinutes } from "@/lib/time-entries";
import { Card, CardHeader, THead, Table, TBody, Td, Th, cx } from "@/components/ui";
import { Metric, NA } from "./metric";

const MODALITY_LABELS: Record<string, string> = {
  remote: "Remoto",
  onsite: "En sitio",
  not_set: "Sin especificar",
};

/**
 * Monthly KPI set migrated from the previous ticketing portal (2026-08-10) —
 * Section 1 (Generales), 4 (Por categoría) y 5 (Por tipo de atención) of the
 * requested set. Sections 2/3/6/7 (por cliente, por técnico, facturación,
 * comparativa mensual) are later phases, agreed with the user.
 */
export async function MonthlyKpisPanel({
  orgId,
  period,
  scope,
}: {
  orgId: number;
  period: Period;
  scope: MetricsScope;
}) {
  const [general, categories, modalities, sla, tickets, time, clients] = await Promise.all([
    generalKpis(orgId, period, scope),
    categoryKpis(orgId, period, scope),
    modalityKpis(orgId, period, scope),
    slaMetrics(orgId, period, scope),
    ticketMetrics(orgId, period, scope),
    timeMetrics(orgId, period, scope),
    clientKpis(orgId, period, scope),
  ]);

  const byFrequency = [...categories].sort((a, b) => b.ticketCount - a.ticketCount);
  const byHours = [...categories].sort((a, b) => b.hours - a.hours);
  const byIncome = [...categories].sort((a, b) => b.cost - a.cost);

  const hoursByModality = new Map(time.byModality.map((r) => [r.key, r.minutes]));

  // Bottom 3-column grid: top clients by load, clients with a billable
  // amount (and their share of the period's total facturable), and the
  // same category breakdown above without the ranking columns.
  const topClientsByLoad = [...clients].sort((a, b) => b.ticketCount - a.ticketCount).slice(0, 10);
  const clientsWithCharge = clients
    .filter((c) => c.cost > 0)
    .sort((a, b) => b.cost - a.cost)
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <section>
        <h3 className="mb-2 text-sm font-semibold text-fg">Generales del periodo</h3>
        <div className="flex flex-wrap gap-2">
          <Metric defKey="tickets_created" value={String(general.totalTickets)} />
          <Metric defKey="clients_attended" value={String(general.clientsAttended)} />
          <Metric defKey="technicians_active" value={String(general.techniciansActive)} />
          <Metric defKey="hours_worked" value={formatMinutes(general.hoursWorked)} />
          <Metric defKey="cost_total" value={fmtMoney(general.costTotal)} />
          <Metric defKey="avg_hours_per_ticket" value={general.avgHoursPerTicket !== null ? formatMinutes(general.avgHoursPerTicket) : NA} />
          <Metric defKey="avg_cost_per_ticket" value={general.avgCostPerTicket !== null ? fmtMoney(general.avgCostPerTicket) : NA} />
          <Metric defKey="billable_tickets" value={String(general.billableTickets)} />
          <Metric defKey="no_cost_tickets" value={String(general.noCostTickets)} />
          <Metric defKey="remote_tickets" value={String(general.remoteTickets)} />
          <Metric defKey="onsite_tickets" value={String(general.onsiteTickets)} />
          <Metric defKey="remote_pct" value={general.remotePct !== null ? `${general.remotePct}%` : NA} />
          <Metric defKey="onsite_pct" value={general.onsitePct !== null ? `${general.onsitePct}%` : NA} />
          <Metric defKey="total_facturable" value={fmtMoney(general.totalFacturable)} />
          <Metric defKey="sla_compliance" value={sla.compliancePct !== null ? `${sla.compliancePct}%` : NA} />
          <Metric defKey="sla_first_response" value={sla.firstResponsePct !== null ? `${sla.firstResponsePct}%` : NA} />
          <Metric defKey="avg_first_response" value={tickets.avgFirstResponseMinutes !== null ? formatMinutes(tickets.avgFirstResponseMinutes) : NA} />
          <Metric defKey="avg_resolution" value={tickets.avgResolutionMinutes !== null ? formatMinutes(tickets.avgResolutionMinutes) : NA} />
        </div>
      </section>

      <Card className="overflow-hidden">
        <CardHeader title="Por categoría" description="Tickets, horas y costo del periodo — ordenado por frecuencia." />
        <Table>
          <THead>
            <tr>
              <Th>Categoría</Th>
              <Th>Tickets</Th>
              <Th>Horas</Th>
              <Th>Costo</Th>
              <Th>Ranking frecuencia</Th>
              <Th>Ranking horas</Th>
              <Th>Ranking ingreso</Th>
            </tr>
          </THead>
          <tbody className="divide-y divide-edge-strong">
            {byFrequency.map((c) => (
              <tr key={c.key} className="transition-colors hover:bg-row-hover">
                <Td className="font-medium text-fg">{c.key}</Td>
                <Td className="tabular-nums text-muted">{c.ticketCount}</Td>
                <Td className="tabular-nums text-muted">{formatMinutes(c.hours)}</Td>
                <Td className="tabular-nums text-muted">{fmtMoney(c.cost)}</Td>
                <Td className="tabular-nums text-muted">#{byFrequency.findIndex((x) => x.key === c.key) + 1}</Td>
                <Td className="tabular-nums text-muted">#{byHours.findIndex((x) => x.key === c.key) + 1}</Td>
                <Td className="tabular-nums text-muted">#{byIncome.findIndex((x) => x.key === c.key) + 1}</Td>
              </tr>
            ))}
            {byFrequency.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-5 py-6 text-center text-sm text-muted">
                  Sin tickets en el periodo.
                </td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Por tipo de atención" description="Remoto vs. sitio — tickets, horas y costo del periodo." />
        <Table>
          <THead>
            <tr>
              <Th>Modalidad</Th>
              <Th>Tickets</Th>
              <Th>Horas</Th>
              <Th>Costo</Th>
            </tr>
          </THead>
          <tbody className="divide-y divide-edge-strong">
            {modalities.map((m) => (
              <tr key={m.key} className={cx("transition-colors hover:bg-row-hover", m.key === "remote" || m.key === "onsite" ? "" : "text-faint")}>
                <Td className="font-medium text-fg">{MODALITY_LABELS[m.key] ?? m.key}</Td>
                <Td className="tabular-nums text-muted">{m.ticketCount}</Td>
                <Td className="tabular-nums text-muted">{formatMinutes(hoursByModality.get(m.key) ?? 0)}</Td>
                <Td className="tabular-nums text-muted">{fmtMoney(m.cost)}</Td>
              </tr>
            ))}
            {modalities.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-center text-sm text-muted">
                  Sin tickets en el periodo.
                </td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </Card>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-fg">Resumen por cliente y categoría</h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Card className="overflow-hidden">
            <CardHeader title="Top clientes por carga" description="Por número de tickets del periodo." />
            <Table density="compact">
              <THead>
                <tr>
                  <Th>Cliente</Th>
                  <Th>Tickets</Th>
                  <Th>Horas</Th>
                  <Th>Costo</Th>
                </tr>
              </THead>
              <TBody>
                {topClientsByLoad.map((c) => (
                  <tr key={c.companyId ?? "none"}>
                    <Td className="font-medium text-fg">{c.companyName}</Td>
                    <Td className="tabular-nums text-muted">{c.ticketCount}</Td>
                    <Td className="tabular-nums text-muted">{formatMinutes(c.hours)}</Td>
                    <Td className="tabular-nums text-muted">{fmtMoney(c.cost)}</Td>
                  </tr>
                ))}
                {topClientsByLoad.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-6 text-center text-sm text-muted">
                      Sin tickets en el periodo.
                    </td>
                  </tr>
                ) : null}
              </TBody>
            </Table>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Clientes con cobro" description="Con al menos un ticket cobrable." />
            <Table density="compact">
              <THead>
                <tr>
                  <Th>Cliente</Th>
                  <Th>Cobrables</Th>
                  <Th>Total</Th>
                  <Th>% del total</Th>
                </tr>
              </THead>
              <TBody>
                {clientsWithCharge.map((c) => (
                  <tr key={c.companyId ?? "none"}>
                    <Td className="font-medium text-fg">{c.companyName}</Td>
                    <Td className="tabular-nums text-muted">{c.billableTickets}</Td>
                    <Td className="tabular-nums text-muted">{fmtMoney(c.cost)}</Td>
                    <Td className="tabular-nums text-muted">
                      {general.totalFacturable > 0 ? `${((c.cost / general.totalFacturable) * 100).toFixed(1)}%` : NA}
                    </Td>
                  </tr>
                ))}
                {clientsWithCharge.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-6 text-center text-sm text-muted">
                      Sin clientes con cobro en el periodo.
                    </td>
                  </tr>
                ) : null}
              </TBody>
            </Table>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Por categoría" description="Sin desglose de ranking — ver detalle arriba." />
            <Table density="compact">
              <THead>
                <tr>
                  <Th>Categoría</Th>
                  <Th>Tickets</Th>
                  <Th>Horas</Th>
                  <Th>Costo</Th>
                </tr>
              </THead>
              <TBody>
                {byFrequency.map((c) => (
                  <tr key={c.key}>
                    <Td className="font-medium text-fg">{c.key}</Td>
                    <Td className="tabular-nums text-muted">{c.ticketCount}</Td>
                    <Td className="tabular-nums text-muted">{formatMinutes(c.hours)}</Td>
                    <Td className="tabular-nums text-muted">{fmtMoney(c.cost)}</Td>
                  </tr>
                ))}
                {byFrequency.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-6 text-center text-sm text-muted">
                      Sin tickets en el periodo.
                    </td>
                  </tr>
                ) : null}
              </TBody>
            </Table>
          </Card>
        </div>
      </section>
    </div>
  );
}
