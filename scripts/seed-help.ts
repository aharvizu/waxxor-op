import { config } from "dotenv";
config({ path: [".env.local", ".env"] });

/**
 * Seeds the 10 base Help Center tutorials (spec §"Contenido inicial") — one
 * per module, documenting only features that are actually implemented today.
 * Idempotent: upserts by slug, replaces its steps so re-running keeps content
 * in sync with this file (no duplicate rows on repeated runs).
 */

type StepSeed = { title: string; body: string; screenshotPlaceholder?: string };
type TutorialSeed = {
  slug: string;
  module: string;
  title: string;
  objective: string;
  moduleHref: string;
  tips: string[];
  commonMistakes: string[];
  steps: StepSeed[];
};

const TUTORIALS: TutorialSeed[] = [
  {
    slug: "usar-hoy",
    module: "today",
    title: "Cómo usar Hoy",
    objective: "Entender tu pantalla de inicio: qué atender primero y qué no olvidar.",
    moduleHref: "/today",
    tips: [
      "Usa el selector de alcance (Mi trabajo / Mi equipo / Toda la organización) para cambiar lo que ves sin perder tus filtros.",
      "Los indicadores del Resumen del día son enlaces — haz clic para filtrar directamente.",
    ],
    commonMistakes: [
      "Ignorar la sección 'No olvides' — está diseñada para no perder seguimientos, no es opcional.",
      "Posponer un recordatorio en vez de resolverlo cuando ya se atendió.",
    ],
    steps: [
      { title: "Abre Hoy", body: "Al iniciar sesión llegas directo a /today — es tu pantalla operativa diaria.", screenshotPlaceholder: "Captura: encabezado de Hoy con saludo y resumen" },
      { title: "Revisa Atención inmediata", body: "Lista ordenada por urgencia real (SLA vencido, crítico sin respuesta, etc.) — máximo 5 elementos.", screenshotPlaceholder: "Captura: tarjeta Atención inmediata" },
      { title: "Recorre No olvides", body: "Recordatorios deterministas (confirmaciones pendientes, actividades sin responsable, renovaciones próximas…). Pospón o marca como resuelto.", screenshotPlaceholder: "Captura: sección No olvides con acciones" },
      { title: "Usa Mi trabajo", body: "Lista inteligente, Agenda o Tabla — cambia de vista según prefieras trabajar.", screenshotPlaceholder: "Captura: selector de vistas de Mi trabajo" },
    ],
  },
  {
    slug: "crear-resolver-ticket",
    module: "tickets",
    title: "Cómo crear y resolver un Ticket",
    objective: "Registrar un ticket de soporte y llevarlo hasta el cierre correctamente.",
    moduleHref: "/helpdesk/new",
    tips: [
      "El SLA se asigna automáticamente según la prioridad — puedes verlo en el panel derecho del detalle.",
      "Registra el primer response cuanto antes: congela el cumplimiento de SLA de primera respuesta.",
    ],
    commonMistakes: [
      "Cerrar sin registrar tiempo cuando sí se trabajó — requiere una excepción auditada.",
      "Dejar la clasificación de cobro en 'Pendiente de revisión' indefinidamente.",
    ],
    steps: [
      { title: "Crea el ticket", body: "Desde Helpdesk → Nuevo ticket: asunto, cliente, prioridad y, si aplica, SLA explícito (solo SuperAdmin).", screenshotPlaceholder: "Captura: formulario Nuevo ticket" },
      { title: "Trabaja el ticket", body: "Regístra mensajes, notas internas y tiempo desde la pestaña Conversation/Time del detalle.", screenshotPlaceholder: "Captura: pestañas del detalle de ticket" },
      { title: "Resuélvelo", body: "Botón Resolve: documenta la resolución, categoría y decide el siguiente estado.", screenshotPlaceholder: "Captura: formulario de resolución" },
      { title: "Ciérralo", body: "El cierre exige resolución, categoría, tipo de confirmación y tiempo registrado (o una excepción auditada).", screenshotPlaceholder: "Captura: formulario de cierre" },
    ],
  },
  {
    slug: "ticket-a-kb",
    module: "knowledge",
    title: "Cómo convertir la solución de un Ticket en un artículo de KB",
    objective: "Reutilizar el conocimiento de un ticket resuelto sin filtrar datos sensibles.",
    moduleHref: "/knowledge",
    tips: [
      "Usa 'Anonimizar' cuando el problema es genérico y quieres compartirlo ampliamente.",
      "El artículo siempre nace en borrador — revísalo y complétalo antes de enviarlo a revisión.",
    ],
    commonMistakes: [
      "Copiar notas internas o datos de cobro dentro del campo Solución — el formulario no los precarga a propósito.",
      "Esperar que el artículo se publique solo — siempre requiere revisión y publicación manual.",
    ],
    steps: [
      { title: "Resuelve el ticket", body: "La opción 'Crear artículo de conocimiento' aparece en la pestaña Resolution una vez que el ticket tiene una resolución escrita.", screenshotPlaceholder: "Captura: botón Crear artículo de conocimiento" },
      { title: "Completa el formulario", body: "Título, problema, causa, solución y pasos vienen precargados desde el ticket — edítalos y decide si anonimizar cliente/contacto.", screenshotPlaceholder: "Captura: formulario de creación desde ticket" },
      { title: "Revisa el borrador", body: "El artículo aparece en /knowledge como borrador, vinculado al ticket de origen.", screenshotPlaceholder: "Captura: artículo en borrador con ticket de origen" },
      { title: "Envíalo a revisión y publícalo", body: "Un Project Manager revisa; Administrator/Director/SuperAdmin publican.", screenshotPlaceholder: "Captura: flujo de estado del artículo" },
    ],
  },
  {
    slug: "crear-actividad",
    module: "activities",
    title: "Cómo crear una Actividad",
    objective: "Registrar trabajo interno o de seguimiento que no es un ticket.",
    moduleHref: "/activities/new",
    tips: [
      "Una actividad puede existir sin cliente — útil para trabajo interno.",
      "Convertir una actividad en ticket preserva su historial (folio nuevo, misma línea de tiempo).",
    ],
    commonMistakes: [
      "Crear un ticket cuando en realidad es seguimiento interno sin cliente afectado.",
      "Olvidar asignar responsable — las actividades sin responsable aparecen como recordatorio en Hoy.",
    ],
    steps: [
      { title: "Crea la actividad", body: "Desde Activities → Nueva actividad: tipo, prioridad, cliente opcional y fecha.", screenshotPlaceholder: "Captura: formulario Nueva actividad" },
      { title: "Trabájala", body: "Cambia de estado (pendiente → en progreso → completada), registra tiempo y adjunta archivos.", screenshotPlaceholder: "Captura: detalle de actividad" },
      { title: "Conviértela si escala", body: "Si se vuelve un caso de soporte formal, usa 'Convert to ticket' desde el detalle.", screenshotPlaceholder: "Captura: botón Convert to ticket" },
    ],
  },
  {
    slug: "gestionar-proyecto",
    module: "projects",
    title: "Cómo gestionar un Proyecto",
    objective: "Usar la jerarquía Proyecto → Listas → Actividades para coordinar trabajo con fecha objetivo.",
    moduleHref: "/projects/new",
    tips: [
      "Una plantilla de proyecto (Configuración → Proyectos) crea todas sus listas de una vez.",
      "La salud sugerida es solo una sugerencia — el valor manual nunca se sobreescribe solo.",
    ],
    commonMistakes: [
      "Intentar completar el proyecto con actividades abiertas sin usar la excepción auditada.",
      "Olvidar que los tickets nunca pertenecen a un proyecto — son actividades quienes sí.",
    ],
    steps: [
      { title: "Crea el proyecto", body: "Nombre, cliente opcional, Project Manager obligatorio y, si quieres, una plantilla que cree las listas.", screenshotPlaceholder: "Captura: formulario Nuevo proyecto" },
      { title: "Organiza el trabajo", body: "Pestaña Trabajo: crea listas y actividades, mueve entre listas, usa subactividades (máx. 2 niveles).", screenshotPlaceholder: "Captura: pestaña Trabajo del proyecto" },
      { title: "Da seguimiento", body: "Hitos, riesgos y avance calculado viven en sus propias pestañas del detalle.", screenshotPlaceholder: "Captura: pestañas Hitos y Riesgos" },
      { title: "Complétalo", body: "Requiere que no queden actividades abiertas, salvo excepción explícita y auditada.", screenshotPlaceholder: "Captura: diálogo de completar proyecto" },
    ],
  },
  {
    slug: "consultar-cliente-360",
    module: "companies",
    title: "Cómo consultar Empresa 360",
    objective: "Ver todo lo operativo de una empresa en una sola pantalla.",
    moduleHref: "/companies",
    tips: [
      "La pestaña Renovaciones consolida servicios y contratos próximos a vencer — misma fuente que las alertas de Hoy.",
      "El historial legible está disponible para todos los roles internos; el registro técnico solo para SuperAdmin/Administrator.",
    ],
    commonMistakes: [
      "Buscar permisos por empresa — no existen en el MVP por decisión de producto.",
      "No revisar la pestaña Cobros antes de cerrar el mes.",
    ],
    steps: [
      { title: "Abre la empresa", body: "Desde /companies, busca o filtra y entra al detalle.", screenshotPlaceholder: "Captura: listado de empresas" },
      { title: "Recorre las pestañas", body: "Contactos, Servicios, Contratos, Renovaciones, Tickets, Actividades, Proyectos, Recurrentes, Conversaciones, Tiempo, Cobros, Reportes, Conocimiento, Notas, Historial.", screenshotPlaceholder: "Captura: pestañas de Empresa 360" },
      { title: "Atiende las alertas", body: "Los banners superiores resumen tickets vencidos, SLA en riesgo, cobros pendientes y renovaciones próximas.", screenshotPlaceholder: "Captura: banners de alerta" },
    ],
  },
  {
    slug: "crear-recurrencia",
    module: "recurring",
    title: "Cómo crear una recurrencia",
    objective: "Automatizar la generación de actividades, tickets o reportes con una regla de horario.",
    moduleHref: "/recurring/new",
    tips: [
      "El motor nunca reintenta solo un fallo — usa Reintentar o Backfill manualmente.",
      "Una recurrencia de reporte solo crea el borrador; nunca aprueba ni envía automáticamente.",
    ],
    commonMistakes: [
      "Configurar una zona horaria distinta a la del cliente sin darse cuenta — la hora se interpreta en la zona de la recurrencia.",
      "No revisar 'Vencidas' tras una caída del cron — el Backfill cubre huecos, pero hay que dispararlo.",
    ],
    steps: [
      { title: "Elige qué generar", body: "Actividad, Ticket, Actividad de proyecto o Reporte — cada uno con su propia plantilla.", screenshotPlaceholder: "Captura: selector de tipo de recurrencia" },
      { title: "Define el horario", body: "Frecuencia (diaria/semanal/mensual/…), hora y zona horaria IANA.", screenshotPlaceholder: "Captura: configuración de horario" },
      { title: "Actívala", body: "Solo las recurrencias activas generan — revisa la próxima ejecución antes de confirmar.", screenshotPlaceholder: "Captura: confirmación de activación" },
      { title: "Da seguimiento", body: "El detalle muestra historial de ejecuciones, éxitos, fallos y el botón Ejecutar ahora.", screenshotPlaceholder: "Captura: historial de ejecuciones" },
    ],
  },
  {
    slug: "generar-reporte",
    module: "reports",
    title: "Cómo generar un Reporte",
    objective: "Crear un reporte operativo con métricas reales de un periodo, listo para revisión.",
    moduleHref: "/reports/new",
    tips: [
      "El PDF se genera desde la vista de impresión del navegador — no hay proveedor externo.",
      "Cada regeneración crea una nueva versión; las anteriores quedan como evidencia congelada.",
    ],
    commonMistakes: [
      "Editar un reporte aprobado esperando que siga aprobado — la edición lo regresa a revisión.",
      "Marcar como enviado sin haberlo aprobado primero (posible, pero requiere justificar la excepción).",
    ],
    steps: [
      { title: "Crea el reporte", body: "Tipo, cliente (si aplica), periodo y plantilla.", screenshotPlaceholder: "Captura: formulario Nuevo reporte" },
      { title: "Genera el contenido", body: "El sistema calcula métricas reales del periodo y redacta un resumen narrativo determinista.", screenshotPlaceholder: "Captura: reporte generado con métricas" },
      { title: "Revisa y aprueba", body: "Un Project Manager o superior revisa; Administrator/Director/SuperAdmin aprueban y marcan como enviado.", screenshotPlaceholder: "Captura: flujo de aprobación" },
      { title: "Exporta", body: "PDF (vista de impresión) o CSV con los datos del snapshot congelado.", screenshotPlaceholder: "Captura: botones de exportación" },
    ],
  },
  {
    slug: "consultar-indicadores",
    module: "indicators",
    title: "Cómo consultar Indicadores",
    objective: "Leer los paneles ejecutivos de operación, negocio y cobro con datos reales.",
    moduleHref: "/indicators",
    tips: [
      "Cada métrica tiene un tooltip con su fórmula exacta — nunca adivines cómo se calculó.",
      "'No disponible' significa que no hay suficientes datos, no que el valor sea cero.",
    ],
    commonMistakes: [
      "Comparar contra un periodo anterior cuando el sistema indica que no hay datos previos.",
      "Confundir los umbrales configurables con reglas fijas — Configuración → Indicadores los administra.",
    ],
    steps: [
      { title: "Elige el periodo y alcance", body: "Selector de periodo y, si aplica, cliente/usuario.", screenshotPlaceholder: "Captura: selector de periodo en Indicadores" },
      { title: "Revisa el panel Ejecutivo", body: "Atención ejecutiva, scorecard y salud de clientes.", screenshotPlaceholder: "Captura: panel ejecutivo" },
      { title: "Explora Operación y Cobro", body: "Carga por técnico, categorías, tiempo y agregados de cobro (Watson no factura).", screenshotPlaceholder: "Captura: panel de operación" },
      { title: "Usa el drill-down", body: "Cada métrica enlaza a la vista operativa correspondiente para ver el detalle real.", screenshotPlaceholder: "Captura: enlace de drill-down" },
    ],
  },
  {
    slug: "administrar-configuracion",
    module: "settings",
    title: "Cómo administrar Configuración",
    objective: "Configurar la organización sin intervención técnica: usuarios, catálogos, umbrales y más.",
    moduleHref: "/settings",
    tips: [
      "Solo SuperAdmin administra Usuarios, API Keys, Entorno y el calendario laboral.",
      "Desactivar un usuario permite reasignar su trabajo abierto en la misma acción.",
    ],
    commonMistakes: [
      "Buscar edición de contenido de tutoriales en Configuración → Ayuda — solo se activan/desactivan, el contenido vive en código.",
      "Olvidar que los catálogos de tickets (categoría/subcategoría) siguen siendo texto libre — el catálogo solo sugiere valores.",
    ],
    steps: [
      { title: "Explora las secciones", body: "Organización, Usuarios, Roles y permisos, catálogos por módulo, Recurrentes, Reportes, Indicadores.", screenshotPlaceholder: "Captura: navegación de Configuración" },
      { title: "Invita a un usuario", body: "Configuración → Usuarios → Invitar: genera un enlace de un solo uso (sin correo real).", screenshotPlaceholder: "Captura: formulario de invitación" },
      { title: "Administra catálogos", body: "Categorías de tickets, plantillas de proyecto, categorías de Conocimiento, etc.", screenshotPlaceholder: "Captura: administrador de categorías" },
      { title: "Revisa Salud del sistema", body: "Estado del scheduler, última ejecución de recurrencias, migraciones y versión.", screenshotPlaceholder: "Captura: panel de salud del sistema" },
    ],
  },
];

