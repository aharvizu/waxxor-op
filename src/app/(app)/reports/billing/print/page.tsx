import type { Metadata } from "next";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizations } from "@/db/schema";
import { fmtDate, fmtMoney } from "@/lib/format";
import { billingSupportData } from "@/lib/report-metrics";
import { ORG_TIMEZONE, PERIOD_RULES, resolvePeriod, type PeriodRule } from "@/lib/reports";
import { requireUser } from "@/lib/session";
import { getSetting } from "@/lib/settings-data";
import { formatMinutes } from "@/lib/time-entries";
import { getBillingInvoiceStatuses } from "@/lib/billing-invoices";
import { getOrgLocale } from "@/lib/get-org-locale";
import { t, type Locale } from "@/lib/i18n";
import { PrintButton } from "@/components/print-button";

export const metadata: Metadata = { title: "Cobros y facturación — PDF" };

function getModalityLabels(locale: Locale): Record<string, string> {
  return {
    remote: t("Remoto", "Remote", locale),
    onsite: t("Sitio", "On-site", locale),
    fixed_price: t("Precio fijo", "Fixed price", locale),
    not_applicable: "—",
  };
}

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
 * Printable billing-support statement (Reportes → Cobros y facturación →
 * Exportar) — same browser-print mechanism as reports/[id]/print (no PDF
 * library, documented decision). One section per client with a page break
 * after each (except the last); ?companyId= renders just that one client,
 * which is how the per-client "export just this client" button works —
 * same page, filtered data, no separate route needed.
 */
