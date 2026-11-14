/**
 * Todo el dinero de las propuestas se guarda y se opera en CENTAVOS ENTEROS
 * (spec §4.1). Nunca float. Formateo solo al imprimir.
 */

const MXN = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

/** 27689200 → "$276,892.00" */
export function formatCents(cents: number): string {
  return MXN.format(cents / 100);
}

/**
 * Texto capturado ("1,850", "$1850.5", "1850.50") → centavos enteros, o null
 * si no es un importe válido. Se parsea como texto, sin pasar por float:
 * `1850.55 * 100` da 185054.99999999997.
 */
export function parseMoneyToCents(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

/** 185050 → "1850.50" (para precargar un input). */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2);
}