async function main() {
  const { eq } = await import("drizzle-orm");
  const { db } = await import("../src/db");
  const { helpTutorials, helpTutorialSteps } = await import("../src/db/schema");

  for (const t of TUTORIALS) {
    const [existing] = await db.select().from(helpTutorials).where(eq(helpTutorials.slug, t.slug));
    const values = {
      module: t.module as (typeof helpTutorials.$inferInsert)["module"],
      title: t.title,
      objective: t.objective,
      moduleHref: t.moduleHref,
      tips: t.tips,
      commonMistakes: t.commonMistakes,
    };
    let tutorialId: number;
    if (existing) {
      tutorialId = existing.id;
      await db.update(helpTutorials).set({ ...values, updatedAt: new Date() }).where(eq(helpTutorials.id, tutorialId));
      await db.delete(helpTutorialSteps).where(eq(helpTutorialSteps.tutorialId, tutorialId));
      console.log(`updated: ${t.slug}`);
    } else {
      const [created] = await db.insert(helpTutorials).values({ slug: t.slug, ...values }).returning({ id: helpTutorials.id });
      tutorialId = created.id;
      console.log(`created: ${t.slug}`);
    }
    for (const [i, step] of t.steps.entries()) {
      await db.insert(helpTutorialSteps).values({
        tutorialId,
        position: i + 1,
        title: step.title,
        body: step.body,
        screenshotPlaceholder: step.screenshotPlaceholder ?? null,
      });
    }
  }

  console.log(`\nSeeded ${TUTORIALS.length} tutorials.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
