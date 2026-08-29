"use client";

import { Fragment, useActionState, useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/format";
import type { ActionState } from "@/lib/action-result";
import type { BillingClient } from "@/lib/report-metrics";
import { useLocale } from "@/components/locale-provider";
import { t } from "@/lib/i18n";
import { Badge, Td, buttonSecondaryClass, cx, inputClass, labelClass } from "@/components/ui";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import { formatMinutes } from "@/lib/time-entries";
import { createBillingInvoiceAction, revertBillingInvoiceAction } from "./actions";

/**
 * One client row on Reportes → Cobros y facturación, expandable to show its
 * tickets grouped by invoice (each a frozen "corte") plus whatever's still
 * pending. Invoicing is per-ticket (billing_invoice_tickets), not per
 * period — a client can have several invoices in the same month.
 */
export function ClientBillingRow({ client, canManage, periodRule }: { client: BillingClient; canManage: boolean; periodRule: string }) {
  const locale = useLocale();
  const [expanded, setExpanded] = useState(false);
  return (
    <Fragment>
      <tr>
        <Td className="font-medium text-fg">
          <button type="button" onClick={() => setExpanded((v) => !v)} className="flex items-center gap-1.5 hover:text-primary">
            <ChevronRight className={cx("size-3.5 shrink-0 transition-transform", expanded && "rotate-90")} />
            {client.companyName}
          </button>
        </Td>
        <Td className="tabular-nums text-muted">{client.billableTicketCount}</Td>
        <Td className="tabular-nums text-muted">{formatMinutes(client.billableMinutes)}</Td>
        <Td className="tabular-nums text-muted">{fmtMoney(client.billableCost)}</Td>
        <Td className="tabular-nums text-muted">
          {client.invoiceGroups.length === 0
            ? "—"
            : client.invoiceGroups.length === 1
              ? t("1 factura", "1 invoice", locale)
              : t(`${client.invoiceGroups.length} facturas`, `${client.invoiceGroups.length} invoices`, locale)}
        </Td>
        <Td className="text-right">
          {client.companyId ? (
            <Link
              href={`/reports/billing/print?period=${periodRule}&companyId=${client.companyId}`}
              target="_blank"
              className={cx(buttonSecondaryClass, "h-8 px-3 text-xs")}
            >
              {t("Exportar", "Export", locale)}
            </Link>
          ) : null}
        </Td>
      </tr>
      {expanded ? (
        <tr>
          <td colSpan={6} className="border-t border-edge bg-subtle/40 p-4">
            <ClientBillingDetail client={client} canManage={canManage} />
          </td>
        </tr>
      ) : null}
    </Fragment>
  );
}

function ClientBillingDetail({ client, canManage }: { client: BillingClient; canManage: boolean }) {
  const locale = useLocale();
  return (
    <div className="space-y-4">
      {client.invoiceGroups.map((g) => (
        <div key={g.invoiceId} className="rounded-lg border border-edge bg-surface p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="green">
              {t("Factura", "Invoice", locale)} · {g.invoiceNumber}
            </Badge>
            <span className="text-xs text-muted">{fmtDateTime(g.invoicedAt)}</span>
            {g.invoicedByName ? <span className="text-xs text-faint">· {g.invoicedByName}</span> : null}
            <span className="ml-auto text-sm font-medium tabular-nums text-fg">{fmtMoney(g.cost)}</span>
            {canManage ? <RevertInvoiceButton invoiceId={g.invoiceId} /> : null}
          </div>
          <ul className="mt-2 space-y-1 text-xs text-muted">
            {g.tickets.map((ticket) => (
              <li key={ticket.ticketId} className="flex items-center gap-2">
                <span className="font-mono text-faint">{ticket.folio}</span>
                <span className="min-w-0 flex-1 truncate">{ticket.title}</span>
                <span className="tabular-nums">{fmtDate(ticket.date)}</span>
                <span className="tabular-nums">{fmtMoney(ticket.cost)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}

      {client.pendingTickets.length === 0 ? (
        client.invoiceGroups.length === 0 ? (
          <p className="text-sm text-muted">{t("Sin tickets cobrables en el periodo.", "No billable tickets in the period.", locale)}</p>
        ) : null
      ) : canManage ? (
        <PendingInvoiceForm client={client} />
      ) : (
        <div className="rounded-lg border border-dashed border-edge p-3">
          <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{t("Pendientes", "Pending", locale)}</p>
          <ul className="space-y-1 text-xs text-muted">
            {client.pendingTickets.map((ticket) => (
              <li key={ticket.ticketId} className="flex items-center gap-2">
                <span className="font-mono text-faint">{ticket.folio}</span>
                <span className="min-w-0 flex-1 truncate">{ticket.title}</span>
                <span className="tabular-nums">{fmtDate(ticket.date)}</span>
                <span className="tabular-nums">{fmtMoney(ticket.cost)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function PendingInvoiceForm({ client }: { client: BillingClient }) {
  const locale = useLocale();
  const [state, formAction] = useActionState<ActionState, FormData>(createBillingInvoiceAction, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const [selected, setSelected] = useState<Set<number>>(new Set(client.pendingTickets.map((t) => t.ticketId)));

  function toggle(ticketId: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ticketId)) next.delete(ticketId);
      else next.add(ticketId);
      return next;
    });
  }

  const selectedCount = selected.size;
  const selectedCost = client.pendingTickets.filter((t) => selected.has(t.ticketId)).reduce((acc, t) => acc + t.cost, 0);

  return (
    <form action={formAction} className="rounded-lg border border-dashed border-edge p-3">
      <input type="hidden" name="companyId" value={client.companyId ?? ""} />
      <p className="mb-2 text-xs font-semibold tracking-wide text-muted uppercase">{t("Pendientes", "Pending", locale)}</p>
      <FormAlert state={state} />
      <ul className="space-y-1.5 text-xs text-fg">
        {client.pendingTickets.map((ticket) => (
          <li key={ticket.ticketId} className="flex items-center gap-2">
            <input
              type="checkbox"
              name="ticketIds"
              value={ticket.ticketId}
              checked={selected.has(ticket.ticketId)}
              onChange={() => toggle(ticket.ticketId)}
              className="size-3.5"
            />
            <span className="font-mono text-faint">{ticket.folio}</span>
            <span className="min-w-0 flex-1 truncate">{ticket.title}</span>
            <span className="tabular-nums text-muted">{fmtDate(ticket.date)}</span>
            <span className="tabular-nums text-muted">{fmtMoney(ticket.cost)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <label htmlFor={`invoiceNumber-${client.companyId}`} className={labelClass}>
            {t("Número de factura (ERP)", "Invoice number (ERP)", locale)}
          </label>
          <input id={`invoiceNumber-${client.companyId}`} name="invoiceNumber" required className={inputClass} aria-invalid={errors.invoiceNumber ? true : undefined} />
          <FieldError errors={errors.invoiceNumber} />
        </div>
        <SubmitButton>
          {selectedCount === 1
            ? t(`Facturar 1 ticket (${fmtMoney(selectedCost)})`, `Invoice 1 ticket (${fmtMoney(selectedCost)})`, locale)
            : t(`Facturar ${selectedCount} tickets (${fmtMoney(selectedCost)})`, `Invoice ${selectedCount} tickets (${fmtMoney(selectedCost)})`, locale)}
        </SubmitButton>
      </div>
    </form>
  );
}

function RevertInvoiceButton({ invoiceId }: { invoiceId: number }) {
  const locale = useLocale();
  const [, formAction] = useActionState<ActionState, FormData>(revertBillingInvoiceAction, null);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm(t("¿Deshacer esta factura? Los tickets vuelven a pendientes.", "Undo this invoice? Its tickets go back to pending.", locale))) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <SubmitButton className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>{t("Deshacer", "Undo", locale)}</SubmitButton>
    </form>
  );
}
