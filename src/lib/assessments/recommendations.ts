import type { ProductKey, ProposalItem } from "@/lib/proposals/types";
import type { Answers } from "./questionnaire";

/**
 * De las respuestas de un levantamiento a oportunidades concretas. Cada
 * oportunidad cita el hallazgo que la sustenta — no es una recomendación
 * genérica, es "esto contestó el cliente, por eso esto". Solo se sugieren los
 * productos que tienen plantilla de propuesta; lo demás (capacitación,
 * dominios) queda como hallazgo sin botón de propuesta hasta que exista su
 * formato.
 *
 * Reglas deliberadamente conservadoras: sin respuesta no hay hallazgo, y "no
 * se sabe" cuenta como hallazgo solo donde no saber ES el riesgo.
 */
export type Opportunity = {
  key: string;
  title: string;
  /** Producto con plantilla, o null si todavía no hay formato de propuesta. */
  productKey: ProductKey | null;
  planKey?: string;
  reasons: string[];
};

const str = (a: Answers, key: string): string | null => {
  const v = a[key];
  return typeof v === "string" ? v : null;
};
const list = (a: Answers, key: string): string[] => {
  const v = a[key];
  return Array.isArray(v) ? v : [];
};
const num = (a: Answers, key: string): number | null => {
  const v = str(a, key);
  return v === null ? null : Number(v);
};

export function deriveOpportunities(a: Answers): Opportunity[] {
  const out: Opportunity[] = [];

  // --- Microsoft 365
  {
    const platform = str(a, "email.platform");
    const mfa = str(a, "email.mfa");
    const filtering = str(a, "email.filtering");
    const reasons: string[] = [];
    let planKey = "basic";
    if (platform === "hosting") reasons.push("El correo vive en el hosting: sin doble factor ni filtrado avanzado de amenazas.");
    if (platform === "exchange") reasons.push("Servidor Exchange propio: carga de mantenimiento y parches que la nube elimina.");
    if (platform === "other" || platform === "unknown") reasons.push("La plataforma de correo no está clara o no es corporativa.");
    if (mfa === "none" || mfa === "some") reasons.push(mfa === "none" ? "Ninguna cuenta de correo tiene doble factor." : "El doble factor no cubre todas las cuentas.");
    if (filtering === "none") reasons.push("No hay filtrado de spam ni phishing.");
    if (str(a, "email.auth_records") === "none") reasons.push("SPF, DKIM y DMARC sin configurar: el dominio se puede suplantar.");
    const office = str(a, "email.office");
    if (office === "perpetual" || office === "mixed") {
      reasons.push("La paquetería de oficina no es por suscripción; Business Standard la incluye.");
      planKey = "std";
    }
    // Ya está en Microsoft 365 y aun así faltan controles: el salto es a Premium.
    if (platform === "m365" && reasons.length > 0) planKey = "prem";
    if (reasons.length > 0) out.push({ key: "microsoft365", title: "Microsoft 365", productKey: "microsoft365", planKey, reasons });
  }

  // --- SentinelOne
  {
    const type = str(a, "endpoints.type");
    const reasons: string[] = [];
    if (type === "none") reasons.push("Los equipos no tienen protección.");
    if (type === "defender") reasons.push("Solo Windows Defender, sin respuesta ni reversión ante ransomware.");
    if (type === "antivirus") reasons.push("Antivirus tradicional basado en firmas, sin capacidades de EDR.");
    if (type === "unknown") reasons.push("No se sabe qué protege a los equipos.");
    if (str(a, "endpoints.console") === "no") reasons.push("La protección no se administra desde una consola central.");
    if (reasons.length > 0) out.push({ key: "sentinelone", title: "SentinelOne Singularity", productKey: "sentinelone", reasons });
  }

  // --- MSP360 + Wasabi
  {
    const reasons: string[] = [];
    if (list(a, "backups.scope").includes("nothing")) reasons.push("No se respalda nada.");
    const offsite = str(a, "backups.offsite");
    if (offsite === "no") reasons.push("No hay copia fuera del sitio: un ransomware o un siniestro se lleva también el respaldo.");
    if (offsite === "unknown") reasons.push("No se sabe si existe una copia fuera del sitio.");
    const test = str(a, "backups.restore_test");
    if (test === "never") reasons.push("Nunca se ha probado restaurar.");
    if (str(a, "backups.frequency") === "manual") reasons.push("El respaldo es manual y depende de que alguien se acuerde.");
    const dest = list(a, "backups.destination");
    if (dest.length > 0 && dest.every((d) => d === "usb" || d === "nas")) {
      reasons.push("Las copias solo quedan en la oficina (disco externo o NAS).");
    }
    if (reasons.length > 0) out.push({ key: "msp360", title: "Respaldo MSP360 + Wasabi", productKey: "msp360", reasons });
  }

  // --- Sin plantilla de propuesta todavía: se registran como hallazgo.
  {
    const reasons: string[] = [];
    const interest = str(a, "people.training_interest");
    if (interest === "yes" || interest === "maybe") reasons.push(interest === "yes" ? "Hay interés en capacitar a los usuarios." : "Hay interés posible en capacitar a los usuarios.");
    const phishing = str(a, "people.phishing_interest");
    if (phishing === "yes" || phishing === "maybe") reasons.push("Interés en simulaciones de phishing.");
    if (str(a, "people.training") === "never" && reasons.length > 0) reasons.push("El personal nunca ha recibido capacitación en ciberseguridad.");
    if (reasons.length > 0) out.push({ key: "training", title: "Capacitación a usuarios", productKey: null, reasons });
  }
  {
    const reasons: string[] = [];
    const owner = str(a, "domains.owner");
    if (owner === "employee") reasons.push("El dominio está a nombre de un empleado o exempleado, no de la empresa.");
    if (owner === "provider") reasons.push("El dominio lo controla un proveedor externo.");
    if (owner === "unknown") reasons.push("Nadie sabe quién controla el dominio.");
    if (str(a, "hosting.ssl") === "no") reasons.push("El sitio web no tiene certificado SSL vigente.");
    if (str(a, "hosting.backup") === "no") reasons.push("El sitio web no tiene respaldo.");
    if (reasons.length > 0) out.push({ key: "domains", title: "Dominio y alojamiento", productKey: null, reasons });
  }

  return out;
}

/**
 * Cantidades sugeridas para una propuesta que nace de un levantamiento:
 * buzones o usuarios → licencias de Microsoft 365; equipos y servidores →
 * agentes de SentinelOne y de respaldo; TB → almacenamiento. Solo toca la
 * cantidad; los precios siempre se capturan a mano.
 */
export function assessmentPrefill(productKey: ProductKey, a: Answers, items: ProposalItem[]): ProposalItem[] {
  const users = num(a, "email.mailboxes") ?? num(a, "profile.users");
  const endpoints = (num(a, "profile.devices") ?? 0) + (num(a, "profile.servers") ?? 0);
  const tb = num(a, "backups.volume_tb");
  const withQty = (index: number, quantity: number | null) =>
    items.map((item, i) => (i === index && quantity !== null && quantity > 0 ? { ...item, quantity } : item));

  if (productKey === "microsoft365") return withQty(0, users);
  if (productKey === "sentinelone") return withQty(0, endpoints || null);
  // MSP360: partida 0 = licencias por equipo, partida 1 = TB en Wasabi.
  const licensed = withQty(0, endpoints || null);
  return licensed.map((item, i) => (i === 1 && tb !== null && tb > 0 ? { ...item, quantity: tb } : item));
}
