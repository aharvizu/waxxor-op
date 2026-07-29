# Empresas & Contactos

> Status: shipped 2026-07-20. Splits the former "Cliente 360" module (`docs/features/client-360.md`) into two independent CRM base entities: **Company** and **Contact**.
> Routes: **/companies** + **/companies/[id]** (Empresa 360, code name `Company360`), **/contacts** + **/contacts/[id]** (Contacto 360, code name `Contact360`).
> Out of scope (explicit, not implemented in this change): CRM, Leads, Opportunities, Pipeline, Sales. See "Preparación para CRM" below for what *is* prepared.

## Por qué el split

Hasta 2026-07-19, "Cliente" mezclaba dos conceptos: la organización que contrata (empresa) y las personas dentro de ella (contactos). Un futuro CRM (leads, oportunidades, pipeline de ventas) necesita Company y Contact como entidades independientes y de primera clase, no como un campo embebido. Este cambio separa el modelo sin implementar nada de CRM todavía — es preparación de arquitectura.

## Convención de nombres (vigente para toda futura entidad CRM)

| Capa | Empresa | Contacto |
|---|---|---|
| UI (español) | Empresas / Empresa 360 | Contactos / Contacto 360 |
| Código / DB / API (inglés) | `Company` / `companies` | `Contact` / `contacts` |

Esta tabla es la referencia para nombrar cualquier entidad CRM futura (Lead, Opportunity, Account).

## Modelo de datos

### `companies` (antes `clients`)

Todo el modelo de "Cliente 360" se conserva; se agregan dos campos:

- `taxId` (RFC) — nuevo, opcional.
- `tags` (jsonb, default `[]`) — nuevo, etiquetas libres; sin catálogo estructurado todavía (el catálogo `company_tag` en Settings sigue "preparado, no wired" — ver `src/lib/settings.ts`).

Todo lo demás (`legalName`, `industry`, `website`, `address`/`city`/`state`/`country`, `status`, `primaryContactId`, `accountOwnerId`/`defaultTechnicianId`) es exactamente el modelo de `docs/features/client-360.md`, solo renombrado de tabla.

### `contacts`

Se agrega `department` (texto libre, opcional). Todo lo demás (`contactType`, `isPrimary`, `isActive`, `jobTitle`, `email`, `phone`, `mobile`, `whatsappNumber`, `notes`) es el modelo existente — ver `docs/features/contacts.md`.

### Relación Company ↔ Contact

- **Hoy**: 1:N real — `contacts.companyId` (FK, `onDelete: cascade`) es la fuente de verdad. Un contacto pertenece a una sola "empresa principal".
- **Preparado para el futuro N:M** (varias empresas por contacto, patrón Salesforce-like): tabla nueva `company_contacts` (`companyId`, `contactId`, `isPrimary`, índice único `(companyId, contactId)`), poblada en lockstep con `contacts.companyId` en cada alta/edición de contacto. **Ninguna UI ni lógica de negocio lee de esta tabla todavía** — existe únicamente para que el día que se implemente N:M haya datos históricos reales en vez de arrancar en frío.

## Compatibilidad e identificadores

- Todo identificador de negocio nuevo debe usar `CompanyId`/`ContactId`. Nunca crear referencias nuevas con `ClientId`.
- La migración (`drizzle/0021_companies_contacts_split.sql`) usa **operaciones `RENAME` reales de Postgres** (`ALTER TABLE ... RENAME`, `RENAME COLUMN`, `ALTER TYPE ... RENAME`) — no `DROP` + `CREATE`. Es metadata-only: cero pérdida de datos, instantánea, preserva todas las filas y relaciones existentes.
- Los cambios de valor de enum (`help_module`: `clients`→`companies`; `knowledge_relation_type`: `client`→`company`) no admiten un `RENAME VALUE` directo porque además se agregó un valor nuevo (`contacts`) en el mismo cambio — se resolvieron con el patrón `ALTER COLUMN ... TYPE text` → `UPDATE` (reescribe los valores de texto existentes al nuevo nombre) → `DROP TYPE` / `CREATE TYPE` → cast de vuelta. Sin este `UPDATE` intermedio el cast falla para cualquier fila con el valor viejo — documentado aquí porque no es obvio a partir del SQL generado por drizzle-kit.
- Se mantienen **sin renombrar** (fuera del alcance de este cambio, ver spec): las tablas/símbolos `clientServices`/`ClientService` y `clientNotes`/`ClientNote` — solo se les renombró la columna FK `clientId`→`companyId`. El rol PRD `"client"` (`userRole`) y el valor `"client"` de `knowledgeVisibility` (audiencia "cara al cliente") **tampoco cambiaron** — son conceptos distintos a la entidad de negocio Company.
- `tickets.contact` (texto libre legado, sin FK) se conserva intacto — no se elimina información existente. En su lugar se agregó `workItems.contactId` (FK nullable a `contacts.id`), aditivo, usado por los nuevos selectores de Contacto en Tickets.
- `conversations.contactId` y `messages.contactId` existían como columnas enteras sin FK ("preparadas, sin entidad Contact madura"); ahora son FKs reales a `contacts.id`, ya que Contact es una entidad madura.

