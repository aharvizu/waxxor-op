import { fmtMoney } from "@/lib/format";
import { clientKpis, type MetricsScope, type Period } from "@/lib/report-metrics";
import { formatMinutes } from "@/lib/time-entries";
import { Card, CardHeader, THead, Table, Td, Th } from "@/components/ui";

/** Pantalla 3 (Clientes) of the legacy KPI brief — one row per client, full period breakdown. */
export async function ClientsPanel({
  orgId,
  period,
  scope,
}: {
  orgId: number;
  period: Period;
  scope: MetricsScope;
}) {
  const rows = await clientKpis(orgId, period, scope);

  return (
    <Card className="overflow-hidden">
      <CardHeader title="Clientes" description="Comportamiento de cada cliente en el periodo — volumen, costo, categoría y técnico principal." />
      <Table>
        <THead>
          <tr>
            <Th>Cliente</Th>
            <Th>Tickets</Th>
            <Th>Horas</Th>
            <Th>Costo</Th>
            <Th>Cobrables</Th>
            <Th>Sin costo</Th>
            <Th>Categoría principal</Th>
            <Th>Técnico principal</Th>
          </tr>
        </THead>
        <tbody className="divide-y divide-edge-strong">
          {rows.map((r) => (
            <tr key={r.companyId ?? "none"} className="transition-colors hover:bg-row-hover">
              <Td className="font-medium text-fg">{r.companyName}</Td>
              <Td className="tabular-nums text-muted">{r.ticketCount}</Td>
              <Td className="tabular-nums text-muted">{formatMinutes(r.hours)}</Td>
              <Td className="tabular-nums text-muted">{fmtMoney(r.cost)}</Td>
              <Td className="tabular-nums text-muted">{r.billableTickets}</Td>
              <Td className="tabular-nums text-muted">{r.noCostTickets}</Td>
              <Td className="text-muted">{r.topCategory}</Td>
              <Td className="text-muted">{r.topAssignee}</Td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-5 py-6 text-center text-sm text-muted">
                Sin tickets en el periodo.
              </td>
            </tr>
          ) : null}
        </tbody>
      </Table>
    </Card>
  );
}
