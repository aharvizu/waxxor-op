import type { BillingPeriod, ProductKey, ProposalItem, Recurrence } from "./types";

/**
 * Catálogo de productos de las propuestas. Vive en código, no en base de
 * datos (spec §8): cambia con cada release, no por operación, y lo que ya se
 * emitió queda congelado en su snapshot.
 *
 * LOS TEXTOS SON LITERALES de las plantillas aprobadas en docs/sales/. Están
 * redactados y verificados contra la documentación de cada fabricante para
 * que ningún panel prometa más de lo que el fabricante sostiene — no
 * reescribirlos. Las letras chicas no son opcionales.
 *
 * Módulo puro y sin logotipos (pesan ~150 KB y viven en logos.ts, solo
 * servidor): el formulario del cliente puede importar este archivo.
 *
 * Agregar un producto = una entrada nueva aquí con su `maxItems` MEDIDO sobre
 * su plantilla. El renderizador no cambia. Si necesitara un bloque que no
 * existe, eso es un cambio al sistema de diseño y se decide antes de codificar.
 */

/** Iconos: viewBox 24×24, trazo 1.6, color --purple, sin relleno. Solo el interior del <svg>. */
const ICONS = {
  // SentinelOne
  ia: '<rect x="6" y="6" width="12" height="12" rx="2"/><rect x="9.5" y="9.5" width="5" height="5" rx="1"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
  rollback: '<path d="M3.2 12a8.8 8.8 0 1 0 2.9-6.5"/><path d="M3 4.6V9h4.4"/>',
  consola: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>',
  incluye: '<path d="M3.5 7.5 12 3l8.5 4.5v6c0 4.4-3.5 7.2-8.5 8.5-5-1.3-8.5-4.1-8.5-8.5Z"/><path d="m9.2 12.2 2 2 3.6-3.8"/>',
  firewall: '<rect x="3" y="4" width="18" height="6" rx="1.5"/><rect x="3" y="14" width="18" height="6" rx="1.5"/><path d="M7 7h.01M7 17h.01"/>',
  usb: '<path d="M12 3v11"/><path d="M8.5 6.5 12 3l3.5 3.5"/><rect x="6" y="14" width="12" height="7" rx="1.5"/>',
  story: '<circle cx="6" cy="6" r="2.4"/><circle cx="6" cy="18" r="2.4"/><circle cx="18" cy="12" r="2.4"/><path d="M8.4 6.7 15.6 11M8.4 17.3 15.6 13"/>',
  hunting: '<circle cx="11" cy="11" r="6.5"/><path d="M15.8 15.8 21 21"/><path d="M11 8.5v5M8.5 11h5"/>',
  // MSP360 + Wasabi
  capas: '<path d="M12 3 3 7.5 12 12l9-4.5L12 3Z"/><path d="m3 12 9 4.5 9-4.5"/><path d="m3 16.5 9 4.5 9-4.5"/>',
  nubeCheck: '<path d="M7 18.5h10a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.1 9.7a4.4 4.4 0 0 0 .9 8.8Z"/><path d="m9.4 13.8 2 2 3.6-3.6"/>',
  llave: '<circle cx="8" cy="15.5" r="4"/><path d="M10.9 12.6 20 3.5"/><path d="m16.5 7 2.5 2.5"/><path d="m18.8 4.7 1.9 1.9"/>',
  monitorPulso: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/><path d="M7 10h2.5L11 7.5l2 5 1.5-2.5H17"/>',
  // Microsoft 365
  correo: '<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="m3.5 6.5 8.5 6 8.5-6"/>',
  identidadMovil: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><rect x="16" y="9" width="5" height="9" rx="1"/><path d="M18.5 15.3h.01"/>',
  carpeta: '<path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2h9A1.5 1.5 0 0 1 21 9.5v8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5Z"/><path d="M8 13.5h8"/>',
  compartir: '<circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="18" cy="18" r="2.5"/><path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6"/>',
  apps: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.2"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.2"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.2"/>',
  archivoLupa: '<path d="M13.5 3.5H7A1.5 1.5 0 0 0 5.5 5v14A1.5 1.5 0 0 0 7 20.5h3.5"/><path d="M13.5 3.5 18 8v2.5"/><circle cx="16" cy="15.5" r="3.2"/><path d="m18.4 17.9 2.4 2.4"/>',
  identidadCheck: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="m15.5 12.5 2 2 4-4"/>',
  etiqueta: '<path d="M3 12V4.5A1.5 1.5 0 0 1 4.5 3H12l9 9-9 9Z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
  equipos: '<rect x="2.5" y="5" width="13" height="9" rx="1.2"/><path d="M1.5 17.5h15"/><rect x="18" y="8.5" width="4.5" height="10" rx="1"/>',
} as const;