## Empresas — lista (`/companies`, Views Engine)

Wired to the shared Views Engine (`src/lib/views.ts`, `src/components/views/*`) since 2026-07-29 — same machinery as Tickets/Activities/Projects/Recurring, not a bespoke implementation. `"companies"` was already a reserved `config_module` enum value from the original consolidation but had never been wired up until now.

- **Field registry** (`COMPANY_FIELDS` in `src/lib/filters.ts`): real columns (status, industry, website, email, phone, city, state, country, account owner, default technician, created/updated) plus five **aggregate fields** — open tickets, pending billing, active services, next renewal, last touch — each a correlated subquery exported as a standalone `SQL` constant (`COMPANY_OPEN_TICKETS_SQL` etc.) so the list query's select clause and the filter engine's `conditionToSql` reference the exact same expression, never two copies that could drift. This is the first field registry to put a raw `SQL` expression (not a real table column) through the generic AND/OR builder — verified live against real data before considering it done, since the engine's `column: AnyPgColumn | SQL` type allowed it but nothing had exercised that path yet.
- **Seeded system views** (`ensureInitialViews`): "Todas", "Renovación ≤ 30 días", "Tickets abiertos", "Facturación pendiente" — the same three conditions the list previously offered as fixed pills, now real (deletable-by-nobody, but duplicable) saved views. Users can create their own personal/team/organization views on top, same as every other Views Engine module.
- **Quick filters** (`COMPANY_QUICK_FILTERS`): `mine` (account owner = me), `renewal`, `open_tickets`, `pending_billing`.
- **Columns**: `COMPANY_COLUMN_OPTIONS` is a superset of the default visible columns — industry, website, email, phone, city, state, country, last-touch, created/updated all exist as toggleable columns even though they're off by default, so they show up unchecked (not missing) in the column picker. No favorite-star or row-actions column — removed 2026-07-29 at the user's request (the star column in particular was net-new plumbing this port added, not something carried over from the old fixed table).
- **Sortable headers** (2026-07-29): clicking a column header cycles unsorted → asc → desc, client-side over the already-fetched page of rows (`components/views/sortable-th.tsx` — `SortableTh`/`compareValues`/`nextSortState`, shared with Contactos). Not persisted to the saved view; `savedViewConfigSchema.sortBy` exists and Tickets already reads it server-side for two hardcoded fields, but there's no generic dynamic `ORDER BY` across arbitrary columns (including the aggregate SQL ones) yet, and the whole result set is already loaded in one shot (capped at 200) — so an instant client-side re-sort is simpler and matches what "click a header" implies without inventing that generic machinery.
- Table is the primary/only fully-designed view type; List and Kanban (grouped by status) exist as functional fallbacks because the shared "create view" dialog always offers all three regardless of module.
- The old `getClientsDirectory` (`src/lib/company360-data.ts`) was removed — its query is now inlined in `companies/page.tsx`, matching how every other Views-Engine-wired module builds its own query rather than going through a shared "directory" function.

## Contactos — lista (`/contacts`, Views Engine)

Same port as Empresas above, done in the same pass (2026-07-29). `CONTACT_FIELDS` (`src/lib/filters.ts`): contactType, isActive, isPrimary, companyId, jobTitle, department, createdAt/updatedAt, plus one aggregate (`CONTACT_OPEN_TICKETS_SQL`). Seeded system views: "Todos", "Activos", "Principales", "Con tickets abiertos". The standalone "Empresa"/"Estado" dropdown filters the old fixed page had were dropped in favor of the Filtros builder + quick filters, matching Empresas — nothing outside this page ever deep-linked `/contacts?companyId=…`, so nothing depended on keeping it. Same sortable-header and column-picker treatment as Empresas, sharing the same `SortableTh` component. `getContactsDirectory` (`src/lib/contact360-data.ts`) was removed the same way `getClientsDirectory` was.

## Densidad (Views Engine, todas las tablas)

