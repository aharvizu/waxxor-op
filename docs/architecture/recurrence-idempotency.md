# Idempotencia y Concurrencia en Recurrentes

> Status: adopted 2026-07-18. Verificado con concurrencia real (`Promise.all` de dos ejecuciones simultáneas) en `scripts/verify-recurring.ts`.

## El problema

Un motor de recurrencias que se ejecuta por cron, manualmente y por reintento debe garantizar que **una misma ocurrencia nunca genere dos objetos** — ni por doble invocación accidental del cron, ni por dos usuarios haciendo clic en "Ejecutar ahora" a la vez, ni por un reintento después de que el primer intento sí tuvo éxito.

## La garantía: un índice único de base de datos, no una comprobación en aplicación

Spec §29: "Usa restricciones únicas y no solo comprobaciones en aplicación." Una comprobación tipo "¿ya existe una ejecución para esta clave?" seguida de un `INSERT` tiene una ventana de carrera: dos procesos pueden comprobar "no existe" al mismo tiempo y ambos insertar. La solución es un **índice único a nivel de Postgres**:

```sql
CREATE UNIQUE INDEX recurrence_exec_occurrence_idx
  ON recurrence_executions (recurrence_definition_id, occurrence_key);
```

`executeOccurrence` reserva la ocurrencia con:

```ts
const [reserved] = await tx
  .insert(recurrenceExecutions)
  .values({ ...})
  .onConflictDoNothing()
  .returning({ id: recurrenceExecutions.id });

if (!reserved) return { kind: "duplicate_prevented" };
```

Si dos transacciones intentan insertar la misma `(recurrenceDefinitionId, occurrenceKey)` simultáneamente, Postgres serializa el conflicto: **una gana** (obtiene la fila), la otra recibe cero filas de `onConflictDoNothing()` y el código simplemente retorna `duplicate_prevented` sin generar nada. No hay bloqueo explícito de aplicación (`FOR UPDATE`) para la reserva misma — el índice único *es* el mecanismo de exclusión mutua.

**Verificado con concurrencia real**: `scripts/verify-recurring.ts` lanza dos llamadas a `executeOccurrence` con la misma clave dentro de `Promise.all` — exactamente una produce `succeeded` y la otra `duplicate_prevented`; solo un objeto queda en la base de datos.

## Occurrence key: determinística, no aleatoria

| Origen | Clave |
|---|---|
| `scheduler` | Fecha local calendario de la ocurrencia (`YYYY-MM-DD`, calculada con `todayInTz`) |
| `manual` | `manual-<timestamp>` — siempre única, nunca colisiona con una ocurrencia programada |
| `backfill` | Fecha local calendario de cada ocurrencia generada en el rango |
| `retry` | Reutiliza la clave de la ejecución fallida original (misma fila, no una nueva) |

Usar la fecha local (no el instante UTC) como clave es lo que hace que un cambio de horario de verano no duplique ni pierda ocurrencias — ver `docs/features/recurrence-scheduling.md`.

## Consistencia objeto ↔ ejecución

Toda la secuencia — reservar la ejecución, validar el contexto, generar el objeto (WorkItem/Activity/Ticket), auditar, y marcar la ejecución `succeeded` con `generatedEntityId` — ocurre **dentro de una única transacción** (`db.transaction` en `executeOccurrence`). Esto elimina por construcción los tres estados inconsistentes que el spec prohíbe explícitamente (§29):

1. *"El objeto se generó pero la ejecución aparece fallida sin referencia"* — imposible: si la generación tiene éxito y el `UPDATE` final de la ejecución falla, toda la transacción (incluida la creación del objeto) se revierte.
2. *"La ejecución aparece exitosa sin objeto"* — imposible por el mismo motivo: `succeeded` solo se escribe después de que el objeto ya existe en la misma transacción.
3. *"`nextRunAt` avanzó sin registrar la ocurrencia"* — imposible: `advanceSchedule` (que calcula el nuevo `nextRunAt` y actualiza contadores) se llama dentro de la misma transacción que la ejecución, tanto en el camino de éxito como en el de fallo.

Verificado explícitamente: `scripts/verify-recurring.ts` fuerza un fallo de `AuditLog` a mitad de una operación relacionada y confirma que no sobrevive ningún WorkItem/Activity parcial (check 10 — reutiliza la convención de rollback de `docs/architecture/database-transactions.md`).

## Reintentos sin duplicar

`retryExecution` opera **sobre la fila de ejecución existente** (mismo `id`, `attemptCount` incrementado) — nunca crea una ejecución nueva ni reutiliza el índice único para generar dos objetos. Si el primer intento ya había creado el objeto (caso que no debería ocurrir dado el punto anterior, pero se protege igual), reintentar una ejecución en `status = "succeeded"` se rechaza explícitamente antes de tocar nada.

## Aislamiento por organización

Toda consulta del motor filtra por `organizationId` explícitamente (nunca confía en que el `id` de la definición sea suficiente) — mismo patrón que el resto de Watson (`docs/architecture/organization-and-data-isolation.md`). Verificado: una definición de otra organización no aparece en una búsqueda con el `organizationId` incorrecto, incluso conociendo su `id` exacto.

## Aislamiento de fallos en el lote

`runDueRecurrences` envuelve el procesamiento de **cada** recurrencia vencida en su propio `try/catch` — una excepción no capturada en una no interrumpe el `for` que procesa las demás. Esto es independiente de la transacción interna de `executeOccurrence` (que ya aísla los efectos de una sola ocurrencia) — es una capa adicional de aislamiento a nivel de lote.
