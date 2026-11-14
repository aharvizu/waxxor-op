/**
 * Cuestionario del Levantamiento — un análisis BÁSICO del entorno de TI de un
 * cliente o prospecto, enfocado en lo que Waxxor ofrece: dominios, alojamiento,
 * correo, protección de dispositivos, respaldos y capacitación.
 *
 * Criterios de diseño (buenas prácticas de discovery para un MSP):
 * - Se llena en una visita o llamada de 20–30 minutos: preguntas cerradas
 *   donde se puede, texto solo donde aporta.
 * - "No se sabe" es una respuesta válida y valiosa: que nadie sepa quién
 *   controla el dominio ES el hallazgo.
 * - Cada sección responde tres cosas: qué tienen, quién lo controla y cuándo
 *   vence — lo que hace falta para cotizar y para detectar riesgo.
 * - Ninguna pregunta es obligatoria: un levantamiento a medias se guarda y
 *   se completa después.
 *
 * Vive en código: agregar una pregunta no requiere migración (las respuestas
 * son un jsonb por clave) y las respuestas viejas siguen siendo legibles.
 * NO renombrar una `key` ya usada: dejaría huérfanas las respuestas guardadas.
 * Módulo puro: lo importan servidor y cliente.
 */

export type Option = { value: string; label: string };

export type Question =
  | { key: string; label: string; help?: string; type: "text" | "textarea" | "number" | "date" }
  | { key: string; label: string; help?: string; type: "select" | "multi"; options: Option[] };

export type Section = { key: string; title: string; intro: string; questions: Question[] };

const opt = (pairs: [string, string][]): Option[] => pairs.map(([value, label]) => ({ value, label }));

const YES_NO_UNKNOWN = opt([
  ["yes", "Sí"],
  ["no", "No"],
  ["unknown", "No se sabe"],
]);

const INTEREST = opt([
  ["yes", "Sí"],
  ["maybe", "Tal vez"],
  ["no", "No"],
]);

