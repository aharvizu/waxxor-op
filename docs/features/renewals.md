# Renovaciones

> Status: shipped 2026-07-17, parte de Cliente 360 (E-13). Sin tabla propia — es una **vista derivada** sobre `client_services` y `contracts`.

## Fuente única

`getOrgRenewals(orgId, horizonDays)` (`src/lib/client360-data.ts`) une:

- `client_services` activos con `renewalDate` no nula dentro del horizonte (incluye licencias — son `serviceType = "license"`), y
- `contracts` activos con `endDate` no nula dentro del horizonte,

y devuelve `RenewalItem[]` ordenado por fecha (fuente, id, cliente, concepto, tipo, fecha, monto, responsable de cuenta). **La misma función alimenta la pestaña Renovaciones de Client 360 y los recordatorios de "No olvides" en Hoy** — los umbrales viven una sola vez.

## Umbrales (spec)

`renewalBucket(date, now)` en `src/lib/client360.ts`: `overdue` · `d7` · `d15` · `d30` · `d60` · `d90` · `later` (los cortes 90/60/30/15/7/vencido del spec). `renewalSeverity(bucket)` los mapea a severidad: vencido/≤7 días → **alta**, ≤15/≤30 → **media**, ≤60/≤90 → **baja**, `later` → sin alerta. Unit-tested en cada frontera (`src/lib/client360.test.ts`).

## Integración con Hoy

`evaluateReminders` (`src/lib/today-rules.ts`) recibe `renewals: RenewalInput[]` (de `getOrgRenewals` con horizonte 30) y emite recordatorios `renewal_<fuente>_<id>` con `entityType: "client"`, severidad alta si está vencida o ≤7 días, enlace directo a `/clients/[id]?tab=renewals`. Los recordatorios son **posponibles/descartables/resolubles** con la persistencia auditable estándar de Hoy y reaparecen si la condición sigue después de la marca — sin lógica nueva, reutiliza `operational_reminders`/`applyMarks` tal cual. No hay duplicación entre la alerta del cliente y el recordatorio de Hoy: ambos leen la misma fuente.

## Acciones sobre una renovación

Desde la pestaña Renovaciones (`RenewalInlineForm` → `updateRenewal`):

- **Actualizar la fecha** — escribe `client_services.renewalDate` o `contracts.endDate` según la fuente, con auditoría (`metadata.event = "renewal_updated"`, valores anterior/nuevo).
- **Cancelar la renovación** — enviar la fecha vacía la limpia (`null`); el ítem sale de la vista y de los recordatorios.

Para cancelar el servicio/contrato completo se usa su propio formulario de edición (estado `cancelled`), no la vista de renovaciones.

## Por qué no hay estado "renovado"

Renovar **es** mover la fecha. No se guarda un historial de renovaciones como entidad —el AuditLog ya registra cada cambio de fecha con actor y timestamp, y eso es consultable en la pestaña Historial del cliente.
