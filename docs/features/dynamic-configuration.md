# Configuración Dinámica, Vistas y Campos Personalizados

> Status: shipped 2026-07-20, pilot module **Tickets**. Scoped per explicit direction: Part 3's "catálogos configurables" apply only to *cosmetic* presentation (label/color/icon/order) — the underlying enums (estado, prioridad, tipo, cobro) stay fixed because business logic (ticket workflow, SLA resolution, recurrence auto-pause) switches on their literal values. Engine (schema + lib layer) is module-agnostic across all 8 target modules; only Tickets has UI wired.

## Por qué "piloto, no los 6 módulos completos"

La solicitud original pedía Vistas + Filtros + Catálogos dinámicos + Custom Fields + Configuración de formularios + Configuración de vistas, para 8 módulos, en una sola sesión — sin tocar reglas de negocio ni arquitectura. Eso es contradictorio en un punto concreto: "estado"/"prioridad"/"tipo" son enums de Postgres de los que depende lógica real (transiciones de ticket, resolución de SLA por prioridad, auto-pausa de recurrencias). Hacerlos completamente dinámicos (valores arbitrarios por organización) requeriría reescribir esa lógica — exactamente lo que se pidió no tocar. Se acordó con el usuario: (1) catálogos "configurables" = capa cosmética sobre los enums fijos, y (2) implementar las 6 partes completas en **un módulo piloto** (Tickets) en vez de una cobertura superficial en los 8.

## Parte 1 — Vistas (`saved_views`)

Tabla nueva, genérica por `module`. Cada vista: `viewType` (list/table/kanban/calendar/timeline), `config` (jsonb: columnas visibles/orden/ancho, agrupación, ordenamiento, filtros AND/OR, búsqueda, densidad, tamaño de página), `isDefault`/`isFavorite`/`sharedWithTeam`/`sortOrder`. CRUD completo (`src/lib/views.ts`): crear, duplicar, renombrar, eliminar, favorita, compartir con equipo, definir por defecto (demueve al sibling anterior transaccionalmente, mismo patrón que `makePrimary` en Contactos), reordenar (drag & drop nativo HTML5, `src/components/drag-list.tsx` — sin dependencia nueva).

`/helpdesk` es la implementación de referencia: barra de vistas (`view-switcher.tsx`) + 5 renderizadores (`ticket-views.tsx`). Al no existir ninguna vista para un usuario, se aprovisiona una vista "Todos" (Tabla) automáticamente.

## Parte 2 — Filtros (`src/lib/filters.ts`)

Árbol de condiciones AND/OR (`FilterGroup`), serializable a jsonb, evaluado a SQL real vía `buildFilterSql`. Registro de campos por módulo (`TICKET_FIELDS`) + Custom Fields inyectados dinámicamente (`buildFieldRegistry`). Filtros rápidos fijos: Mis elementos, Sin asignar, Pendientes, Vencidos, Cerrados recientemente, Favoritos (`item_favorites`, tabla genérica de favoritos por usuario/módulo/entidad). El panel fijo de filtros de `/helpdesk` fue reemplazado por `filter-bar.tsx` (chips + editor AND/OR). "Guardar en vista" persiste el filtro activo dentro de la vista seleccionada.

**Nota de seguridad de tipos**: los objetos de definición de campo usados internamente (`FieldDefinition`) contienen columnas reales de Drizzle — nunca se pasan directo a un Client Component (rompería la serialización RSC por referencias circulares tabla↔columna). Siempre se convierten con `toPublicFields()` antes de cruzar la frontera server/client.

## Parte 3 — Catálogos dinámicos (capa cosmética)

Reutiliza `catalog_items` (ya existente) con tres kinds nuevos: `ticket_status_style`, `ticket_priority_style`, `ticket_billing_status_style` — una fila opcional por valor de enum, `name` = valor técnico (nunca editable), `color` = uno de los 7 tonos de `Badge` (no hex, a diferencia de otros catálogos), `config.label`/`config.icon` = personalización. `getStyledMeta()` (`src/lib/catalog-styles.ts`) mezcla el override sobre el fallback de `labels.ts` — una organización sin overrides ve exactamente el comportamiento anterior. Administración: Settings → Tickets → "Estilos" (`enum-style-manager.tsx`).

También: `tickets.defaults` (prioridad por defecto), reutilizando el patrón KV existente de `organization_settings` — sin tabla nueva.

## Parte 4 — Campos Personalizados (`custom_field_definitions` + `custom_field_values`)

19 tipos (texto, texto largo, número, decimal, moneda, fecha, hora, fecha/hora, checkbox, lista, lista múltiple, radio, usuario, empresa, contacto, email, teléfono, URL, color). Definición: nombre, descripción, ayuda, obligatorio, visible, editable, placeholder, valor por defecto, orden, grupo, longitud máxima, validaciones, opciones, color, ícono. Valores: una fila por (módulo, entidad, campo), validados por tipo (`validateFieldValue`) antes de guardar. Nunca se permite eliminar un campo con datos capturados (`FieldInUseError`) — solo archivar.

Administración: Settings → Campos Personalizados (selector de módulo; solo Tickets aparece "conectado" hoy). Aparecen automáticamente en: formulario de alta de ticket, columnas de tabla, filtros. **Pendiente para módulos no-piloto y para exportaciones/reportes/indicadores** — ver Limitaciones.

## Parte 5 — Configuración de formularios (`tickets.formConfig`)

Editor no-código (`form-config-editor.tsx`): secciones colapsables, agregar/quitar campos, reordenar por drag & drop, marcar obligatorio/visible, valor por defecto, insertar Custom Fields. Guardado como jsonb vía el mecanismo genérico de `organization_settings` existente (sin tabla nueva).

## Parte 6 — Configuración de vistas (`tickets.viewSettings`)

Columnas por defecto, orden por defecto, vista inicial, agrupación por defecto, filtros globales (lista plana AND — deliberadamente más simple que el árbol AND/OR completo del filtro por vista, ya que son la base que cada usuario personaliza después). Mismo patrón KV.

## Migraciones

`drizzle/0022_dynamic_config_views_filters_custom_fields.sql` — puramente aditiva (3 enums nuevos, 4 tablas nuevas), sin renombrar ni tocar nada existente.

## Limitaciones conocidas

1. Solo Tickets tiene UI conectada de extremo a extremo; los otros 7 módulos comparten el motor (schema + lib) pero no tienen vistas/filtros/campos personalizados visibles en su propia pantalla todavía.
2. Custom Fields no aparecen aún en exportaciones/reportes/indicadores — el modelo de datos ya lo soporta (`getValuesForEntities` es el batch loader pensado para eso), falta la integración específica.
3. El editor de Formularios controla la sección/orden/obligatoriedad de los Custom Fields; los campos **estándar** del formulario de ticket (asunto, prioridad, etc.) siguen en su posición original de código — el config no reordena esos todavía.
4. El árbol de filtros AND/OR en la UI soporta un nivel (sin grupos anidados) — el motor (`FilterGroup`) sí soporta anidación completa, es una limitación solo del editor visual.
5. Kanban mueve tickets entre columnas por selector, no arrastrando la tarjeta — el drag & drop nativo se implementó para reordenar Vistas y campos de Formulario (requisito explícito), no para tarjetas de Kanban (no pedido explícitamente).