Bug fix, 2026-07-29: the toolbar's Densidad selector (`compact`/`comfortable`/`spacious`) has written to `config.density` since the Motor shipped, but nothing ever read it back — confirmed dead in every module, not just one. Fixed once in `Table` (`src/components/ui.tsx`), which now accepts an optional `density` prop applying `[&_td]:py-* [&_th]:py-*` child-selector overrides on its own wrapper — not a Td/Th prop, so the many non-Views-Engine tables that also use Td/Th are unaffected. Every module's `TableView` (Activities, Tickets, Projects, Recurring, Companies, Contacts) now threads `density={config.density}` through.

## Empresa 360 (Company360)

Mismo contenido que Cliente 360 (`docs/features/client-360.md`): resumen, contactos, servicios (incluye licenciamiento — pestañas fusionadas 2026-07-24, ver `docs/features/services.md`), contratos, renovaciones, tickets, actividades, proyectos, recurrentes, conversaciones, tiempo, cobros, reportes, conocimiento, notas, historial. Sin cambios de comportamiento — solo terminología (`Company`/`Empresa` en vez de `Client`/`Cliente`).

## Contacto 360 (Contact360) — nuevo

Pantalla nueva (`/contacts/[id]`, `src/app/(app)/contacts/[id]/page.tsx`, datos en `src/lib/contact360-data.ts`):

- **Datos personales**: nombre, apellido, cargo, departamento, correo, teléfono, celular, WhatsApp, notas.
- **Empresa principal**: tarjeta con link a Empresa 360.
- **Tickets relacionados**: `work_items` tipo `ticket` con `contactId` = este contacto.
- **Actividades asignadas**: `work_items` tipo `activity` con `contactId` = este contacto.
- **Conversaciones**: vía `conversations.contactId`.
- **Historial**: `audit_logs` con `entityType = 'contact'`, mismo formateador legible (`describeClientAuditEvent`) que Empresa 360.
- Barra lateral con otros contactos de la misma empresa, para navegación cruzada.

## Tickets: selectores de Empresa y Contacto

`helpdesk/new` y el panel de detalle del ticket (`SidePanelForm`) ahora tienen un selector real de Contacto (`contactId`, FK) además del selector de Empresa ya existente. Al elegir una Empresa, el selector de Contacto se filtra client-side para sugerir solo los contactos activos de esa empresa (o todos si no hay empresa seleccionada). El campo de texto libre `contact` (legado) se conserva sin cambios — ambos coexisten.

## Preparación para CRM (solo arquitectura — nada implementado)

Company y Contact quedan definidos como las **entidades base de un futuro CRM**. Para cuando ese CRM se implemente:

- **Lead**: prospecto pre-Company. Se anticipa como tabla nueva, independiente, que eventualmente "gradúa" a un Company + Contact reales (conversión explícita, igual que Activity→Ticket hoy). No existe tabla, ruta ni lógica todavía.
- **Opportunity**: oportunidad de venta asociada a un Company (y opcionalmente a un Contact como interlocutor). Tampoco existe todavía.
- **Account** (opcional): alias futuro de Company si se adopta un modelo tipo Salesforce donde "Account" es el término estándar. De adoptarse, sería un rename adicional sobre `companies` (mismo patrón RENAME usado en esta migración) o una vista, no una tabla nueva — decisión diferida.
- La tabla `company_contacts` (N:M, ver arriba) es la única pieza de infraestructura CRM que ya existe físicamente, y solo porque es necesaria para no perder historial cuando N:M se active — no habilita ninguna pantalla ni regla de negocio hoy.
- **Explícitamente no implementado en este cambio**: CRM, Leads, Opportunities, Pipeline, Sales. No hay tablas, rutas, ni menús para ninguno de estos conceptos.

## Pruebas

- `scripts/verify-client360.ts` (DB-level, contra la base real): swap transaccional de contacto principal, limpieza de `primaryContactId`, bloqueo de borrado referenciado, `getOrgRenewals`, aislamiento por organización, rollback — todo re-verificado tras el split (mismos 12 checks, ahora sobre `companies`/`contacts` renombradas).
- Verificación puntual de la nueva columna `work_items.contactId` (creación + round-trip contra la base real).
- Todo el resto de scripts `verify-*.ts` (inbox, conversion, knowledge, recurring, settings, projects, transactions, reports, activities) re-ejecutados contra la base real tras el rename masivo de identificadores — sin regresiones.

## Limitaciones conocidas

1. Mismas limitaciones heredadas de Cliente 360 (ver `docs/features/client-360.md` §Limitaciones): sin permisos por empresa, consumo de horas de contrato a nivel empresa (no por contrato individual), campos heredados de alta rápida.
2. El catálogo `company_tag` (Settings) sigue sin UI de etiquetado estructurado — `companies.tags` es un campo libre por ahora.
3. La tabla `company_contacts` (N:M) no tiene UI; un contacto solo puede tener una empresa principal desde la interfaz.
