import { computeTotals } from "./calc";
import {
  ACCEPTANCE_HTML,
  FOOTER,
  SIGNATURE_LABEL,
  TERMS_ACCEPTANCE_SHORT_HTML,
  getPlan,
  getProduct,
  resolvePeriod,
  type LogoKey,
} from "./catalog";
import { MICROSOFT365_LOGO, MSP360_LOGO, WASABI_LOGO, WAXXOR_LOGO } from "./logos";
import type { ProposalDocument, ProposalInput } from "./types";

const LOGOS: Record<LogoKey, string> = {
  msp360: MSP360_LOGO,
  wasabi: WASABI_LOGO,
  microsoft365: MICROSOFT365_LOGO,
};

/** 2026-11-14 → "14 / 11 / 2026", el formato de la franja de datos de las plantillas. */
export function formatDocumentDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d} / ${m} / ${y}`;
}

/**
 * Construye el documento desde el CATÁLOGO VIGENTE. Se usa para dibujar un
 * borrador y, al emitir, para producir el snapshot que se congela. Una
 * propuesta ya emitida nunca pasa por aquí: se dibuja desde su snapshot
 * (spec §7), así que un cambio de catálogo no la altera.
 *
 * Solo servidor: importa los logotipos.
 */
export function buildDocument(
  input: ProposalInput,
  issued: { folio: string; issuedAt: string } | null,
): ProposalDocument {
  const product = getProduct(input.productKey);
  if (!product) throw new Error(`Producto desconocido: ${input.productKey}`);
  const plan = getPlan(product, input.planKey);
  const period = resolvePeriod(product, input.billingPeriod);
  const ctx = { planKey: plan.key, period, validityDays: input.validityDays };
  const totals = computeTotals(input.items, input.ivaBps, period);

  return {
    version: 1,
    folio: issued?.folio ?? null,
    issuedAt: issued?.issuedAt ?? null,
    productKey: product.key,
    productName: product.planLabel ? plan.name : product.name,
    layout: product.layout,
    brandColor: product.brandColor,
    header: {
      clientName: input.clientName,
      preparedBy: input.preparedBy,
      dateLabel: formatDocumentDate(input.date),
      validityLabel: `${input.validityDays} días naturales`,
    },
    waxxorLogo: WAXXOR_LOGO,
    partner: {
      labelHtml: product.partnerLabelHtml,
      marks: product.partnerMarks.map((m) =>
        m.kind === "logo"
          ? { kind: "image" as const, dataUri: LOGOS[m.logo], height: m.height, alt: m.alt }
          : { kind: "text" as const, name: m.name, sub: m.sub },
      ),
    },
    hero: plan.hero,
    capabilities: plan.capabilities,
    panel: plan.panel,
    comparison: product.comparison ? { ...product.comparison, selected: plan.key } : null,
    quantityHeader: product.quantityHeader,
    items: input.items,
    note: input.note,
    totals: {
      mode: product.totalsMode,
      oneTime: totals.oneTime,
      recurring: totals.recurring,
      ivaBps: input.ivaBps,
      currency: "MXN",
      singleTotalLabel: "Inversión total",
      recurringHeader: period === "annual" ? "Anualidad" : "Mensualidad",
      recurringTotalLabel: period === "annual" ? "Por año" : "Por mes",
    },
    termsHtml: product.termsHtml(ctx),
    termsAcceptanceHtml: TERMS_ACCEPTANCE_SHORT_HTML,
    acceptanceHtml: ACCEPTANCE_HTML,
    signatureLabel: SIGNATURE_LABEL,
    footer: FOOTER,
    fitLevels: product.fitLevels,
  };
}
