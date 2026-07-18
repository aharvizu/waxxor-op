# Plantillas de Recurrencia

> Status: shipped 2026-07-18, parte de Recurrentes. Schemas discriminados en `src/lib/recurrence.ts` (`templateDataSchema`), render en `renderTemplate`.

## `templateData` — jsonb validado, no campos libres

Cada `RecurrenceDefinition` guarda `templateData` como jsonb, pero **nunca acepta campos arbitrarios**: se valida contra `z.discriminatedUnion("targetType", [...])` tanto al crear como al editar, en el servidor (`createRecurrence`/`updateRecurrence`), antes de persistir. Un JSON con campos no declarados o mal tipados se rechaza con un error específico — spec §30: "no aceptar campos arbitrarios en templateData".

## Plantilla de Activity / Project Activity

`title`, `description`, `activityType` (reutiliza `ACTIVITY_TYPES` de Activities — cero duplicación), `priority`, `dueOffsetDays`/`startOffsetDays` (días naturales relativos a la fecha de la ocurrencia), `estimatedMinutes`. `project_activity` es el mismo schema con `targetType: "project_activity"`; el `projectId`/`projectListId` viven en la `RecurrenceDefinition`, no en la plantilla (son contexto, no plantilla — evita repetirlos en cada ocurrencia y permite validarlos una sola vez por definición).

Generación: `createWorkItem(tx, actor, { type: "activity", ... })` + insert en `activities` con `projectId`/`projectListId` cuando aplica — **exactamente el mismo primitivo que usan las actions de Activities y Proyectos**, nunca una inserción paralela.

## Plantilla de Ticket

`title`, `description`, `priority`, `category` (requerida), `subcategory`, `channel`, `modality`, `slaDefinitionId` opcional, `contactId` opcional, `dueOffsetDays`. El ticket generado **inicia con las reglas oficiales del ciclo de vida** (`status: "new"` o `"assigned"` según haya responsable, folio por secuencia, snapshot de SLA vía `resolveSlaDefinition`/`buildSlaSnapshot` — los mismos que usa `createTicket`). `billingStatus` inicial es siempre el default de la tabla (`pending_review`) — **nunca se asume facturable automáticamente** (spec §6).

Reglas de validación previas a generar:
- Cliente requerido (los tickets siempre pertenecen a un cliente); si el cliente configurado está `archived`/`inactive`, la ejecución falla con `client_archived` (error de configuración, no reintenta indefinidamente).
- `slaDefinitionId`, si se configuró, debe existir y estar activo en la organización — se valida al guardar la recurrencia (`validateSlaDefinition`) **y** de nuevo en cada ejecución (por si el SLA se desactivó después).
- `contactId`, si se configuró, debe existir — si desapareció, falla con `contact_missing`.

## Plantilla de Reporte (reservada, no generable)

`reportTemplateSchema` existe (`title`, `templateId`, `dueOffsetDays`) pero `ENABLED_TARGET_TYPES` excluye `"report"` de la creación — ver `docs/features/recurring.md` §Reportes. Si una definición llegara a tener `targetType: "report"` (solo posible manualmente, nunca vía UI), el motor la rechaza con `target_unsupported` (error permanente, no reintentable).

## Variables dinámicas

Lista blanca cerrada (`TEMPLATE_VARIABLES`) — **no hay ejecución de código, no hay acceso arbitrario a objetos**:

| Variable | Resuelve a |
|---|---|
| `{{client.name}}` | Nombre del cliente de contexto |
| `{{contact.name}}` | Nombre del contacto (solo tickets con `contactId`) |
| `{{project.name}}` | Nombre del proyecto de contexto |
| `{{recurrence.name}}` | Nombre de la recurrencia |
| `{{occurrence.date}}` | Fecha local de la ocurrencia (YYYY-MM-DD) |
| `{{occurrence.month}}` | Mes en español ("julio") |
| `{{occurrence.year}}` | Año |
| `{{period.start}}` / `{{period.end}}` | Primer/último día del mes de la ocurrencia |
| `{{assignee.name}}` | Nombre del responsable |

`renderTemplate(text, ctx)` reemplaza cada `{{variable}}`:
- **Variable no reconocida** → `TemplateRenderError("unknown")` — la ejecución falla con `variable_unresolved` (error de configuración), nunca inyecta el texto sin reemplazar ni ejecuta nada.
- **Variable reconocida sin valor en el contexto actual** (ej. `{{contact.name}}` en una recurrencia sin `contactId`) → `TemplateRenderError("unresolved")`, mismo tratamiento — **error visible, nunca un valor vacío silencioso**.
- El regex de reemplazo (`/\{\{\s*([\w.]+)\s*\}\}/g`) solo captura identificadores `[\w.]+` — no hay forma de inyectar expresiones, funciones ni HTML/JS a través de una plantilla.

## Preview antes de guardar

El asistente (`RecurrenceWizard`, client component) importa las **mismas funciones puras** (`renderTemplate`, `computeNextRun`, `nextOccurrencesLocal`, `describeSchedule`) directamente — no hay una llamada al servidor para la previsualización. El paso "Revisión" muestra en tiempo real: la regla en lenguaje natural, las próximas 5 ocurrencias, el título renderizado con el contexto actual, y una lista de "campos faltantes o advertencias" (incluye errores de variable) que **bloquea el botón "Guardar y activar"** hasta resolverse — nunca se puede activar con una validación bloqueante pendiente.