export const ASSESSMENT_SECTIONS: Section[] = [
  {
    key: "profile",
    title: "Perfil de la empresa",
    intro: "El tamaño del entorno: de aquí salen las cantidades de cualquier propuesta.",
    questions: [
      { key: "profile.users", label: "Usuarios con correo o cuenta", type: "number", help: "Personas que usan correo corporativo o inician sesión en un equipo." },
      { key: "profile.devices", label: "Equipos de cómputo (PC y laptops)", type: "number" },
      { key: "profile.servers", label: "Servidores (físicos y virtuales)", type: "number" },
      { key: "profile.sites", label: "Sedes u oficinas", type: "number" },
      {
        key: "profile.it_support",
        label: "¿Quién atiende TI hoy?",
        type: "select",
        options: opt([
          ["internal", "Personal interno"],
          ["external", "Proveedor externo"],
          ["mixed", "Interno con apoyo externo"],
          ["informal", "Nadie en particular"],
        ]),
      },
      { key: "profile.critical_systems", label: "Sistemas críticos para operar", type: "textarea", help: "ERP, facturación, sistemas de producción… lo que si se cae, detiene a la empresa." },
    ],
  },
  {
    key: "domains",
    title: "Dominios y DNS",
    intro: "Quien controla el dominio controla el correo y el sitio. Es el riesgo más común y el más barato de corregir.",
    questions: [
      { key: "domains.primary", label: "Dominio principal", type: "text", help: "Por ejemplo: empresa.com.mx. Anota aquí también dominios adicionales." },
      { key: "domains.registrar", label: "Registrador", type: "text", help: "GoDaddy, Akky, Namecheap, Google…" },
      {
        key: "domains.owner",
        label: "¿Quién controla la cuenta del registrador?",
        type: "select",
        options: opt([
          ["company", "La empresa, con cuenta propia"],
          ["provider", "Un proveedor externo"],
          ["employee", "Un empleado o exempleado, a título personal"],
          ["unknown", "No se sabe"],
        ]),
      },
      { key: "domains.dns_host", label: "¿Dónde se administra el DNS?", type: "text", help: "Registrador, Cloudflare, el hosting…" },
      { key: "domains.renewal", label: "Próxima renovación del dominio", type: "date" },
    ],
  },
  {
    key: "hosting",
    title: "Sitio web y alojamiento",
    intro: "Dónde vive el sitio y quién puede entrar a él.",
    questions: [
      { key: "hosting.has_site", label: "¿Tiene sitio web?", type: "select", options: YES_NO_UNKNOWN },
      { key: "hosting.provider", label: "Proveedor de alojamiento", type: "text" },
      { key: "hosting.admin", label: "¿Quién lo administra y tiene los accesos?", type: "text" },
      { key: "hosting.ssl", label: "¿Certificado SSL vigente?", type: "select", options: YES_NO_UNKNOWN },
      { key: "hosting.backup", label: "¿El sitio tiene respaldo?", type: "select", options: YES_NO_UNKNOWN },
    ],
  },
  {
    key: "email",
    title: "Correo y colaboración",
    intro: "Dónde está el servidor de correo y qué tan protegido está: la mayoría de los incidentes empieza aquí.",
    questions: [
      {
        key: "email.platform",
        label: "¿Dónde está el correo?",
        type: "select",
        options: opt([
          ["m365", "Microsoft 365"],
          ["google", "Google Workspace"],
          ["hosting", "Correo del hosting (cPanel o similar)"],
          ["exchange", "Servidor Exchange propio"],
          ["other", "Otro"],
          ["unknown", "No se sabe"],
        ]),
      },
      { key: "email.plan", label: "Plan o licencia actual", type: "text", help: "Business Basic, Standard, Workspace Starter…" },
      { key: "email.mailboxes", label: "Número de buzones", type: "number" },
      {
        key: "email.mfa",
        label: "Doble factor (MFA) en el correo",
        type: "select",
        options: opt([
          ["all", "En todas las cuentas"],
          ["some", "Solo en algunas"],
          ["none", "En ninguna"],
          ["unknown", "No se sabe"],
        ]),
      },
      {
        key: "email.filtering",
        label: "Filtrado de spam y phishing",
        type: "select",
        options: opt([
          ["native", "El que incluye la plataforma"],
          ["advanced", "Solución avanzada o de terceros"],
          ["none", "Ninguno"],
          ["unknown", "No se sabe"],
        ]),
      },
      {
        key: "email.auth_records",
        label: "SPF, DKIM y DMARC",
        type: "select",
        options: opt([
          ["all", "Los tres configurados"],
          ["partial", "Parcial"],
          ["none", "Ninguno"],
          ["unknown", "No se sabe"],
        ]),
      },
      { key: "email.backup", label: "¿Se respalda el correo?", type: "select", options: YES_NO_UNKNOWN },
      {
        key: "email.office",
        label: "Paquetería de oficina",
        type: "select",
        options: opt([
          ["m365", "Microsoft 365 por suscripción"],
          ["perpetual", "Office de pago único (2016, 2019, 2021…)"],
          ["mixed", "Mezclada o sin licenciar"],
          ["other", "Otra (Google, LibreOffice…)"],
        ]),
      },
    ],
  },
  {
    key: "endpoints",
    title: "Protección de dispositivos",
    intro: "Qué protege a los equipos, quién lo vigila y cuándo vence.",
    questions: [
      {
        key: "endpoints.type",
        label: "Tipo de protección actual",
        type: "select",
        options: opt([
          ["edr", "EDR o XDR"],
          ["antivirus", "Antivirus tradicional"],
          ["defender", "Solo Windows Defender"],
          ["none", "Ninguna"],
          ["unknown", "No se sabe"],
        ]),
      },
      { key: "endpoints.product", label: "Producto y fabricante", type: "text", help: "ESET, Kaspersky, Bitdefender, Sophos…" },
      { key: "endpoints.console", label: "¿Se administra desde una consola central?", type: "select", options: YES_NO_UNKNOWN },
      { key: "endpoints.expiry", label: "Vencimiento de las licencias", type: "date" },
      {
        key: "endpoints.os",
        label: "Sistemas operativos en uso",
        type: "multi",
        options: opt([
          ["win11", "Windows 11"],
          ["win10", "Windows 10"],
          ["win_old", "Windows anteriores"],
          ["macos", "macOS"],
          ["linux", "Linux"],
          ["win_server", "Windows Server"],
        ]),
      },
      {
        key: "endpoints.encryption",
        label: "Cifrado de disco en laptops",
        type: "select",
        options: opt([
          ["all", "En todas"],
          ["some", "En algunas"],
          ["none", "En ninguna"],
          ["unknown", "No se sabe"],
        ]),
      },
    ],
  },
  {
    key: "backups",
    title: "Respaldos",
    intro: "Si hay respaldo, de qué, dónde queda y si alguna vez se probó restaurar.",
    questions: [
      {
        key: "backups.scope",
        label: "¿Qué se respalda hoy?",
        type: "multi",
        options: opt([
          ["servers", "Servidores"],
          ["workstations", "Equipos de usuario"],
          ["databases", "Bases de datos o ERP"],
          ["nas", "NAS o carpetas compartidas"],
          ["cloud", "Correo y archivos en la nube"],
          ["nothing", "Nada"],
        ]),
      },
      { key: "backups.tool", label: "Herramienta de respaldo", type: "text", help: "Veeam, Acronis, copia manual, la del NAS…" },
      {
        key: "backups.destination",
        label: "¿Dónde quedan las copias?",
        type: "multi",
        options: opt([
          ["usb", "Disco externo o USB"],
          ["nas", "NAS en la oficina"],
          ["cloud", "Nube"],
          ["offsite", "Otra sede"],
        ]),
      },
      {
        key: "backups.frequency",
        label: "Frecuencia",
        type: "select",
        options: opt([
          ["daily", "Diaria o más"],
          ["weekly", "Semanal"],
          ["manual", "Manual, cuando alguien se acuerda"],
          ["unknown", "No se sabe"],
        ]),
      },
      { key: "backups.offsite", label: "¿Hay una copia fuera del sitio que no se pueda borrar?", type: "select", options: YES_NO_UNKNOWN },
      {
        key: "backups.restore_test",
        label: "Última prueba de restauración",
        type: "select",
        options: opt([
          ["recent", "En los últimos 3 meses"],
          ["year", "En el último año"],
          ["never", "Nunca"],
          ["unknown", "No se sabe"],
        ]),
      },
      { key: "backups.volume_tb", label: "Volumen aproximado de datos (TB)", type: "number" },
    ],
  },
  {
    key: "network",
    title: "Red y acceso remoto",
    intro: "Lo mínimo para saber por dónde se entra a la red.",
    questions: [
      { key: "network.firewall", label: "Firewall (marca y modelo)", type: "text", help: "O «el módem del proveedor» si no hay uno." },
      {
        key: "network.remote_access",
        label: "Acceso remoto",
        type: "select",
        options: opt([
          ["vpn", "VPN"],
          ["rdp", "Escritorio remoto abierto a internet"],
          ["tools", "Herramientas tipo AnyDesk o TeamViewer"],
          ["none", "No hay"],
          ["unknown", "No se sabe"],
        ]),
      },
      { key: "network.guest_wifi", label: "¿Red de invitados separada?", type: "select", options: YES_NO_UNKNOWN },
    ],
  },
  {
    key: "people",
    title: "Usuarios y capacitación",
    intro: "El factor humano y el interés en capacitar al personal.",
    questions: [
      {
        key: "people.training",
        label: "Capacitación en ciberseguridad",
        type: "select",
        options: opt([
          ["regular", "Periódica"],
          ["once", "Alguna vez"],
          ["never", "Nunca"],
        ]),
      },
      { key: "people.training_interest", label: "¿Interés en capacitar a los usuarios?", type: "select", options: INTEREST },
      { key: "people.phishing_interest", label: "¿Interés en simulaciones de phishing?", type: "select", options: INTEREST },
      { key: "people.incidents", label: "Incidentes previos", type: "textarea", help: "Ransomware, correos suplantados, pérdida de información, fraudes… y cuándo." },
    ],
  },
  {
    key: "priorities",
    title: "Prioridades",
    intro: "Qué le preocupa al cliente y con qué urgencia, para ordenar las propuestas.",
    questions: [
      { key: "priorities.concern", label: "Principal preocupación", type: "textarea" },
      { key: "priorities.compliance", label: "Requisitos de terceros", type: "textarea", help: "Auditorías, exigencias de clientes, aseguradoras, normas." },
      {
        key: "priorities.timeline",
        label: "Horizonte de decisión",
        type: "select",
        options: opt([
          ["now", "Inmediato"],
          ["quarter", "Este trimestre"],
          ["year", "Este año"],
          ["exploring", "Solo explorando"],
        ]),
      },
    ],
  },
];

