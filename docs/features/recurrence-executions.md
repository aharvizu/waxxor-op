# Ejecuciones de Recurrencias

> Status: shipped 2026-07-18, parte de Recurrentes. Tabla `recurrence_executions`; orquestación en `src/lib/recurrence-engine.ts`.

## Modelo

Una fila por **ocurrencia intentada** (no por ocurrencia programada — solo se crea cuando algo la procesa: el scheduler, un clic de "Ejecutar ahora", un reintento o un backfill). Campos clave: `occurrenceKey` (única por definición — ver `docs/architecture/recurrence-idempotency.md`), `scheduledFor`, `startedAt`/`completedAt`, `status`, `attemptCount`, `generatedEntityType`/`generatedEntityId`, `errorCode`/`errorMessage` (acotado, sin datos sensibles), `executedByUserId`, `executionSource`.

## Estados

`pending` (reservada, nunca observable desde fuera de la transacción — se pasa directo a `running`) → `running` → `succeeded` | `failed`. `skipped` se crea directamente (no pasa por `running`). `cancelled` y `duplicate_prevented` son estados terminales que no representan trabajo real: `duplicate_prevented` es el resultado devuelto (no una fila nueva) cuando la reserva de la ocurrencia pierde la carrera — ver idempotencia.

## Origen (`executionSource`)

| Origen | Cuándo | Quién lo dispara |
|---|---|---|
| `scheduler` | Ocurrencia vencida procesada por el cron | Sistema, sin actor humano |
| `manual` | "Ejecutar ahora" u "Omitir siguiente" | Usuario autenticado |
| `retry` | Reintento de una ejecución fallida | Usuario autenticado |
| `backfill` | Generación de ocurrencias faltantes en un rango | SuperAdmin/Administrator/Director |

## Ejecución manual ("Ejecutar ahora")

`runManually` genera una ocurrencia **fuera de banda** con su propia clave (`manual-<timestamp>`), distinta de la clave de la ocurrencia programada — no interfiere con el calendario ni con `nextRunAt`. Requiere confirmación en la UI (`window.confirm`), registra `executedByUserId` y `executionSource: "manual"`, y audita normalmente a través del mismo camino que una ejecución del scheduler.

**La fecha es hoy, no la del ciclo (2026-10-04)**: un run manual resuelve los offsets relativos de la plantilla (`dueOffsetDays`, `startOffsetDays`) **contra la ocurrencia misma**, es decir con offset 0 — ver `offsetForSource` en `src/lib/recurrence.ts`. Los offsets existen para el ciclo programado: una recurrencia mensual con "Vence 30 días después" devolvía un ticket que ya vencía el mes próximo y por tanto no aparecía en Hoy, mientras que la intención de "Ejecutar ahora" es trabajo para hoy. Una plantilla sin offset sigue generando el objeto sin fecha; `scheduler` y `backfill` siguen aplicando el offset contra su propia fecha de ocurrencia.

> **Corregido 2026-10-04** — `executeOccurrence` llamaba a `advanceSchedule` en todos los orígenes, así que cada clic en "Ejecutar ahora" **avanzaba `nextRunAt`** y se comía la siguiente ocurrencia programada (tres recurrencias mensuales reales habían saltado de su fecha de octubre a noviembre; un backfill de N fechas pasadas empujaba el calendario N ciclos al futuro). Ahora solo el `scheduler` mueve el calendario — ver `advancesCalendar`. Los runs fuera de banda siguen sumando a los contadores de ejecuciones y al límite de fallos consecutivos; lo que ya no hacen es decidir cuándo corre la recurrencia la próxima vez, ni darla por `completed`/`expired` (ambos estados dependen del calendario).

## Ejecutar la ocurrencia pendiente (scheduler)

`runDueRecurrences` consulta `status = active AND isActive AND nextRunAt <= now() AND archivedAt IS NULL`, y para cada una construye la clave de la ocurrencia programada (`todayInTz(def.nextRunAt, def.timezone)` — la fecha local de esa ejecución) y la procesa **conservando `scheduledFor`**. Tras procesar (éxito o fallo), `nextRunAt` avanza a la siguiente ocurrencia elegible.

## Reintentar

`retryExecution` **conserva la naturaleza de la ocurrencia, no la del run** (2026-10-08): reintentar un "Ejecutar ahora" fallido ancla las fechas relativas a la ocurrencia igual que lo hizo el run original, en lugar de volver a empujarlas un ciclo. El origen se reconoce por la clave (`isManualOccurrenceKey` — `manual-<timestamp>`), no por `executionSource`, porque ese campo se sobreescribe a `"retry"` cuando un reintento falla y tras el primero la fila ya no recordaría de dónde venía. La **fecha de la ocurrencia sigue siendo la original** (`exec.scheduledFor`), no hoy: un reintento regenera la *misma* ocurrencia, y fijarla a cuando se pidió es lo que evita que se convierta en otra.

`retryExecution` solo opera sobre ejecuciones en `status = "failed"`; reutiliza la **misma fila** (incrementa `attemptCount`, no crea una nueva), y si el contexto ya es válido genera el objeto normalmente. Si la recurrencia había entrado en `status = "error"` por fallos consecutivos, un reintento exitoso la regresa a `paused` (no a `active` automáticamente — reactivarla es una decisión explícita separada) y resetea `consecutiveFailedCount` a 0. Reintentar una ejecución que ya tiene éxito se rechaza explícitamente (no puede duplicar el objeto).

## Omitir la próxima ocurrencia

`skipNextOccurrence` reserva la ocurrencia programada (mismo mecanismo de índice único que una ejecución real) pero la marca `skipped` directamente — nunca llama al motor de generación. Registra el motivo opcional, incrementa `skippedCount`, avanza `nextRunAt`, y audita `occurrence_skipped`. No se permite editar una ocurrencia futura individual como excepción compleja (fuera de alcance de esta fase) — omitir es la única operación puntual soportada.

## Generar faltantes (backfill)

`backfillOccurrences(from, to, dry)`:
1. **Modo preview (`dry: true`)** — calcula las fechas locales que caerían en el rango, sin crear nada. La UI lo usa implícitamente al mostrar el límite antes de confirmar (spec: "preview antes de ejecutar").
2. **Modo real** — genera cada ocurrencia del rango como una ejecución independiente (`executionSource: "backfill"`), respetando la idempotencia normal (si una ocurrencia de ese rango ya se había procesado, se omite silenciosamente vía `duplicate_prevented`).
3. **Límite duro**: `RECURRENCE_MAX_BACKFILL = 31` — nunca genera miles de objetos por accidente, incluso si el rango pedido es mayor.
   - No toca `nextRunAt`: rellenar el pasado nunca mueve el calendario futuro (ver la nota de corrección arriba).
4. Restringido a SuperAdmin/Administrator/Director (Project Manager excluido — spec §27); requiere checkbox de confirmación explícito en el formulario.

## Historial

Pestaña **Historial** del detalle: `scheduledFor`, inicio/fin, estado, origen, intento, objeto generado (enlace directo), ejecutor, mensaje de error resumido, duración calculada. Filtrable por estado/origen; paginado (límite 100). El registro normal **no se puede eliminar** desde la UI — no existe una acción de limpieza técnica en esta fase (spec permite reservarla a SuperAdmin bajo una política explícita futura; no se implementó por no haber una política definida — documentado, no bloqueante).