export type Capability = { iconSvg: string; titleHtml: string; tag?: string; text: string };

export type PanelContent = {
  badge: string;
  title: string;
  bodyHtml: string;
  figures: { number: string; unit: string; caption: string }[];
  finePrint: string;
};

export type PlanContent = {
  key: string;
  /** Para el selector del formulario. */
  name: string;
  hero: { eyebrow: string; titleHtml: string; subtitle: string; intro: string };
  capabilities: Capability[];
  panel: PanelContent;
};

export type LogoKey = "msp360" | "wasabi" | "microsoft365";

export type TermOption = { label: string; recurrence: Recurrence };

/** Contexto del que dependen notas, términos y partidas sugeridas. */
export type CatalogContext = { planKey: string | null; period: BillingPeriod | null; validityDays: number };

export type Product = {
  key: ProductKey;
  name: string;
  layout: "dense" | "standard";
  brandColor: string;
  partnerLabelHtml: string;
  partnerMarks: ({ kind: "logo"; logo: LogoKey; height: string; alt: string } | { kind: "text"; name: string; sub: string })[];
  /** Un producto sin paquetes tiene un solo plan con key "default" y `planLabel` null. */
  planLabel: string | null;
  plans: PlanContent[];
  defaultPlan: string;
  comparison: {
    columns: { key: string; name: string; tag: string }[];
    rows: { label: string; included: string[] }[];
  } | null;
  quantityHeader: string;
  totalsMode: "single" | "dual";
  /** Periodos que admite la columna recurrente; vacío en totales simples. */
  periods: BillingPeriod[];
  termOptions: TermOption[];
  suggestedItems: (ctx: CatalogContext) => ProposalItem[];
  /** `recurrences`: columnas presentes (presentRecurrences) — la nota y los términos hablan solo de los pagos que existen. */
  defaultNote: (ctx: CatalogContext, recurrences: readonly Recurrence[]) => string;
  termsHtml: (ctx: CatalogContext, recurrences: readonly Recurrence[]) => string[][];
  /** Licencias y complementos que se pueden agregar como partida (Microsoft 365). */
  licenseCatalog: { key: string; title: string; description: string }[];
  /** Tope duro de partidas; el límite real es vertical y lo verifica el documento (spec §4.2, §9.1). */
  maxItems: number;
  /** true: el documento compacta el cierre por niveles para caber (plantilla de Microsoft 365). */
  fitLevels: boolean;
};

const ACCEPTANCE_SHORT = "<b>Aceptación:</b> firma, OC o anticipo.";

/* ------------------------------------------------------------------ SentinelOne */

const S1_SUBTITLE = "SentinelOne · Plataforma de seguridad autónoma para endpoints";
const S1_EYEBROW = "Propuesta ejecutiva · Protección de endpoints";

/** Idéntico para los tres paquetes. */
const S1_PANEL: PanelContent = {
  badge: "Respaldo anti-ransomware",
  title: "Rollback en un clic y garantía",
  bodyHtml:
    "Ante un cifrado, el agente revierte archivos, registro y configuración al estado previo al ataque " +
    "desde instantáneas protegidas contra manipulación. SentinelOne respalda esta capacidad con su " +
    "<b>Garantía Anti-Ransomware</b>, que reembolsa el rescate si no logra contener el ataque.",
  figures: [
    { number: "1,000", unit: "USD", caption: "por endpoint afectado" },
    { number: "1M", unit: "USD", caption: "máximo por empresa / año" },
  ],
  finePrint:
    "Sujeta al Ransomware Warranty Agreement de SentinelOne. Cubre el rescate, no la interrupción del negocio.",
};

