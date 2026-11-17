import { RECURRENCES, type MoneyColumn, type ProposalItem, type ProposalTotals, type Recurrence } from "./types";

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
 * Totales por recurrencia (spec §4.1): pago único, mensual y anual, cada uno
 * en su columna y con su IVA redondeado por separado.
 *
 * No existe un "gran total" ni conversiones entre columnas: un pago, un pago
 * por mes y un pago por año son unidades distintas. Una partida mensual se
 * queda en la mensualidad aunque la propuesta tenga licencias anuales (antes
 * se multiplicaba ×12 dentro de la anualidad; cambiado 2026-11-17 a pedido
 * del dueño: cada tipo de pago se identifica por separado).
 */
export function computeTotals(items: readonly ProposalItem[], ivaBps: number): ProposalTotals {
  const sums: Record<Recurrence, number> = { one_time: 0, monthly: 0, annual: 0 };
  for (const item of items) {
    const amount = itemAmountCents(item);
    if (amount !== null) sums[item.recurrence] += amount;
  }
  return {
    one_time: column(sums.one_time, ivaBps),
    monthly: column(sums.monthly, ivaBps),
    annual: column(sums.annual, ivaBps),
  };
}

/**
 * Recurrencias que tienen al menos una partida, en orden de documento
 * (único, mensual, anual). Son las columnas que se muestran — una partida
 * "No Incluido" cuenta: el cliente debe ver que ese periodo existe.
 */
export function presentRecurrences(items: readonly Pick<ProposalItem, "recurrence">[]): Recurrence[] {
  return RECURRENCES.filter((r) => items.some((i) => i.recurrence === r));
}

/** Encabezado y etiqueta de total de cada columna. */
export const COLUMN_LABELS: Record<Recurrence, { header: string; totalLabel: string }> = {
  one_time: { header: "Pago único", totalLabel: "Total" },
  monthly: { header: "Mensualidad", totalLabel: "Por mes" },
  annual: { header: "Anualidad", totalLabel: "Por año" },
};
