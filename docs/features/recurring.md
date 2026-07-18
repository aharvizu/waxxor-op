# Recurrentes

> Status: shipped 2026-07-18. Motor operativo de recurrencias — genera Actividades, Tickets y Actividades de Proyecto automáticamente, con trazabilidad completa e idempotencia garantizada.
> Rutas: **/recurring** (directorio), **/recurring/new**, **/recurring/[id]** (detalle con 5 pestañas).
> Regla central: una recurrencia representa **trabajo operativo que Watson crea, asigna y supervisa** — no es solo una fecha repetitiva.

## Objetivo

Automatizar trabajo que se olvida con facilidad (respaldos mensuales, mantenimientos trimestrales, renovaciones anuales) generando objetos **reales** a través de los servicios de dominio existentes — nunca insertando WorkItem/Activity/Ticket directamente desde la UI, nunca simulando contenido.

## Jerarquía

```
RecurrenceDefinition (la regla + plantilla)
  → RecurrenceExecution (una fila por ocurrencia intentada)
    → objeto generado (Activity | Ticket | Project Activity)
```

## Modelo (migración `drizzle/0016_regular_wildside.sql`)

**`recurrence_definitions`**: `targetType` (activity/ticket/project_activity/report — ver limitación abajo), `status` (draft/active/paused/completed/expired/error/archived), campos de programación tipados (no solo JSON — `frequency`, `interval`, `daysOfWeek` jsonb, `dayOfMonth`, `monthOfYear`, `weekOfMonth`, `timeOfDay`, `timezone`, `startAt`/`endAt`/`maxOccurrences`), contadores (`occurrenceCount`/`successfulCount`/`failedCount`/`skippedCount`/`consecutiveFailedCount`), contexto opcional (`clientId`/`projectId`/`projectListId`/`assigneeId`), `templateData` jsonb (discriminado por `targetType`, validado con Zod — nunca campos arbitrarios). Índice compuesto `(organizationId, status, nextRunAt)` para la consulta del scheduler.

**`recurrence_executions`**: `occurrenceKey` único por `(recurrenceDefinitionId, occurrenceKey)` — **la garantía real de idempotencia vive en este índice de base de datos**, no solo en el código de aplicación. `status` (pending/running/succeeded/failed/skipped/cancelled/duplicate_prevented), `executionSource` (scheduler/manual/retry/backfill), `generatedEntityType`/`generatedEntityId`, `errorCode`/`errorMessage` (acotado a 500 caracteres, nunca stack traces).

Ver `docs/features/recurrence-scheduling.md`, `recurrence-executions.md`, `recurrence-templates.md` y `docs/architecture/recurrence-idempotency.md` para el detalle de cada pieza.

## Reglas de negocio implementadas

1. **draft/paused/completed/expired no generan** — solo `status = "active"` con `isActive = true` es elegible para el scheduler.
2. **`endAt` y `maxOccurrences` son independientes**; el que se cumpla primero termina la recurrencia (`isExhausted`, pura, unit-tested).
3. **`nextRunAt` se calcula de forma determinística** en `src/lib/recurrence.ts` (sin dependencias) y se **almacena en UTC**; la hora configurada se interpreta en la `timezone` IANA de la recurrencia, nunca en la del servidor.
4. **DST no duplica ni pierde ocurrencias** — la clave de ocurrencia es la fecha local calendario, no el instante UTC; `zonedTimeToUtc` resuelve saltos de horario de verano con una corrección de dos pasadas (unit-tested contra América/Nueva York 2026).
5. **Solo SuperAdmin elimina permanentemente**, y solo si la recurrencia nunca generó objetos exitosos (`deleteRecurrence` bloquea con mensaje claro — usa Archivar).
6. **`organizationId` nunca viene del navegador** — toda action lo toma de la sesión; todo id foráneo (cliente/proyecto/lista/responsable/SLA) se revalida dentro de la organización antes de guardar o ejecutar.

## Motor de ejecución (`src/lib/recurrence-engine.ts`)

Servicio de dominio independiente de la UI, invocado por el cron, las server actions y el runner local. Responsabilidades por ocurrencia: reservar (INSERT con `onConflictDoNothing` sobre el índice único = reserva atómica), renderizar la plantilla, validar el contexto, generar el objeto **reutilizando `createWorkItem`/`resolveSlaDefinition`/`buildSlaSnapshot`** (los mismos primitivos que usan las actions de Activities/Tickets — nunca se reimplementa su lógica), auditar, actualizar la ejecución, calcular `nextRunAt`, actualizar contadores, y completar/expirar/pausar-por-errores cuando corresponde. Cada recurrencia se procesa en su propio `try/catch` dentro del lote — un fallo nunca detiene a las demás.

## Ejecución manual, reintentos, omitir, backfill

Ver `docs/features/recurrence-executions.md` para el detalle completo de cada operación (`runManually`, `retryExecution`, `skipNextOccurrence`, `backfillOccurrences`) y sus garantías transaccionales.

## Reportes: habilitado (2026-07-18)

`targetType = "report"` quedó **habilitado** al shippear la feature Reportes — exactamente la activación prevista: `ENABLED_TARGET_TYPES` lo incluye y el motor crea el Report en **draft** con el periodo resuelto (`periodRule` de la plantilla: mes/semana/trimestre anterior o mes actual), cliente, plantilla, responsable (assignee) y título renderizado con variables. Nunca aprueba ni marca enviado automáticamente; nunca genera contenido falso — la generación de métricas y el flujo de revisión son humanos. La ejecución referencia el reporte (`generatedEntityType = "report"`); idempotencia y errores siguen las reglas normales del motor. Ver `docs/features/reports.md` §Recurrentes y `docs/features/report-generation.md`.