const sentinelone: Product = {
  key: "sentinelone",
  name: "SentinelOne Singularity",
  layout: "dense",
  brandColor: "#6100FF",
  partnerLabelHtml: "Partner<br>autorizado",
  partnerMarks: [{ kind: "text", name: "SentinelOne", sub: "Singularity Platform" }],
  planLabel: "Paquete",
  defaultPlan: "complete",
  plans: [
    {
      key: "core",
      name: "Singularity Core",
      hero: {
        eyebrow: S1_EYEBROW,
        titleHtml: "Singularity™ Core",
        subtitle: S1_SUBTITLE,
        intro:
          "Sustitución del antivirus tradicional por una plataforma de prevención, detección y respuesta " +
          "autónoma basada en inteligencia artificial, con un solo agente y consola en la nube, " +
          "implementada y acompañada por Waxxor.",
      },
      capabilities: [
        { iconSvg: ICONS.ia, titleHtml: "Prevención autónoma por IA", text: "Motores de IA estática y conductual en el equipo, sin firmas ni conexión permanente." },
        { iconSvg: ICONS.rollback, titleHtml: "Respuesta autónoma y reversión", text: "Contención, remediación y reversión del equipo afectado en un clic desde la consola." },
        { iconSvg: ICONS.consola, titleHtml: "Consola única en la nube", text: "Políticas jerárquicas, control de accesos por rol y cobertura de Windows, macOS y Linux." },
      ],
      panel: S1_PANEL,
    },
    {
      key: "control",
      name: "Singularity Control",
      hero: {
        eyebrow: S1_EYEBROW,
        titleHtml: "Singularity™ Control",
        subtitle: S1_SUBTITLE,
        intro:
          "Prevención, detección y respuesta autónoma basada en inteligencia artificial, con un solo agente " +
          "y consola en la nube, sumando control de red, control de dispositivos y descubrimiento de equipos " +
          "no protegidos, con implementación y acompañamiento de Waxxor.",
      },
      capabilities: [
        { iconSvg: ICONS.incluye, titleHtml: "Todo lo incluido en Core", text: "Prevención por IA, respuesta autónoma y reversión ante ransomware sobre un solo agente." },
        { iconSvg: ICONS.firewall, titleHtml: "Control de red (Firewall)", text: "Tráfico de entrada y salida en Windows, macOS y Linux, con políticas por ubicación del equipo." },
        { iconSvg: ICONS.usb, titleHtml: "Control de dispositivos y equipos no protegidos", text: "Autorización granular de USB y Bluetooth, y descubrimiento de equipos sin agente en la red." },
      ],
      panel: S1_PANEL,
    },
    {
      key: "complete",
      name: "Singularity Complete",
      hero: {
        eyebrow: S1_EYEBROW,
        titleHtml: "Singularity™ Complete",
        subtitle: S1_SUBTITLE,
        intro:
          "Prevención, detección y respuesta autónoma basada en inteligencia artificial sobre un solo agente, " +
          "sumando al control de superficie las capacidades de EDR: correlación automática de cada ataque, " +
          "búsqueda de amenazas y respuesta remota, con implementación y acompañamiento de Waxxor.",
      },
      capabilities: [
        { iconSvg: ICONS.incluye, titleHtml: "Todo lo incluido en Control", text: "Prevención por IA, reversión ante ransomware, control de red y de dispositivos, y descubrimiento de equipos." },
        { iconSvg: ICONS.story, titleHtml: "EDR con Storyline", text: "Correlación automática de cada proceso en una sola historia de ataque, con mapeo a MITRE ATT&amp;CK®." },
        { iconSvg: ICONS.hunting, titleHtml: "Threat hunting y respuesta remota", text: "Búsqueda sobre la telemetría del parque, retención de 14 días ampliable y Remote Shell para contener a distancia." },
      ],
      panel: S1_PANEL,
    },
  ],
  comparison: {
    columns: [
      { key: "core", name: "Core", tag: "Protección base" },
      { key: "control", name: "Control", tag: "+ Control de superficie" },
      { key: "complete", name: "Complete", tag: "+ EDR y respuesta" },
    ],
    rows: [
      { label: "Prevención por IA estática y conductual (NGAV)", included: ["core", "control", "complete"] },
      { label: "Respuesta autónoma, reversión (rollback) y garantía anti-ransomware", included: ["core", "control", "complete"] },
      { label: "Control de red (Firewall) con políticas por ubicación", included: ["control", "complete"] },
      { label: "Control de dispositivos USB y Bluetooth", included: ["control", "complete"] },
      { label: "Descubrimiento de equipos sin agente instalado", included: ["control", "complete"] },
      { label: "EDR con Storyline y mapeo a MITRE ATT&amp;CK", included: ["complete"] },
      { label: "Threat hunting sobre telemetría, Remote Shell y retención EDR", included: ["complete"] },
    ],
  },
  quantityHeader: "Dispositivos",
  totalsMode: "single",
  periods: [],
  termOptions: [
    { label: "12 meses", recurrence: "one_time" },
    { label: "Proyecto", recurrence: "one_time" },
  ],
  suggestedItems: ({ planKey }) => {
    const plan = sentinelone.plans.find((p) => p.key === planKey) ?? sentinelone.plans[2];
    return [
      {
        title: `Licenciamiento SentinelOne ${plan.name}`,
        description: "Suscripción anual por dispositivo, consola en la nube y actualizaciones.",
        quantity: 0,
        termLabel: "12 meses",
        unitPriceCents: 0,
        recurrence: "one_time",
      },
      {
        title: "Implementación y puesta en marcha",
        description: "Despliegue del agente, políticas, habilitación de rollback y validación.",
        quantity: 0,
        termLabel: "Proyecto",
        unitPriceCents: 0,
        recurrence: "one_time",
      },
      {
        title: "Administración y soporte Waxxor",
        description: "Mesa de ayuda, ajuste de políticas y reporte mensual de postura.",
        quantity: null,
        termLabel: "12 meses",
        unitPriceCents: null,
        recurrence: "one_time",
      },
    ];
  },
  defaultNote: () =>
    "el precio unitario se ajusta por volumen y los importes se confirman al validar el inventario final de dispositivos. La vigencia inicia con el alta de la consola.",
  // La plantilla fijaba "30 días" en este término mientras la franja de datos
  // era editable; aquí sale de la misma vigencia para que no se contradigan.
  termsHtml: ({ validityDays }) => [
    [
      "Precios en <b>pesos mexicanos (M.N.)</b>; el IVA se indica por separado.",
      `<b>Vigencia de la propuesta:</b> ${validityDays} días naturales desde su emisión.`,
    ],
    [
      "Se requiere el <b>100 % del pago</b> previo al inicio del proyecto.",
      "Licenciamiento por <b>periodo anual completo</b>, no fraccionable ni reembolsable.",
    ],
    [
      "Paquetes y funcionalidades sujetos a <b>validación comercial</b> con el fabricante.",
      "Soporte conforme al <b>SLA de Waxxor</b>; plataforma sujeta al SLA del fabricante.",
    ],
  ],
  licenseCatalog: [],
  maxItems: 3, // medido: una partida más desborda el pie +2.5 mm
  fitLevels: false,
};

