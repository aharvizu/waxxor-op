import type { BillingPeriod, MoneyColumn, ProposalItem, ProposalTotals } from "./types";

/** Importe de una partida; null = "No Incluido" (no suma). La cantidad nula multiplica por 1. */
export function itemAmountCents(item: Pick<ProposalItem, "quantity" | "unitPriceCents">): number | null {
  if (item.unitPriceCents === null) return null;
  // La cantidad admite decimales (2.5 TB); el resultado se redondea al centavo.
  return Math.round((item.quantity ?? 1) * item.unitPriceCents);
}

function column(subtotalCents: number, ivaBps: number): MoneyColumn {
  const ivaCents = Math.round((subtotalCents * ivaBps) / 10_000);
  return { subtotalCents, ivaCents, totalCents: subtotalCents + ivaCents };
}

/**
 * Totales por recurrencia (spec §4.1). El IVA se redondea POR COLUMNA.
 *
 * No existe un "gran total": la columna única y la recurrente son unidades
 * distintas (un pago contra un pago por periodo) y sumarlas da una cifra que
 * no significa nada.
 *
 * Con periodo anual (plantilla de Microsoft 365) la columna recurrente es la
 * anualidad: una partida mensual aporta doce meses y una anual aporta una
 * vez. Con periodo mensual, o en totales simples (`period` null), una partida
 * anual no tiene columna donde caer — la validación la rechaza antes; aquí
 * cae al pago único, que es lo que hacía la plantilla.
 */
export function computeTotals(
  items: readonly ProposalItem[],
  ivaBps: number,
  period: BillingPeriod | null,
): ProposalTotals {
  let oneTime = 0;
  let recurring = 0;
  for (const item of items) {
    const amount = itemAmountCents(item);
    if (amount === null) continue;
    if (period === "annual" && item.recurrence === "monthly") recurring += amount * 12;
    else if (period === "annual" && item.recurrence === "annual") recurring += amount;
    else if (period === "monthly" && item.recurrence === "monthly") recurring += amount;
    else oneTime += amount;
  }
  return { oneTime: column(oneTime, ivaBps), recurring: column(recurring, ivaBps) };
}