export default async function BillingSupportPrintPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; companyId?: string }>;
}) {
  const user = await requireUser();
  const locale = await getOrgLocale(user.organizationId);
  const MODALITY_LABELS = getModalityLabels(locale);
  const PERIOD_LABELS = getPeriodLabels(locale);
  const params = await searchParams;
  const periodRule = (
    PERIOD_RULES.includes(params.period as PeriodRule) && params.period !== "custom" ? params.period : "current_month"
  ) as Exclude<PeriodRule, "custom">;
  const period = resolvePeriod(periodRule, ORG_TIMEZONE, new Date());
  const companyId = params.companyId ? Number(params.companyId) : null;

  const [{ clients, totals }, branding, profile, [org]] = await Promise.all([
    billingSupportData(user.organizationId, period, { companyId }),
    getSetting(user.organizationId, "reports.branding"),
    getSetting(user.organizationId, "organization.profile"),
    db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, user.organizationId)),
  ]);
  // reports.branding.logo (dedicated report branding) wins when set;
  // otherwise fall back to the org's general profile logo (Settings → General)
  // so a logo already uploaded there doesn't need to be duplicated here.
  const logo = branding.logo ?? profile.logo;
  const invoiceStatuses = await getBillingInvoiceStatuses(
    user.organizationId,
    period.start,
    period.end,
    clients.map((c) => c.companyId).filter((id) => id !== null),
  );

  const orgName = org?.name ?? "Waxxor";
  const periodLabel = `${PERIOD_LABELS[periodRule] ?? periodRule} (${period.start} – ${period.end})`;

  return (
    <div className="mx-auto max-w-[720px] bg-white p-10 text-slate-900 print:p-0">
      <div className="mb-6 flex justify-end print:hidden">
        <PrintButton />
      </div>

      {clients.length === 0 ? (
        <p className="text-sm text-slate-600">
          {t("Sin tickets cobrables en el periodo seleccionado.", "No billable tickets in the selected period.", locale)}
        </p>
      ) : (
        clients.map((client, i) => (
          <section key={client.companyId ?? "none"} style={i < clients.length - 1 ? { pageBreakAfter: "always" } : undefined}>
            <header className="mb-6 border-b-4 border-slate-900 pb-4">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt={orgName} className="mb-3 h-10 w-auto" />
              ) : null}
              <p className="text-xs font-semibold tracking-[0.2em] text-slate-500 uppercase">
                {branding.coverSubtitle || t("Seguridad Informática", "IT Security", locale)}
              </p>
              <h1 className="mt-2 text-2xl font-bold">{t("Soporte de facturación", "Billing statement", locale)}</h1>
              <div className="mt-3 flex items-end justify-between">
                <div className="text-sm text-slate-700">
                  <p>{t("Cliente", "Client", locale)}: <strong>{client.companyName}</strong></p>
                  <p>{t("Periodo", "Period", locale)}: <strong>{periodLabel}</strong></p>
                  {client.companyId && invoiceStatuses.get(client.companyId)?.invoicedAt ? (
                    <p>{t("Factura", "Invoice", locale)}: <strong>{invoiceStatuses.get(client.companyId)?.invoiceNumber}</strong></p>
                  ) : null}
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500 uppercase">{t("Total a cobrar", "Total to bill", locale)}</p>
                  <p className="text-2xl font-bold tabular-nums">{fmtMoney(client.totalCost)}</p>
                </div>
              </div>
            </header>

            <table className="w-full border-collapse text-sm">
              <thead style={{ display: "table-header-group" }}>
                <tr className="border-b-2 border-slate-900 text-left text-xs font-semibold tracking-wide text-slate-600 uppercase">
                  <th className="py-2 pr-2">{t("Ticket", "Ticket", locale)}</th>
                  <th className="py-2 pr-2">{t("Fecha", "Date", locale)}</th>
                  <th className="py-2 pr-2">{t("Servicio", "Service", locale)}</th>
                  <th className="py-2 pr-2">{t("Técnico", "Technician", locale)}</th>
                  <th className="py-2 pr-2">{t("Tipo", "Type", locale)}</th>
                  <th className="py-2 pr-2 text-right">{t("Horas", "Hours", locale)}</th>
                  <th className="py-2 text-right">{t("Costo", "Cost", locale)}</th>
                </tr>
              </thead>
              <tbody>
                {client.tickets.map((t) => (
                  <tr key={t.ticketId} className="border-b border-slate-200 align-top">
                    <td className="py-2 pr-2 font-mono text-xs">{t.folio}</td>
                    <td className="py-2 pr-2 tabular-nums">{fmtDate(t.date)}</td>
                    <td className="py-2 pr-2">{t.title}</td>
                    <td className="py-2 pr-2">{t.technicianName}</td>
                    <td className="py-2 pr-2">{MODALITY_LABELS[t.modality] ?? t.modality}</td>
                    <td className="py-2 pr-2 text-right tabular-nums">{formatMinutes(t.minutes)}</td>
                    <td className="py-2 text-right tabular-nums">{fmtMoney(t.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-6">
              <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-600 uppercase">
                {t("Detalle del servicio", "Service detail", locale)}
              </h2>
              <ul className="space-y-1.5 text-xs leading-relaxed text-slate-700">
                {client.tickets.map((ticket) => (
                  <li key={ticket.ticketId}>
                    <span className="font-mono font-medium">{ticket.folio}</span> —{" "}
                    {ticket.comment?.trim() || t("Sin descripción registrada.", "No description recorded.", locale)}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-8 flex items-center justify-between border-t border-slate-300 pt-3 text-sm text-slate-700">
              <span>
                {client.tickets.length} {t("servicio(s)", "service(s)", locale)} · {formatMinutes(client.totalMinutes)}
              </span>
              <span className="font-semibold">{fmtMoney(client.totalCost)}</span>
            </div>

            <div className="mt-16 grid grid-cols-2 gap-12 text-center text-xs text-slate-600">
              <div>
                <div className="border-t border-slate-400 pt-2">{t("Firma del cliente", "Client signature", locale)}</div>
              </div>
              <div>
                <div className="border-t border-slate-400 pt-2">
                  {t("Firma / sello", "Signature / stamp", locale)} {orgName}
                </div>
              </div>
            </div>
          </section>
        ))
      )}

      {clients.length > 1 ? (
        <footer className="mt-12 border-t-2 border-slate-900 pt-4 text-sm text-slate-700">
          <p className="font-semibold">
            {t("Total general del periodo", "Grand total for the period", locale)} ({periodLabel})
          </p>
          <p className="mt-1 tabular-nums">
            {clients.length} {t("cliente(s)", "client(s)", locale)} · {totals.tickets} {t("ticket(s) cobrable(s)", "billable ticket(s)", locale)} ·{" "}
            {formatMinutes(totals.minutes)} · <span className="font-bold">{fmtMoney(totals.cost)}</span>
          </p>
        </footer>
      ) : null}
    </div>
  );
}