## Permisos (spec §27)

- **Crear recurrencias**: cualquier rol interno (incluye Technician).
- **Editar**: SuperAdmin/Administrator/Director/Project Manager sin restricción; Technician solo las que él mismo creó (`canEditDefinition`).
- **Activar/pausar/reactivar/omitir/ejecutar/duplicar/archivar**: mismos roles que editar.
- **Backfill**: SuperAdmin/Administrator/Director únicamente (Project Manager excluido explícitamente por spec).
- **Eliminación permanente y restauración**: SuperAdmin.
- **Client**: sin acceso (hereda el redirect de `requireUser()`). Sin permisos por cliente, sin recurrencias privadas.

## Rendimiento

Ver "Configuración del scheduler" abajo y `docs/architecture/background-jobs.md`. Índices: `(organizationId, status, nextRunAt)` para la consulta de vencidas, `(recurrenceDefinitionId, scheduledFor)` para el historial, único `(recurrenceDefinitionId, occurrenceKey)` para idempotencia. El directorio limita a 200 filas; el historial de ejecuciones pagina con `limit` (50 por defecto, 100 en la pestaña Historial). Nunca se calculan miles de ocurrencias futuras — la previsualización limita a 5.

## Configuración del scheduler

- **Cron**: `vercel.json` define `*/10 * * * *` (cada 10 minutos) llamando a `GET /api/cron/recurrences`.
- **Variable de entorno requerida**: `CRON_SECRET` — el endpoint responde `503` si no está configurada y `401` si el header `Authorization: Bearer <secret>` no coincide (Vercel Cron lo envía automáticamente al desplegar con esta variable).
- **Lote**: `RECURRENCE_BATCH_LIMIT = 50` por ejecución del cron (`src/lib/recurrence.ts`).
- **Reintentos automáticos**: el motor no reintenta solo — un fallo se registra y queda disponible para reintento manual; tras N fallos consecutivos la recurrencia pasa a `status = "error"` (auditado, `isActive = false`) para evitar reintentos infinitos silenciosos. **N es configurable por organización desde 2026-07-18** (Configuración → Recurrentes, 1–10; el motor lo lee vía `orgFailureLimit` con fallback a `RECURRENCE_MAX_CONSECUTIVE_FAILURES = 3`; verificado en `scripts/verify-settings.ts` con límite 1). La timezone y hora por defecto del asistente también salen de esa sección.
- **Ejecución local sin cron**: `npx tsx scripts/run-recurrences.ts [batchLimit]` — llama exactamente a `runDueRecurrences`, sin necesitar `CRON_SECRET` ni un despliegue.
- **Verificación en producción**: `GET /api/cron/recurrences` con el secreto correcto devuelve `{ ok, processed, succeeded, failed, duplicatePrevented }`; los logs del servidor imprimen inicio/fin con duración. Los mensajes de error nunca salen del endpoint — quedan en `recurrence_executions.error_message`, visible solo dentro de la app a usuarios autenticados.
- **Recuperación ante fallos**: si el cron no corrió por un periodo, usar **Backfill** (SuperAdmin/Administrator/Director) desde el detalle de la recurrencia con el rango de fechas faltante (máx. 31 días, `RECURRENCE_MAX_BACKFILL`).

## Pruebas

- Unitarias (`src/lib/recurrence.test.ts`, 28 casos): diaria/cada N días/laborales, semanal/múltiples días/cada N semanas, mensual (día fijo, último día, primer lunes), trimestral, anual, `endAt`/`maxOccurrences`, timezone y DST (Ciudad de México sin DST, Nueva York con cambio de horario, salto de primavera), render de variables (incluye rechazo de variables no permitidas), taxonomía de errores, descripción legible sin sintaxis cron.
- Integración contra la BD real (`scripts/verify-recurring.ts`, 20 checks): generación real de Activity/Ticket con SLA, idempotencia (misma clave dos veces), **concurrencia real** (dos llamadas `Promise.all` simultáneas — exactamente un ganador), error de configuración (cliente archivado) sin generar objeto, 3 fallos consecutivos auto-pausan y lo auditan, reintento tras corregir el contexto resetea el contador, ejecución manual con su propia clave, aislamiento por organización, rollback si falla la auditoría.
- Smoke HTTP manual: crear recurrencia activa desde el asistente real → aparece en el directorio → "Ejecutar ahora" genera la actividad real con la variable `{{client.name}}` resuelta → aparece en Hoy y en la pestaña Recurrentes de Cliente 360 → pausar → reactivar. Datos de prueba limpiados.

## Limitaciones conocidas (documentadas, no bloqueantes)

1. **Sin días hábiles reales** — los offsets de fecha (`dueOffsetDays`, `startOffsetDays`) usan días naturales; no existe un calendario laboral de referencia para offsets de negocio (el calendario de `business-time.ts` es exclusivo de SLA). Documentado, no simulado.
2. **"Ejecutar primero la ocurrencia pendiente" al reactivar** no está diferenciado de "recalcular desde hoy" en esta fase — ambos modos recalculan `nextRunAt` desde `now()` porque no existe una cola de ocurrencias pendientes separada del cálculo determinístico. El selector existe en la UI (documentando la intención) pero produce el mismo resultado; diferenciarlos requeriría una cola de ocurrencias vencidas por definición, fuera de alcance de esta fase.
3. **Sin dependencias entre recurrencias, sin recurrencia por evento, sin recurrencia de Proyectos** — fuera de alcance explícito (§36).