/* ------------------------------------------------------------------ MSP360 + Wasabi */

const msp360: Product = {
  key: "msp360",
  name: "MSP360 + Wasabi",
  layout: "standard",
  brandColor: "#F15A22",
  partnerLabelHtml: "Solución de<br>respaldo",
  partnerMarks: [
    { kind: "logo", logo: "msp360", height: "5.4mm", alt: "MSP360" },
    { kind: "logo", logo: "wasabi", height: "8.6mm", alt: "Wasabi" },
  ],
  planLabel: null,
  defaultPlan: "default",
  plans: [
    {
      key: "default",
      name: "MSP360 Managed Backup · Wasabi",
      hero: {
        eyebrow: "Propuesta ejecutiva · Continuidad operativa",
        titleHtml: "Respaldo y recuperación de la operación",
        subtitle: "MSP360 Managed Backup · Almacenamiento inmutable en Wasabi",
        intro:
          "Ante un ransomware, un desastre o una falla mayor, lo que importa es en cuánto tiempo vuelve a operar " +
          "la empresa. Respaldo gestionado con copia inmutable fuera del sitio, implementado y probado por Waxxor.",
      },
      capabilities: [
        { iconSvg: ICONS.capas, titleHtml: "Respaldo de imagen, archivos y aplicaciones", text: "Servidores y equipos Windows, Linux y macOS, SQL Server, Hyper-V y VMware, con respaldos incrementales y completos sintéticos." },
        { iconSvg: ICONS.nubeCheck, titleHtml: "Copia inmutable fuera del sitio", text: "Wasabi Object Lock impide modificar o eliminar los respaldos durante el periodo de retención, incluso con credenciales comprometidas." },
        { iconSvg: ICONS.llave, titleHtml: "Cifrado y control de acceso", text: "Cifrado AES-256 en origen, tránsito y destino; doble factor, permisos por rol y registro de acciones en la consola." },
        { iconSvg: ICONS.monitorPulso, titleHtml: "Consola única y verificación de restauración", text: "Alertas por falla y verificación automática de cada respaldo." },
      ],
      panel: {
        badge: "Garantía de continuidad",
        title: "Recuperación ante hackeo o desastre",
        bodyHtml:
          "Si un ataque cifra los servidores o un siniestro inutiliza el sitio, la copia en Wasabi sigue intacta y " +
          "fuera del alcance del atacante, lista para restaurarse en otro equipo o en la nube, <b>sin cargos por " +
          "descarga ni restauración</b>.",
        figures: [
          { number: "11", unit: "NUEVES", caption: "de durabilidad del almacenamiento" },
          { number: "$0", unit: "USD", caption: "por descarga o restauración de datos" },
        ],
        finePrint:
          "Inmutabilidad según la retención configurada; RTO/RPO se definen en la implementación. " +
          "Descarga sujeta a la política de uso razonable de Wasabi.",
      },
    },
  ],
  comparison: null,
  quantityHeader: "Cantidad",
  totalsMode: "dual",
  periods: ["monthly"],
  termOptions: [
    { label: "Mensual", recurrence: "monthly" },
    { label: "Proyecto", recurrence: "one_time" },
  ],
  suggestedItems: () => [
    { title: "Licenciamiento MSP360 Managed Backup", description: "Licencia por equipo protegido, consola centralizada y actualizaciones.", quantity: 0, termLabel: "Mensual", unitPriceCents: 0, recurrence: "monthly" },
    { title: "Almacenamiento inmutable Wasabi (por TB)", description: "Capacidad en TB con Object Lock; sin cargos por descarga ni solicitudes API.", quantity: 0, termLabel: "Mensual", unitPriceCents: 0, recurrence: "monthly" },
    { title: "Implementación y puesta en marcha", description: "Políticas de retención, despliegue de agentes y prueba de restauración.", quantity: 1, termLabel: "Proyecto", unitPriceCents: 0, recurrence: "one_time" },
    // Se cotiza cuando el cliente lo contrata.
    { title: "Administración y soporte Waxxor", description: "Monitoreo de respaldos, atención de alertas y reporte mensual.", quantity: null, termLabel: "Mensual", unitPriceCents: null, recurrence: "monthly" },
  ],
  defaultNote: () =>
    "el pago único se cubre una sola vez al inicio. Los conceptos mensuales se facturan cada mes a partir del alta del servicio y se ajustan al inventario de equipos y al volumen real de datos.",
  // La vigencia de la propuesta NO va en términos: vive en la franja de datos
  // y duplicarla produce documentos que se contradicen (spec §8.2).
  termsHtml: () => [
    ["Precios en <b>M.N.</b>; IVA por separado.", "<b>Mensualidades</b> pagaderas por adelantado."],
    ["<b>Pago único</b> previo al inicio del proyecto.", "Periodos facturados <b>no reembolsables</b>."],
    ["<b>Excedente de TB</b> al precio unitario vigente.", "Soporte según <b>SLA de Waxxor</b> y fabricantes."],
  ],
  licenseCatalog: [],
  maxItems: 4, // medido: una partida más desborda el pie +7.3 mm
  fitLevels: false,
};

