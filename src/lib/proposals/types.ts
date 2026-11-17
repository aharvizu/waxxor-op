/**
 * Contrato de datos del módulo de Propuestas (Sales).
 * Origen: docs/sales/ESPEC_Modulo_Propuestas_Waxxor v3.md §4 y §7, adaptado a
 * las convenciones de Watson (código en inglés, ids seriales, Empresa por FK).
 * Módulo puro: lo importan servidor y cliente.
 */

export const PRODUCT_KEYS = ["sentinelone", "msp360", "microsoft365"] as const;
export type ProductKey = (typeof PRODUCT_KEYS)[number];

export const PROPOSAL_STATUSES = ["draft", "issued", "accepted", "rejected", "cancelled"] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];
/** `expired` nunca se guarda: se deriva de `issued` + vigencia vencida (mismo patrón que contratos). */
export type EffectiveProposalStatus = ProposalStatus | "expired";

/**
 * A qué columna de totales suma una partida. Explícito, nunca deducido del
 * texto de vigencia (spec §4): la plantilla HTML lo deducía porque se editaba
 * a mano; el servidor no debe hacerlo.
 */
export const RECURRENCES = ["one_time", "monthly", "annual"] as const;
export type Recurrence = (typeof RECURRENCES)[number];

/**
 * Compromiso del licenciamiento (Microsoft 365): define la vigencia por
 * defecto de las licencias y la redacción de los términos. NO decide en qué
 * columna suma cada partida — eso lo dice la recurrencia de cada una.
 */
export const BILLING_PERIODS = ["monthly", "annual"] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];

/** Partida de la tabla económica. */
export type ProposalItem = {
  title: string;
  description: string;
  /** null imprime "—" y multiplica por 1. */
  quantity: number | null;
  /** Texto de la columna Vigencia: "Mensual", "Anual", "12 meses", "Proyecto". */
  termLabel: string;
  /** null imprime "No Incluido" y NO suma. */
  unitPriceCents: number | null;
  recurrence: Recurrence;
  /** Licencia agregada desde el catálogo (Microsoft 365): es la que el ajuste a una hoja compacta primero. */
  extra?: boolean;
};

export type MoneyColumn = { subtotalCents: number; ivaCents: number; totalCents: number };

/** Una columna de totales por recurrencia. Nunca se suman entre sí: son unidades distintas. */
export type ProposalTotals = Record<Recurrence, MoneyColumn>;

/** Lo que captura el formulario y valida el servidor. */
export type ProposalInput = {
  companyId: number | null;
  clientName: string;
  preparedBy: string;
  /** YYYY-MM-DD */
  date: string;
  validityDays: number;
  productKey: ProductKey;
  planKey: string | null;
  billingPeriod: BillingPeriod | null;
  items: ProposalItem[];
  note: string;
  ivaBps: number;
};

/**
 * Todo lo necesario para redibujar el documento idéntico dentro de cinco
 * años, aunque cambie el catálogo, los textos o los logotipos (spec §7). El
 * renderizador solo lee esto: un borrador se dibuja construyendo el mismo
 * objeto desde el catálogo vigente; una propuesta emitida, desde el que se
 * congeló al emitir.
 *
 * Los campos `*Html` vienen del catálogo en código (confiables); todo lo que
 * captura el usuario viaja como texto y el renderizador lo escapa.
 */
export type ProposalDocument = {
  /** 2 desde 2026-11-17: totales en columnas por recurrencia. Nunca se emitió una versión 1. */
  version: 2;
  folio: string | null;
  issuedAt: string | null;
  productKey: ProductKey;
  productName: string;
  /** Qué hoja de estilos usa: ver document-css.ts. */
  layout: "dense" | "standard";
  brandColor: string;
  header: { clientName: string; preparedBy: string; dateLabel: string; validityLabel: string };
  waxxorLogo: string;
  partner: {
    labelHtml: string;
    marks: (
      | { kind: "image"; dataUri: string; height: string; alt: string }
      | { kind: "text"; name: string; sub: string }
    )[];
  };
  hero: { eyebrow: string; titleHtml: string; subtitle: string; intro: string };
  capabilities: { iconSvg: string; titleHtml: string; tag?: string; text: string }[];
  panel: {
    badge: string;
    title: string;
    bodyHtml: string;
    figures: { number: string; unit: string; caption: string }[];
    finePrint: string;
  };
  /** null en productos sin comparativo de paquetes. */
  comparison: {
    columns: { key: string; name: string; tag: string }[];
    rows: { label: string; included: string[] }[];
    selected: string;
  } | null;
  quantityHeader: string;
  items: ProposalItem[];
  note: string;
  totals: {
    /** single: un recuadro "Inversión total" (SentinelOne). split: una columna por recurrencia presente. */
    mode: "single" | "split";
    columns: ({ recurrence: Recurrence; header: string; totalLabel: string } & MoneyColumn)[];
    ivaBps: number;
    currency: "MXN";
  };
  /** Tres columnas de viñetas. */
  termsHtml: string[][];
  /** Viñeta corta de aceptación que sustituye al recuadro en el ajuste nivel 2. */
  termsAcceptanceHtml: string;
  acceptanceHtml: string;
  signatureLabel: string;
  footer: { tagline: string; phone: string; site: string; email: string };
  /** true: el documento puede compactar el cierre para caber (plantilla de Microsoft 365). */
  fitLevels: boolean;
};
