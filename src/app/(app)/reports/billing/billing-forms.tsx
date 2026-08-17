"use client";

import { useActionState, useEffect, useState } from "react";
import { fmtDate } from "@/lib/format";
import type { ActionState } from "@/lib/action-result";
import type { BillingInvoiceStatus } from "@/lib/billing-invoices";
import { Badge, buttonSecondaryClass, cx, inputClass, labelClass } from "@/components/ui";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { Modal } from "@/components/modal";
import { SubmitButton } from "@/components/submit-button";
import { markBillingInvoiced, markBillingPending } from "./actions";

function MarkInvoicedForm({
  companyId,
  periodStart,
  periodEnd,
  onSuccess,
}: {
  companyId: number;
  periodStart: string;
  periodEnd: string;
  onSuccess?: () => void;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(markBillingInvoiced, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};

  useEffect(() => {
    if (state?.ok) onSuccess?.();
  }, [state, onSuccess]);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="periodStart" value={periodStart} />
      <input type="hidden" name="periodEnd" value={periodEnd} />
      <FormAlert state={state} />
      <div>
        <label htmlFor="invoiceNumber" className={labelClass}>
          Número de factura (ERP)
        </label>
        <input
          id="invoiceNumber"
          name="invoiceNumber"
          required
          autoFocus
          aria-invalid={errors.invoiceNumber ? true : undefined}
          className={inputClass}
        />
        <FieldError errors={errors.invoiceNumber} />
      </div>
      <SubmitButton>Guardar</SubmitButton>
    </form>
  );
}

function MarkInvoicedModal({
  companyId,
  companyName,
  periodStart,
  periodEnd,
}: {
  companyId: number;
  companyName: string;
  periodStart: string;
  periodEnd: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx(buttonSecondaryClass, "h-8 px-3 text-xs")}>
        Marcar como facturado
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Marcar como facturado"
        description={`${companyName} · ${fmtDate(periodStart)} – ${fmtDate(periodEnd)}`}
      >
        <MarkInvoicedForm companyId={companyId} periodStart={periodStart} periodEnd={periodEnd} onSuccess={() => setOpen(false)} />
      </Modal>
    </>
  );
}

function MarkPendingButton({ companyId, periodStart, periodEnd }: { companyId: number; periodStart: string; periodEnd: string }) {
  const [, formAction] = useActionState<ActionState, FormData>(markBillingPending, null);
  return (
    <form action={formAction}>
      <input type="hidden" name="companyId" value={companyId} />
      <input type="hidden" name="periodStart" value={periodStart} />
      <input type="hidden" name="periodEnd" value={periodEnd} />
      <SubmitButton className="h-8 px-3 text-xs">Quitar</SubmitButton>
    </form>
  );
}

/**
 * Invoiced-state cell for one client row on Reportes → Cobros y facturación.
 * Read-only badge for everyone; superadmin/administrator additionally get the
 * mark/unmark controls (server-enforced in actions.ts — this is UX only).
 */
export function InvoiceStatusCell({
  companyId,
  companyName,
  periodStart,
  periodEnd,
  status,
  canManage,
}: {
  companyId: number;
  companyName: string;
  periodStart: string;
  periodEnd: string;
  status: BillingInvoiceStatus | undefined;
  canManage: boolean;
}) {
  if (status?.invoicedAt) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone="green">Facturado · {status.invoiceNumber}</Badge>
        {canManage ? <MarkPendingButton companyId={companyId} periodStart={periodStart} periodEnd={periodEnd} /> : null}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge tone="slate">Pendiente</Badge>
      {canManage ? (
        <MarkInvoicedModal companyId={companyId} companyName={companyName} periodStart={periodStart} periodEnd={periodEnd} />
      ) : null}
    </div>
  );
}
