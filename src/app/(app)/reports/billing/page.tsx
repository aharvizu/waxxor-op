import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";
import { fmtMoney } from "@/lib/format";
import { billingSupportData } from "@/lib/report-metrics";
import { ORG_TIMEZONE, PERIOD_RULES, resolvePeriod, type PeriodRule } from "@/lib/reports";
import { requireUser } from "@/lib/session";
import { formatMinutes } from "@/lib/time-entries";
import { getOrgLocale } from "@/lib/get-org-locale";
import { t, type Locale } from "@/lib/i18n";
import { Card, CardHeader, EmptyState, PageHeader, THead, Table, TBody, Td, Th, buttonClass, buttonSecondaryClass, cx } from "@/components/ui";
import { SearchableSelect } from "@/components/searchable-select";
import { InvoiceStatusCell } from "./billing-forms";

export const metadata: Metadata = { title: "Cobros y facturación" };

function getPeriodLabels(locale: Locale): Record<string, string> {
  return {
    current_week: t("Semana actual", "Current week", locale),
    previous_week: t("Semana anterior", "Previous week", locale),
    current_month: t("Mes actual", "Current month", locale),
    previous_month: t("Mes anterior", "Previous month", locale),
    current_quarter: t("Trimestre actual", "Current quarter", locale),
    previous_quarter: t("Trimestre anterior", "Previous quarter", locale),
    current_year: t("Año actual", "Current year", locale),
  };
}

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
  const locale = await getOrgLocale(user.organizationId);
  const PERIOD_LABELS = getPeriodLabels(locale);
  const params = await searchParams;
  const periodRule = (
    PERIOD_RULES.includes(params.period as PeriodRule) && params.period !== "custom" ? params.period : "current_month"
  ) as Exclude<PeriodRule, "custom">;
  const period = resolvePeriod(periodRule, ORG_TIMEZONE, new Date());

  const { clients, totals } = await billingSupportData(user.organizationId, period, {});
  const canManageInvoices = user.role === "superadmin" || user.role === "administrator";

  return (
    <div>
      <PageHeader
        title={t("Cobros y facturación", "Billing", locale)}
        subtitle={`${PERIOD_LABELS[periodRule]} · ${period.start} – ${period.end} · ${t(
          "solo clientes con al menos un ticket cobrable.",
          "only clients with at least one billable ticket.",
          locale,
        )}`}
        action={
          clients.length > 0 ? (
            <Link href={`/reports/billing/print?period=${periodRule}`} className={buttonClass} target="_blank">
              <FileText className="size-4" /> {t("Exportar todos (PDF)", "Export all (PDF)", locale)}
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
        <button type="submit" className={buttonSecondaryClass}>{t("Aplicar", "Apply", locale)}</button>
      </form>

      {clients.length === 0 ? (
        <EmptyState icon={<FileText className="size-8" />} title={t("Sin tickets cobrables en el periodo", "No billable tickets in the period", locale)}>
          {t("Ningún ticket del periodo tiene un importe calculado mayor a $0.", "No ticket in the period has a calculated amount greater than $0.", locale)}
        </EmptyState>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-4">
            <Card className="p-5">
              <div className="text-[13px] font-medium text-muted">{t("Clientes", "Clients", locale)}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{clients.length}</div>
            </Card>
            <Card className="p-5">
              <div className="text-[13px] font-medium text-muted">{t("Tickets cobrables", "Billable tickets", locale)}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{totals.tickets}</div>
            </Card>
            <Card className="p-5">
              <div className="text-[13px] font-medium text-muted">{t("Total a cobrar", "Total to bill", locale)}</div>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{fmtMoney(totals.cost)}</div>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader title={t("Clientes con cobro en el periodo", "Clients billed in the period", locale)} />
            <Table>
              <THead>
                <tr>
                  <Th>{t("Cliente", "Client", locale)}</Th>
                  <Th>{t("Tickets", "Tickets", locale)}</Th>
                  <Th>{t("Horas", "Hours", locale)}</Th>
                  <Th>{t("Total", "Total", locale)}</Th>
                  <Th>{t("Factura", "Invoice", locale)}</Th>
                  <Th />
                </tr>
              </THead>
              <TBody striped>
                {clients.map((c) => (
                  <tr key={c.companyId ?? "none"}>
                    <Td className="font-medium text-fg">{c.companyName}</Td>
                    <Td className="tabular-nums text-muted">{c.billableTicketCount}</Td>
                    <Td className="tabular-nums text-muted">{formatMinutes(c.billableMinutes)}</Td>
                    <Td className="tabular-nums text-muted">{fmtMoney(c.billableCost)}</Td>
                    <Td>
                      {c.companyId ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <InvoiceStatusCell
                            companyId={c.companyId}
                            companyName={c.companyName}
                            periodStart={period.start}
                            periodEnd={period.end}
                            status={c.invoiceStatus}
                            canManage={canManageInvoices}
                          />
                          {c.invoiceStatus?.invoicedAt && c.pendingTickets.length > 0 ? (
                            <span className="text-xs text-amber-700 dark:text-amber-400">
                              {t(
                                `+${c.pendingTickets.length} nuevo(s) sin facturar`,
                                `+${c.pendingTickets.length} new, not yet invoiced`,
                                locale,
                              )}
                            </span>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </Td>
                    <Td className="text-right">
                      <Link
                        href={`/reports/billing/print?period=${periodRule}${c.companyId ? `&companyId=${c.companyId}` : ""}`}
                        target="_blank"
                        className={cx(buttonSecondaryClass, "h-8 px-3 text-xs")}
                      >
                        {t("Exportar", "Export", locale)}
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