/* ------------------------------------------------------------------ Microsoft 365 */

const M365_EYEBROW = "Propuesta ejecutiva · Colaboración segura";
const M365_TITLE = "Correo y archivos protegidos desde el origen";
const M365_INTRO_BASE =
  "La mayoría de los incidentes comienzan con un correo o un archivo compartido de más. Microsoft 365 " +
  "implementado por Waxxor con la seguridad activa desde el primer día, sin depender de cada colaborador.";
const M365_FINE_BASE =
  "Controles nativos de Microsoft 365; reducen el riesgo, no lo eliminan. Disponibilidad de 99.9 % según el SLA de Microsoft.";
const M365_PANEL_BODY_BASE =
  "Políticas obligatorias configuradas por Waxxor: doble factor, revisión de enlaces, bloqueo del " +
  "reenvío al exterior y reglas para compartir. <b>Una contraseña robada ya no basta.</b>";

const CAP_CORREO: Capability = { iconSvg: ICONS.correo, titleHtml: "Correo corporativo con filtrado de amenazas", text: "Dominio propio y filtrado de spam, malware y enlaces maliciosos." };
const CAP_MFA: Capability = { iconSvg: ICONS.identidadMovil, titleHtml: "Identidad con doble factor", text: "Obligatorio en cada cuenta: una contraseña robada ya no basta." };

/** Licencia principal de cada plan: título y descripción de su partida. */
const M365_LICENSES: Record<string, { title: string; description: string }> = {
  basic: { title: "Licenciamiento Microsoft 365 Business Basic", description: "Por usuario: correo, SharePoint, OneDrive de 1 TB y Teams; apps web." },
  std: { title: "Licenciamiento Microsoft 365 Business Standard", description: "Por usuario: Office de escritorio, correo, SharePoint y OneDrive 1 TB." },
  prem: { title: "Licenciamiento Microsoft 365 Business Premium", description: "Por usuario: Business Standard más Defender, Intune, Entra ID P1 y Purview." },
};

