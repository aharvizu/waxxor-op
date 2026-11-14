import type { EffectiveProposalStatus, ProposalStatus } from "./types";

/**
 * Ciclo de vida (spec §6). `expired` no se guarda: una propuesta emitida cuya
 * vigencia pasó se MUESTRA como vencida y se le aplican las transiciones de
 * vencida, sin job diario que mantenga el estado sincronizado — el mismo
 * patrón de estados derivados de contratos y servicios.
 *
 * Una propuesta emitida es inmutable: para corregirla se cancela y se clona
 * en un borrador nuevo, que tomará otro folio. Un folio nunca se reutiliza.
 */
const TRANSITIONS: Record<EffectiveProposalStatus, ProposalStatus[]> = {
  draft: ["issued"],
  issued: ["accepted", "rejected", "cancelled"],
  expired: ["accepted", "cancelled"],
  accepted: [],
  rejected: ["cancelled"],
  cancelled: [],
};

/** Estado que se muestra y contra el que se validan las transiciones. `today` y `expiresAt` son YYYY-MM-DD. */
export function effectiveStatus(
  status: ProposalStatus,
  expiresAt: string | null,
  today: string,
): EffectiveProposalStatus {
  return status === "issued" && expiresAt !== null && expiresAt < today ? "expired" : status;
}

export function canTransition(from: EffectiveProposalStatus, to: ProposalStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: EffectiveProposalStatus): ProposalStatus[] {
  return TRANSITIONS[from];
}

/** `fecha + vigenciaDias`, en aritmética de calendario (sin husos). */
export function expiryDate(date: string, validityDays: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + validityDays);
  return d.toISOString().slice(0, 10);
}

/** WX-2026-0001: serie, año de emisión, consecutivo a 4 dígitos que reinicia cada año (spec §5.1). */
export function composeFolio(series: string, year: number, sequence: number): string {
  return `${series}-${year}-${String(sequence).padStart(4, "0")}`;
}
