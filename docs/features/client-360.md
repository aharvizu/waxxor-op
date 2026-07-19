# Cliente 360

> **Superseded 2026-07-20**: "Cliente" was split into independent **Company** and **Contact** entities. Routes moved to **/companies** (Empresa 360) and the new **/contacts** (Contacto 360). See `docs/features/companies-contacts.md` for the current model, migration notes, and CRM-prep architecture. This document is kept for historical context on the business rules below, which carried over unchanged.
>
> Status: shipped 2026-07-17. Implements E-13 (backlog/epics.md) plus the reusable-view slices of E-03/E-04.
> Route: **/clients** (redesigned directory) and **/clients/[id]** (Client 360 detail).
> Out of scope (explicit): sales CRM/leads/pipeline, fiscal invoicing, inventory/CMDB, real WhatsApp/email sending, AI, a new Projects architecture. Nothing in Projects changed for this feature.

## Objetivo

Una sola pantalla por cliente que consolida todo lo operativo — contactos, servicios, licenciamientos, contratos, renovaciones, tickets, actividades, proyectos, conversaciones, tiempo, cobros, reportes, notas e historial — sin duplicar entidades ni lógica de negocio. Reutiliza los módulos existentes (Tickets, Activities, Projects, Conversations, Time Entries, Reports) mediante consultas de solo lectura, no reimplementaciones.

## Modelo extendido

`clients` gana: `legalName`, `ownerName`, `industry`, `website`, `address`/`city`/`state`/`country`, `status` (`active|inactive|prospect_legacy|archived`), `primaryContactId` (sin FK — circular con `contacts`, validado en las actions), `accountOwnerId`/`defaultTechnicianId` (FK → users, no-client), `updatedAt`.

Nuevas tablas (migración `drizzle/0014_cloudy_true_believers.sql`):

- **`contacts`** — personas del cliente. `contactType` (owner/primary/technical/administrative/billing/management/requester/other), `isPrimary` (uno por cliente, ver `docs/features/contacts.md`), `isActive` (archivable, nunca hard-delete si está referenciado).
- **`services`** — catálogo global por organización (Microsoft 365, backup, soporte…). Ver `docs/features/services.md`.
- **`client_services`** — un servicio contratado por un cliente. Las **licencias son filas con `serviceType = "license"`** — no existe una entidad `License` separada. `status` real (`active|cancelled|archived`); `expiring`/`expired` son **derivados**, nunca almacenados.
- **`contracts`** — contrato del cliente. Mismo patrón: `status` real es `draft|active|cancelled|archived`; `expiring`/`expired` se derivan de `endDate`. Ver `docs/features/contracts.md`.
- **`client_notes`** — notas internas editables solo por su autor, auditadas.

## Reglas de negocio implementadas

1. **Un solo contacto principal por cliente**, actualizado transaccionalmente (degradar al anterior + promover al nuevo + apuntar `clients.primaryContactId`, una sola transacción, un evento de auditoría). Ver `docs/features/contacts.md`.
2. **Nada se borra en cascada silenciosamente hacia el negocio**: `deleteContact`/`deleteContract`/`deleteClient` son SuperAdmin-only y se **bloquean** si el registro tiene trabajo o referencias activas (tickets, conversaciones, work items) — el mensaje de error indica archivar en su lugar. Las tablas de detalle (`contacts`, `client_services`, `contracts`, `client_notes`) sí cascadean al borrar el cliente mismo (`onDelete: "cascade"`), porque en ese caso el borrado del padre es la operación autorizada.
3. **Estados derivados, no almacenados**: `expiring` (≤30 días) y `expired` se calculan en `src/lib/client360.ts` (`derivedServiceStatus`/`derivedContractStatus`) a partir de `renewalDate`/`endDate` — evita que un cron tenga que mantener el estado sincronizado.
4. **Renovaciones consolidadas**: `getOrgRenewals` (`src/lib/client360-data.ts`) une `client_services` activos con `renewalDate` y `contracts` activos con `endDate`, dentro de un horizonte configurable. La misma función alimenta **tanto** la pestaña Renovaciones de Client 360 **como** los recordatorios de Hoy — sin duplicar la regla de umbrales. Ver `docs/features/renewals.md`.
5. **Alertas del cliente sin duplicar lógica**: `buildClientAlerts` (pura, `src/lib/client360.ts`) construye la lista de banners a partir de agregados reales (`getClientSummary`) — tickets vencidos, SLA en riesgo, conversaciones sin responder, actividades vencidas, cobros pendientes de revisión, inactividad >30 días, y renovaciones vía `renewalBucket`/`renewalSeverity`.
6. **Historial legible + AuditLog técnico**: la pestaña Historial siempre muestra frases en español (`describeClientAuditEvent`, pura y testeada) construidas desde el mismo `AuditLog`; el bloque "Registro técnico" (campo/valor anterior/valor nuevo/actor) solo se renderiza si `user.role` es `superadmin` o `administrator`.

## Consolidación de horas de contrato

`getContractConsumedMinutes` suma los `time_entries` con `billingStatus = "included_in_contract"` del cliente dentro del periodo del contrato. **Simplificación documentada**: no existe vínculo directo ticket↔contrato en el PRD, así que el consumo es a nivel cliente, no por contrato individual cuando un cliente tiene más de un contrato con horas incluidas simultáneamente — ver `docs/features/contracts.md` §Limitaciones.

## Integración con Proyectos (2026-07-17)

La pestaña Proyectos muestra datos reales del nuevo módulo: folio, estado, salud, PM, avance calculado (completadas/totales), fecha objetivo, tiempo registrado, próximo hito y riesgos altos por proyecto — todo como agregados en el mismo SELECT (`getClientProjects`). Acción rápida "Crear proyecto" con el cliente preseleccionado (`/projects/new?clientId=`). Ver `docs/features/projects.md`.

