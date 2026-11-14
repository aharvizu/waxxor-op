import { z } from "zod";
import { getProduct, resolvePeriod } from "./catalog";
import { BILLING_PERIODS, PRODUCT_KEYS, RECURRENCES, type ProposalInput } from "./types";

/** Tope de importe por partida: evita desbordes de entero y dedazos de nueve ceros. */
const MAX_CENTS = 100_000_000_00;

const itemSchema = z.object({
  title: z.string().trim().min(1, "Cada partida necesita un concepto.").max(120, "El concepto admite hasta 120 caracteres."),
  description: z.string().trim().max(240, "La descripción admite hasta 240 caracteres."),
  quantity: z.number().min(0).max(1_000_000).nullable(),
  termLabel: z.string().trim().min(1).max(20),
  unitPriceCents: z.number().int().min(0).max(MAX_CENTS).nullable(),
  recurrence: z.enum(RECURRENCES),
  extra: z.boolean().optional(),
});

const inputSchema = z.object({
  companyId: z.number().int().positive().nullable(),
  clientName: z.string().trim().min(1, "Indica el cliente.").max(80, "El nombre del cliente admite hasta 80 caracteres."),
  preparedBy: z.string().trim().min(1, "Indica quién prepara la propuesta.").max(60),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.").refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), "Fecha inválida."),
  validityDays: z.number().int().min(1, "La vigencia mínima es 1 día.").max(365, "La vigencia máxima es 365 días."),
  productKey: z.enum(PRODUCT_KEYS),
  planKey: z.string().nullable(),
  billingPeriod: z.enum(BILLING_PERIODS).nullable(),
  items: z.array(itemSchema).min(1, "Agrega al menos una partida."),
  note: z.string().trim().max(400, "La nota admite hasta 400 caracteres."),
  ivaBps: z.number().int().min(0).max(10_000),
});

export type ValidationResult = { ok: true; data: ProposalInput } | { ok: false; errors: string[] };

/**
 * Valida la captura contra el esquema y contra las reglas del producto (spec
 * §11). Normaliza `planKey` y `billingPeriod` a lo que el producto admite, de
 * modo que lo que se guarda nunca contradice al catálogo.
 */
export function validateProposalInput(raw: unknown): ValidationResult {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, errors: [...new Set(parsed.error.issues.map((i) => i.message))] };
  }
  const data = parsed.data;
  const product = getProduct(data.productKey)!;
  const errors: string[] = [];

  const hasPlans = product.planLabel !== null;
  if (hasPlans && !product.plans.some((p) => p.key === data.planKey)) {
    errors.push(`Elige un ${product.planLabel!.toLowerCase()} válido para ${product.name}.`);
  }
  if (!hasPlans && data.planKey !== null && data.planKey !== product.defaultPlan) {
    errors.push(`${product.name} no tiene paquetes.`);
  }

  if (data.items.length > product.maxItems) {
    errors.push(`${product.name} admite hasta ${product.maxItems} partidas para caber en una hoja.`);
  }

  const period = resolvePeriod(product, data.billingPeriod);
  if (product.totalsMode === "single") {
    if (data.items.some((i) => i.recurrence !== "one_time")) {
      errors.push(`${product.name} es de pago único: ninguna partida puede ser recurrente.`);
    }
  } else if (period === "monthly" && data.items.some((i) => i.recurrence === "annual")) {
    errors.push("Una partida anual requiere que el licenciamiento de la propuesta sea anual.");
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    data: { ...data, planKey: hasPlans ? data.planKey : product.defaultPlan, billingPeriod: period },
  };
}

/** Requisitos adicionales para emitir (un borrador puede guardarse sin ellos). */
export function issueBlockers(input: Pick<ProposalInput, "items">): string[] {
  const blockers: string[] = [];
  if (!input.items.some((i) => i.unitPriceCents !== null && i.unitPriceCents > 0)) {
    blockers.push("Para emitir, al menos una partida debe tener precio.");
  }
  return blockers;
}
