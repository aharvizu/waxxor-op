# Servicios

> Status: shipped 2026-07-17, parte de Cliente 360 (E-13 / E-04); pestañas Servicios/Licenciamientos fusionadas en una sola ("Servicios") el 2026-07-24 — ver más abajo. Tablas: `services` (catálogo), `client_services` (contratación por cliente).

## Dos capas

1. **Catálogo (`services`)** — por organización, no por cliente: nombre, categoría, descripción, alcance, tarifas por defecto (remota/en sitio/fijo), `defaultSlaDefinitionId` opcional, `isRenewable`, `status` (`active|inactive`). Se crea una vez y se reutiliza en todos los clientes.
2. **Contratación (`client_services`)** — una fila por servicio contratado por un cliente, con sus propias condiciones: cantidad, proveedor, ciclo de facturación, costo interno vs. precio al cliente, fechas (inicio/fin/renovación), cobertura de soporte (`included|incident_based|hourly_bundle|fixed_price|not_applicable`), horas incluidas, tarifas específicas (pueden diferir de las del catálogo), SLA específico.

Un mismo servicio del catálogo puede aparecer varias veces para el mismo cliente con condiciones distintas (p. ej. M365 con y sin política de soporte) — no hay restricción de unicidad.

## Licenciamiento = un tipo de servicio, no una entidad aparte

`client_services.serviceType` incluye `license` junto con `recurring_service`, `support_contract`, `one_time_service`, `managed_service`. Hasta el 2026-07-23, Client 360 tenía una pestaña **Licenciamientos** separada (misma tabla `client_services`, filtrada por `serviceType = "license"`). Se fusionó de vuelta en la pestaña **Servicios** (2026-07-24) porque la separación confundía más de lo que aclaraba — servicios administrados, licencias y contratos de soporte conviven en la misma tabla, distinguidos únicamente por la columna/badge "Tipo" de cada fila. Sigue siendo el mismo modelo, misma validación, mismo formulario — el campo "Tipo" (`serviceType`) sencillamente ya no dicta qué pestaña usar.

## Estado derivado

`client_services.status` almacenado es solo `active|cancelled|archived`. **`expiring`/`expired` nunca se guardan** — se calculan en cada lectura (`derivedServiceStatus` en `src/lib/client360.ts`) a partir de `renewalDate` (o `endDate` si no hay fecha de renovación): vencido si la fecha ya pasó, "por vencer" si quedan ≤30 días, activo en otro caso. Esto evita que un job en segundo plano tenga que mantener sincronizado un estado que solo depende de la fecha actual.

## Dónde vive la UI

- Pestaña **Servicios** de Client 360 (`/companies/[id]?tab=servicios`): tabla con servicio, tipo, estado (derivado), cobertura de soporte, proveedor, precio, fecha de renovación — incluye todo `serviceType`, licencias inclusive.
- Si el catálogo de la organización está vacío, el formulario de "+ Contratar servicio" muestra primero el alta de catálogo (`ServiceCatalogForm`) — no se puede contratar un servicio que no existe en el catálogo. Si el catálogo ya tiene elementos, un acordeón "+ Nuevo servicio en catálogo" (2026-07-24) permite seguir agregando entradas sin depender de que esté vacío.

## Limitaciones conocidas

- El catálogo no tiene versión histórica de precios — si cambia una tarifa por defecto, las contrataciones ya existentes no se actualizan retroactivamente (correcto: cada `client_services` guarda su propia tarifa).
- No hay control de inventario/CMDB de licencias (asientos usados vs. comprados) — `quantity` es un número libre, no reconciliado contra nada. Explícitamente fuera de alcance (PRD: Asset Management es scope futuro).
