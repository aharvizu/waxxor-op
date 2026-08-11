import { fmtMoney } from "@/lib/format";
import { technicianKpis, type MetricsScope, type Period } from "@/lib/report-metrics";
import { formatMinutes } from "@/lib/time-entries";
import { Card, CardHeader, THead, Table, Td, Th } from "@/components/ui";

/** Pantalla 2 (Técnicos) of the legacy KPI brief — carga, distribución remoto/sitio y especialización. */
export async function TechniciansPanel({
  orgId,
  period,
  scope,
}: {
  orgId: number;
  period: Period;
  scope: MetricsScope;
}) {
  const { summary, topCategories } = await technicianKpis(orgId, period, scope);

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden">
        <CardHeader title="Carga por técnico" description="Tickets, horas y costo generado en el periodo." />
        <Table>
          <THead>
            <tr>
              <Th>Técnico</Th>
              <Th>Tickets</Th>
              <Th>Horas totales</Th>
              <Th>Prom. h/ticket</Th>
              <Th>Costo generado</Th>
            </tr>
          </THead>
          <tbody className="divide-y divide-edge-strong">
            {summary.map((r) => (
              <tr key={r.assigneeId ?? "none"} className="transition-colors hover:bg-row-hover">
                <Td className="font-medium text-fg">{r.assigneeName}</Td>
                <Td className="tabular-nums text-muted">{r.ticketCount}</Td>
                <Td className="tabular-nums text-muted">{formatMinutes(r.hours)}</Td>
                <Td className="tabular-nums text-muted">{r.avgHoursPerTicket !== null ? formatMinutes(r.avgHoursPerTicket) : "—"}</Td>
                <Td className="tabular-nums text-muted">{fmtMoney(r.cost)}</Td>
              </tr>
            ))}
            {summary.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-sm text-muted">
                  Sin tickets en el periodo.
                </td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Remoto vs. sitio por técnico" />
        <Table>
          <THead>
            <tr>
              <Th>Técnico</Th>
              <Th>Remoto (tickets)</Th>
              <Th>Remoto (horas)</Th>
              <Th>Sitio (tickets)</Th>
              <Th>Sitio (horas)</Th>
            </tr>
          </THead>
          <tbody className="divide-y divide-edge-strong">
            {summary.map((r) => (
              <tr key={r.assigneeId ?? "none"} className="transition-colors hover:bg-row-hover">
                <Td className="font-medium text-fg">{r.assigneeName}</Td>
                <Td className="tabular-nums text-muted">{r.remoteTickets}</Td>
                <Td className="tabular-nums text-muted">{formatMinutes(r.remoteHours)}</Td>
                <Td className="tabular-nums text-muted">{r.onsiteTickets}</Td>
                <Td className="tabular-nums text-muted">{formatMinutes(r.onsiteHours)}</Td>
              </tr>
            ))}
            {summary.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-6 text-center text-sm text-muted">
                  Sin tickets en el periodo.
                </td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader title="Categorías por técnico" description="Top 5 categorías por número de tickets, por técnico." />
        <Table>
          <THead>
            <tr>
              <Th>Técnico</Th>
              <Th>Categoría</Th>
              <Th>Tickets</Th>
              <Th>Horas</Th>
            </tr>
          </THead>
          <tbody className="divide-y divide-edge-strong">
            {topCategories.map((r, i) => (
              <tr key={`${r.assigneeName}-${r.category}-${i}`} className="transition-colors hover:bg-row-hover">
                <Td className="font-medium text-fg">{r.assigneeName}</Td>
                <Td className="text-muted">{r.category}</Td>
                <Td className="tabular-nums text-muted">{r.ticketCount}</Td>
                <Td className="tabular-nums text-muted">{formatMinutes(r.hours)}</Td>
              </tr>
            ))}
            {topCategories.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-center text-sm text-muted">
                  Sin tickets en el periodo.
                </td>
              </tr>
            ) : null}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}