const microsoft365: Product = {
  key: "microsoft365",
  name: "Microsoft 365",
  layout: "standard",
  brandColor: "#0078D4",
  partnerLabelHtml: "Plataforma de colaboración<br>Correo seguro",
  partnerMarks: [{ kind: "logo", logo: "microsoft365", height: "5.2mm", alt: "Microsoft 365" }],
  planLabel: "Plan propuesto",
  defaultPlan: "basic",
  plans: [
    {
      key: "basic",
      name: "Microsoft 365 Business Basic",
      hero: {
        eyebrow: M365_EYEBROW,
        titleHtml: M365_TITLE,
        subtitle: "Microsoft 365 Business Basic · Exchange Online, SharePoint y OneDrive",
        intro: M365_INTRO_BASE,
      },
      capabilities: [
        CAP_CORREO,
        CAP_MFA,
        { iconSvg: ICONS.carpeta, titleHtml: "Archivos centralizados en SharePoint y OneDrive", text: "Sitios por área, permisos definidos y 1 TB por usuario." },
        { iconSvg: ICONS.compartir, titleHtml: "Compartir con control y trazabilidad", text: "Enlaces externos con caducidad y auditoría de accesos." },
      ],
      panel: {
        badge: "Garantía de uso correcto",
        title: "Que un correo no se convierta en un hackeo",
        bodyHtml: M365_PANEL_BODY_BASE,
        figures: [
          { number: "100%", unit: "CUENTAS", caption: "con doble factor de autenticación" },
          { number: "1", unit: "TB", caption: "de almacenamiento seguro por usuario" },
        ],
        finePrint: M365_FINE_BASE,
      },
    },
    {
      key: "std",
      name: "Microsoft 365 Business Standard",
      hero: {
        eyebrow: M365_EYEBROW,
        titleHtml: M365_TITLE,
        subtitle: "Microsoft 365 Business Standard · Office de escritorio, correo, SharePoint y OneDrive",
        intro: M365_INTRO_BASE,
      },
      capabilities: [
        { iconSvg: ICONS.apps, titleHtml: "Paquetería Office de escritorio", tag: "Incluida", text: "Word, Excel, PowerPoint, Outlook y OneNote en PC, Mac y móviles." },
        CAP_CORREO,
        CAP_MFA,
        { iconSvg: ICONS.carpeta, titleHtml: "Archivos seguros en SharePoint y OneDrive", text: "Permisos por área, 1 TB por usuario y enlaces con caducidad." },
      ],
      panel: {
        badge: "Garantía de uso correcto",
        title: "Que un correo no se convierta en un hackeo",
        bodyHtml: M365_PANEL_BODY_BASE,
        figures: [
          { number: "100%", unit: "CUENTAS", caption: "con doble factor de autenticación" },
          { number: "15", unit: "EQUIPOS", caption: "con Office: 5 PC o Mac, 5 tabletas y 5 móviles" },
        ],
        finePrint: M365_FINE_BASE,
      },
    },
    {
      key: "prem",
      name: "Microsoft 365 Business Premium",
      hero: {
        eyebrow: M365_EYEBROW,
        titleHtml: M365_TITLE,
        subtitle: "Microsoft 365 Business Premium · Correo, identidad, datos y equipos protegidos",
        intro:
          "La mayoría de los incidentes comienzan con un correo, un archivo o un equipo sin control. Microsoft 365 " +
          "implementado por Waxxor: correo, identidad, datos y equipos bajo una sola política de seguridad.",
      },
      capabilities: [
        { iconSvg: ICONS.archivoLupa, titleHtml: "Defensa avanzada del correo", text: "Adjuntos en entorno aislado, enlaces seguros y anti-suplantación." },
        { iconSvg: ICONS.identidadCheck, titleHtml: "Identidad y acceso condicional", text: "Entra ID P1: acceso solo desde equipos y ubicaciones autorizadas." },
        { iconSvg: ICONS.etiqueta, titleHtml: "Información clasificada y protegida", text: "Purview: etiquetas con cifrado y prevención de pérdida de datos." },
        { iconSvg: ICONS.equipos, titleHtml: "Equipos administrados y protegidos", text: "Intune y Defender: antirransomware y borrado remoto de equipos." },
      ],
      panel: {
        badge: "Seguridad de nivel empresarial",
        title: "La amenaza se detiene antes del usuario",
        bodyHtml:
          "Adjuntos revisados en entorno aislado, enlaces verificados al hacer clic y acceso solo desde equipos " +
          "confiables. <b>La seguridad deja de depender del criterio de cada persona.</b>",
        figures: [
          { number: "100%", unit: "CUENTAS", caption: "con MFA y acceso condicional" },
          { number: "4", unit: "CAPAS", caption: "correo, identidad, datos y equipos" },
        ],
        finePrint:
          "Incluye Office de escritorio, Defender para Office 365 P1, Defender para Empresas, Intune P1, " +
          "Entra ID P1 y Purview. Reducen el riesgo, no lo eliminan.",
      },
    },
  ],
  comparison: null,
  quantityHeader: "Cantidad",
  totalsMode: "dual",
  // El compromiso de las licencias (anual o mensual) lo elige quien cotiza:
  // cambia el precio que da Microsoft, la vigencia por defecto de las
  // licencias y los términos. La columna de cada partida la decide su propia
  // recurrencia, no este valor.
  periods: ["annual", "monthly"],
  termOptions: [
    { label: "Anual", recurrence: "annual" },
    { label: "Mensual", recurrence: "monthly" },
    { label: "Proyecto", recurrence: "one_time" },
  ],
  suggestedItems: ({ planKey, period }) => {
    const license = M365_LICENSES[planKey ?? "basic"] ?? M365_LICENSES.basic;
    const annual = period !== "monthly";
    return [
      { ...license, quantity: 0, termLabel: annual ? "Anual" : "Mensual", unitPriceCents: 0, recurrence: annual ? "annual" : "monthly" },
      {
        title: "Implementación y migración segura",
        description:
          planKey === "prem"
            ? "Migración, acceso condicional, Defender, Intune, etiquetas y control de fugas."
            : "Migración de correo y archivos, doble factor, políticas, sitios y permisos.",
        quantity: 1,
        termLabel: "Proyecto",
        unitPriceCents: 0,
        recurrence: "one_time",
      },
      { title: "Servicio administrado Waxxor", description: "Usuarios y permisos, atención de alertas de seguridad y reporte mensual.", quantity: 0, termLabel: "Mensual", unitPriceCents: 0, recurrence: "monthly" },
    ];
  },
  // Texto de la plantilla, ajustado a las columnas presentes: desde
  // 2026-11-17 la mensualidad ya no se pliega en la anualidad, así que la nota
  // no puede decir que "la anualidad incluye doce meses de los servicios
  // mensuales".
  defaultNote: (_ctx, recurrences) => {
    const annual = recurrences.includes("annual");
    const monthly = recurrences.includes("monthly");
    const start = "el pago único se cubre una sola vez al inicio.";
    if (annual && monthly) {
      return `${start} La anualidad se factura al alta y en cada renovación; los conceptos mensuales, cada mes a partir del alta del servicio. Ambos se ajustan al número real de usuarios.`;
    }
    if (annual) return `${start} La anualidad se factura al alta y en cada renovación y se ajusta al número real de usuarios.`;
    if (monthly) {
      return `${start} Los conceptos mensuales se facturan cada mes a partir del alta del servicio y se ajustan al número real de usuarios.`;
    }
    return start;
  },
  termsHtml: ({ period }, recurrences) => {
    const annual = recurrences.includes("annual");
    const monthly = recurrences.includes("monthly");
    const inAdvance =
      annual && monthly
        ? "<b>Anualidades y mensualidades</b> pagaderas por adelantado."
        : monthly
          ? "<b>Mensualidades</b> pagaderas por adelantado."
          : "<b>Anualidades</b> pagaderas por adelantado.";
    return [
      [
        "Precios en <b>M.N.</b>; IVA por separado.",
        period === "monthly" ? "<b>Licencias</b> con renovación mensual." : "<b>Licencias</b> con compromiso anual de Microsoft.",
      ],
      ["<b>Pago único</b> previo al inicio del proyecto.", inAdvance],
      ["Licencias sujetas a <b>tipo de cambio</b>.", "Soporte según <b>SLA de Waxxor</b> y fabricantes."],
    ];
  },
  // Las primeras once son las de la plantilla aprobada, con su texto literal.
  // El resto amplía el catálogo con las variantes que Microsoft comercializa
  // (2026-11); título y descripción se pueden editar en cada partida.
  licenseCatalog: [
    { key: "basic", ...M365_LICENSES.basic },
    { key: "std", ...M365_LICENSES.std },
    { key: "prem", ...M365_LICENSES.prem },
    { key: "apps", title: "Licenciamiento Microsoft 365 Apps para negocios", description: "Office de escritorio y OneDrive de 1 TB por usuario, sin correo corporativo." },
    { key: "exo1", title: "Licenciamiento Exchange Online (Plan 1)", description: "Solo correo: buzón con dominio propio, calendario, antispam y antimalware." },
    { key: "exo2", title: "Licenciamiento Exchange Online (Plan 2)", description: "Solo correo: archivo con expansión automática y prevención de fugas." },
    { key: "exa", title: "Exchange Online Archiving", description: "Complemento: archivo de correo con expansión automática." },
    { key: "dfo", title: "Microsoft Defender para Office 365 (Plan 1)", description: "Complemento: adjuntos en entorno aislado y enlaces seguros." },
    { key: "dfb", title: "Microsoft Defender para Empresas", description: "Complemento: protección de equipos contra ransomware y malware." },
    { key: "entra", title: "Microsoft Entra ID P1", description: "Complemento: acceso condicional y autoservicio de contraseñas." },
    { key: "exok", title: "Licenciamiento Exchange Online Kiosk", description: "Solo correo web: buzón de 2 GB para personal operativo." },
    { key: "appsent", title: "Licenciamiento Microsoft 365 Apps para empresas", description: "Office de escritorio y OneDrive por usuario, sin límite de 300 usuarios." },
    { key: "f3", title: "Licenciamiento Microsoft 365 F3", description: "Personal de primera línea: apps web y móviles, correo de 2 GB y Teams." },
    { key: "e3", title: "Licenciamiento Microsoft 365 E3", description: "Empresarial: Office, Windows Enterprise y seguridad y cumplimiento base." },
    { key: "e5", title: "Licenciamiento Microsoft 365 E5", description: "Empresarial: E3 más seguridad avanzada, cumplimiento y analítica." },
    { key: "o365e1", title: "Licenciamiento Office 365 E1", description: "Empresarial: correo, SharePoint y OneDrive con apps web, sin Office de escritorio." },
    { key: "o365e3", title: "Licenciamiento Office 365 E3", description: "Empresarial: Office de escritorio, correo de 100 GB y cumplimiento base." },
    { key: "dfo2", title: "Microsoft Defender para Office 365 (Plan 2)", description: "Complemento: Plan 1 más investigación, respuesta y simulación de ataques." },
    { key: "entra2", title: "Microsoft Entra ID P2", description: "Complemento: P1 más protección de identidad y acceso con privilegios." },
    { key: "intune", title: "Microsoft Intune (Plan 1)", description: "Complemento: administración de equipos y móviles, políticas y borrado remoto." },
    { key: "teamsess", title: "Microsoft Teams Essentials", description: "Solo Teams: reuniones, chat y 10 GB de almacenamiento por usuario." },
    { key: "teamsent", title: "Microsoft Teams Enterprise", description: "Complemento: Teams para planes empresariales que no lo incluyen." },
    { key: "copilot", title: "Microsoft 365 Copilot", description: "Complemento: asistente de IA en Word, Excel, Outlook y Teams." },
    { key: "pbi", title: "Power BI Pro", description: "Complemento: creación y publicación de tableros e informes." },
    { key: "otra", title: "Otra licencia o complemento", description: "Descripción breve del concepto." },
  ],
  // Tope duro; el límite real es vertical y el documento lo resuelve con el
  // ajuste por niveles (retira firma → aceptación a términos → descripciones).
  maxItems: 7,
  fitLevels: true,
};