## Integración con Recurrentes (2026-07-18)

Pestaña **Recurrentes** (16ª pestaña): nombre, tipo, frecuencia legible, responsable, próxima ejecución y estado por recurrencia del cliente, con indicadores compactos (activas/pausadas/con error/próximas en 30 días) y acción "Crear recurrencia" con el cliente preseleccionado (`/recurring/new?clientId=`). Las recurrencias en `status = "error"` (pausadas automáticamente tras 3 fallos consecutivos) **alimentan las alertas del cliente** (`buildClientAlerts` gana el campo `recurrencesInError`, contado en el mismo `getClientRecurrences` que llena la pestaña — sin consulta duplicada). Ver `docs/features/recurring.md`.

## Integración con Inbox (2026-07-19)

La pestaña Conversaciones ahora incluye también conversaciones **sin ticket** (asunto libre, vinculadas solo al cliente o a una actividad/proyecto) — antes solo mostraba el hilo 1:1 de cada ticket. Acciones "Abrir en Inbox" y "Nueva conversación" con el cliente preseleccionado. La misma lectura (`getClientConversations`) alimenta la pestaña; sin consulta duplicada. Ver `docs/features/inbox.md`.

## Integración con Knowledge (2026-07-19)

Pestaña "Conocimiento" (17ª): artículos de la Base de Conocimiento vinculados a este cliente vía `knowledge_article_relations` (relación polimórfica, no exclusiva del cliente). Ver `docs/features/knowledge.md`.

## Integración con Reportes (2026-07-18)

La pestaña Reportes usa el modelo operativo nuevo: tipo, periodo, versión, estado del flujo y fecha de envío por reporte, con acciones "Crear reporte" (`/reports/new?clientId=`) y "Programar recurrente" (`/recurring/new?targetType=report&clientId=`). Los reportes por atender (borrador/revisión/cambios/fallidos/aprobados sin enviar) alimentan `buildClientAlerts` (`reportsNeedingAttention`), contados sobre el mismo `getClientReports` que llena la pestaña. Ver `docs/features/reports.md`.

## Parámetros por defecto (2026-07-18, Configuración)

El alta rápida de cliente aplica los responsables por defecto de la organización (Configuración → Clientes: responsable de cuenta y técnico) **solo cuando el formulario los deja vacíos**, server-side y auditando los valores efectivos. Ver `docs/features/settings.md`.

## Rendimiento

- Header/resumen: 7 agregados en `Promise.all` (`getClientSummary`), un solo `SELECT` cada uno, sin N+1.
- Listado `/clients`: cada fila trae sus contadores (tickets abiertos, cobros pendientes, servicios activos, próxima renovación) como subconsultas correlacionadas en el mismo `SELECT` — un solo round-trip, `LIMIT 200`.
- Pestañas de detalle cargan solo los datos de la pestaña activa (server component por tab, no todo junto).
- Listas con límite explícito: conversaciones (20), notas (50), reportes (20), top ítems de tiempo (15).

## Permisos

Todos los roles internos (SuperAdmin, Administrator, Director, Project Manager, Technician) pueden crear/editar contactos, servicios contratados, contratos y notas. Solo SuperAdmin puede hacer hard-delete de cliente/contacto/contrato. No existen permisos por cliente (PRD §7: "no hay permisos por cliente en el MVP"). `client` no tiene acceso al portal interno — hereda el redirect a `/no-access` de `requireUser()`, sin código adicional.

## Estado archivado

Un cliente con `status = "archived"` se muestra de solo lectura con un banner; sus datos no se ocultan (siguen siendo consultables desde reportes/tickets históricos).

## Pruebas

- Unitarias (`src/lib/client360.test.ts`, 31 casos): `daysUntil`, `renewalBucket` (los 6 umbrales: 90/60/30/15/7/vencido), `renewalSeverity`, `derivedServiceStatus`/`derivedContractStatus`, `buildClientAlerts` (orden por severidad, ventana de 90 días, umbral de inactividad), `describeClientAuditEvent`.
- Regla de recordatorio de renovación en `src/lib/today-rules.test.ts` (`evaluateReminders` con `renewals`).
- Integración contra la BD real (`scripts/verify-client360.ts`, 12 checks): swap transaccional de contacto principal, limpieza de `primaryContactId` al archivar al principal, detección de referencias antes de borrar contacto/cliente, `getOrgRenewals` respeta el horizonte y el aislamiento por organización, rollback sin estado parcial cuando falla la auditoría. Limpia todos sus datos.
- Smoke HTTP manual contra el servidor real (login real, crear cliente → contacto → principal → servicio → contrato → nota, verificar `audit_logs`, verificar pestañas Renovaciones/Historial, verificar prefill de cliente en Nuevo ticket/Nueva actividad) — datos de prueba limpiados.

## Limitaciones conocidas (documentadas, no bloqueantes)

1. **Sin permisos por cliente** — por diseño del PRD, no un descuido.
2. **Consumo de horas de contrato es a nivel cliente**, no por contrato individual (ver arriba).
3. **`contactName`/`email`/`phone` en `clients`** siguen existiendo como campos heredados del alta rápida desde el listado; el dato "real" de contacto vive en `contacts`. No se eliminaron para no romper el flujo de creación rápida.
4. **Sin Team real** (OQ-02, heredada de Hoy): el listado de responsables (`accountOwnerId`, `defaultTechnicianId`) es cualquier usuario interno, no un equipo del cliente.