export const ALL_QUESTIONS: Question[] = ASSESSMENT_SECTIONS.flatMap((s) => s.questions);

export type Answers = Record<string, string | string[]>;

/**
 * Deja solo respuestas a preguntas que existen y con el tipo correcto: una
 * opción fuera del catálogo, un número negativo o una clave desconocida se
 * descartan. Lo vacío no se guarda. Es la validación del servidor.
 */
export function sanitizeAnswers(raw: unknown): Answers {
  if (typeof raw !== "object" || raw === null) return {};
  const input = raw as Record<string, unknown>;
  const out: Answers = {};
  for (const q of ALL_QUESTIONS) {
    const value = input[q.key];
    if (q.type === "multi") {
      if (!Array.isArray(value)) continue;
      const valid = q.options.map((o) => o.value).filter((v) => value.includes(v));
      if (valid.length > 0) out[q.key] = valid;
      continue;
    }
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (text === "") continue;
    if (q.type === "select") {
      if (q.options.some((o) => o.value === text)) out[q.key] = text;
    } else if (q.type === "number") {
      const n = Number(text);
      if (Number.isFinite(n) && n >= 0 && n <= 1_000_000) out[q.key] = String(n);
    } else if (q.type === "date") {
      if (/^\d{4}-\d{2}-\d{2}$/.test(text)) out[q.key] = text;
    } else {
      out[q.key] = text.slice(0, q.type === "textarea" ? 2000 : 200);
    }
  }
  return out;
}

/** Respuesta legible de una pregunta, o null si no se contestó. */
export function answerLabel(q: Question, answers: Answers): string | null {
  const value = answers[q.key];
  if (value === undefined) return null;
  if (q.type === "multi") {
    const list = Array.isArray(value) ? value : [value];
    return q.options.filter((o) => list.includes(o.value)).map((o) => o.label).join(", ") || null;
  }
  if (Array.isArray(value)) return null;
  if (q.type === "select") return q.options.find((o) => o.value === value)?.label ?? null;
  return value;
}

export function answeredCount(answers: Answers): number {
  return ALL_QUESTIONS.filter((q) => answers[q.key] !== undefined).length;
}
