# Contratos

> Status: shipped 2026-07-17, parte de Cliente 360 (E-13 / E-04). Tabla: `contracts` (migración `drizzle/0014_cloudy_true_believers.sql`).

## Modelo

`contracts`: `clientId` (FK cascade), `name`, `contractType` (`support|managed_service|licensing|consulting|maintenance|other`), `status` almacenado (`draft|active|cancelled|archived`), `startDate`/`endDate` (fin nulo = indefinido), `autoRenew`, `includedHours`, `monthlyAmount`, `notes`. Índices en `(organization_id, client_id)` y `end_date`.

## Estado derivado

Igual que en servicios contratados: **`expiring`/`expired` no se almacenan**. `derivedContractStatus` (`src/lib/client360.ts`) los deriva de `endDate` cuando el estado guardado es `active`: vencido si la fecha pasó, "por vencer" si quedan ≤30 días. Un contrato sin `endDate` nunca expira (indefinido).

## Renovación

Un contrato activo con `endDate` dentro del horizonte aparece en la vista consolidada de Renovaciones y en los recordatorios de Hoy — la fecha de renovación de un contrato **es su `endDate`** (no hay campo separado). "Renovar" desde la vista de renovaciones actualiza `endDate` con auditoría (`metadata.event = "renewal_updated"`).

## Horas incluidas y consumo

Si `includedHours` está definido, la tarjeta del contrato muestra el consumo del periodo: `getContractConsumedMinutes` suma los `time_entries` **no anulados** con `billingStatus = "included_in_contract"` del cliente entre `startDate` y hoy.

**Simplificación documentada**: el PRD no define un vínculo ticket↔contrato, así que el consumo se calcula a nivel cliente. Si un cliente tuviera dos contratos activos con horas incluidas y periodos superpuestos, ambos mostrarían el mismo total — se necesitaría un `contractId` en `time_entries` (o en tickets) para separar el consumo por contrato. Registrado como pregunta abierta; no se inventó la regla.

## Permisos y borrado

Crear/editar: cualquier rol interno. **Hard delete**: SuperAdmin-only (`deleteContract`), con confirmación en la UI y snapshot en el evento de auditoría. Para retirar un contrato sin destruir historial, usar `status = "cancelled"` o `"archived"` desde el formulario de edición.

## Dónde vive la UI

Pestaña **Contratos** de Client 360 (`/clients/[id]?tab=contratos`): tarjetas con tipo, estado derivado, vigencia, monto mensual, horas incluidas + consumidas, renovación automática; alta en `Disclosure`; eliminación visible solo para SuperAdmin.