export const PRODUCTS: Record<ProductKey, Product> = { sentinelone, msp360, microsoft365 };
export const PRODUCT_LIST: Product[] = [sentinelone, msp360, microsoft365];

export function getProduct(key: string): Product | null {
  return (PRODUCTS as Record<string, Product | undefined>)[key] ?? null;
}

export function getPlan(product: Product, planKey: string | null): PlanContent {
  return product.plans.find((p) => p.key === planKey) ?? product.plans.find((p) => p.key === product.defaultPlan)!;
}

/** Periodo efectivo de un producto: el pedido si lo admite, si no su default; null en totales simples. */
export function resolvePeriod(product: Product, period: BillingPeriod | null): BillingPeriod | null {
  if (product.periods.length === 0) return null;
  return period !== null && product.periods.includes(period) ? period : product.periods[0];
}

export const TERMS_ACCEPTANCE_SHORT_HTML = ACCEPTANCE_SHORT;
export const ACCEPTANCE_HTML =
  "<b>Aceptación:</b> la firma de esta propuesta, la emisión de una orden de compra o el pago del anticipo " +
  "constituyen la aceptación de los presentes Términos y Condiciones y del Acuerdo de Niveles de Servicio de Waxxor.";
export const SIGNATURE_LABEL = "Por el Cliente — Nombre y firma";
export const FOOTER = {
  tagline: "Convertimos empresas en empresas ciberseguras",
  phone: "(662) 299 7741",
  site: "www.waxxor.com",
  email: "ventas@waxxor.com",
};
