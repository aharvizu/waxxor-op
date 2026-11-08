# Trabajo (vista combinada Actividades + Tickets)

> Status: shipped 2026-11-08. Ruta `/work`; sin migración — es una lectura más de `work_items`.
> Origen: "quiero juntar ambos módulos para ver todo en un mismo lugar, pero poder identificar cada tarjeta o fila visualmente".

## 1. Por qué no hizo falta migrar nada

`work_items` ya es una sola tabla con `type: activity | ticket` y las especializaciones colgando 1:1 (ver `docs/architecture/work-item-model.md`). Tiempo, adjuntos, auditoría y conversiones ya operan sobre la fila compartida. Juntar los módulos era **un cambio de presentación**, no de datos.

Medición que motivó la pantalla (2026-11-07): 205 tickets y 74 actividades, pero solo **8 + 8 abiertos**. Dos módulos completos, dos Kanbans y dos juegos de vistas guardadas para 16 pendientes vivos.

## 2. Qué NO reemplaza

`/activities` y `/helpdesk` siguen intactos. Conservan sus columnas exclusivas (SLA, cobro, canal, tipo de actividad), sus vistas guardadas y los **18 enlaces profundos** que Indicadores, Hoy y Dashboard apuntan a ellos (`/helpdesk?quick=overdue`, `?billing=pending_review`, …). `/work` es el punto de entrada transversal; ellos son los especialistas. En el menú va **arriba** de ambos, dentro de Operations.

Las páginas de detalle tampoco se tocan: un ticket y una actividad son genuinamente distintos por dentro, y fusionarlas sería un retroceso.

## 3. El tipo se lee por forma, no por color

**Decisión de diseño central.** El color en Watson ya carga estado, prioridad y tipo de actividad — y los estatus de ticket son **configurables por organización con su propio color**, así que un ticket con estatus violeta sería indistinguible de una actividad si el tipo fuera un tono.

Por eso el tipo se comunica con tres canales redundantes y ninguno es el color:

| Canal | Ticket | Actividad |
|---|---|---|
| Ícono | `LifeBuoy` (azul) | `ClipboardCheck` (violeta) |
| Prefijo de folio | `TK-000406` | `ACT-000087` |
| Etiqueta accesible | `sr-only` + `title` | `sr-only` + `title` |

Es el mismo lenguaje que ya usan Calendario y la barra lateral. **No hay columna "Tipo"**: el folio ya lo dice, y un badge más competiría con los de estado y prioridad. El color queda libre para significar etapa y urgencia, que es lo que se escanea.

## 4. Los estatus: vocabulario compartido, mecanismos separados

No se unificó el mecanismo. Los tickets conservan su catálogo configurable de 11 estatus (`tickets.status_id` autoritativo) y las actividades su enum fijo de 7. Lo que se unificó es **la pregunta que ambos responden**: *¿en qué etapa está?*

`ACTIVITY_STATUS_CATEGORY` (`src/lib/activities.ts`) mapea cada estatus de actividad a las mismas seis categorías semánticas que usa `ticket_statuses.category`. El tipo se importa, no se redeclara, así que quitar una categoría del catálogo rompe el mapa en tiempo de compilación en lugar de derivar en silencio.

```
pending → open        in_progress → in_progress    waiting/blocked → waiting
completed/archived → closed        cancelled → cancelled
```

Dos mapeos son deliberadamente con pérdida, y el badge de la fila sigue mostrando el valor preciso:

- `blocked → waiting`: ambos significan "no avanza"; no existe categoría `blocked` e inventarla solo serviría a actividades.
- `completed`/`archived` → `closed`: el estado final de una actividad no tiene paso de confirmación, así que nunca pertenece a `resolved` (que para un ticket significa "listo pero sin confirmar"). **La categoría `resolved` solo contiene tickets**, lo cual es honesto en lugar de un hueco.

Unit-tested en `src/lib/activities.test.ts` (totalidad del mapa, ausencia de `resolved`, derivación del set terminal).

## 5. Tablero: seis carriles, y arrastre que no adivina

El Kanban agrupa por categoría, no por estatus: agrupar por estatus daría ~16 carriles (11 + 7).

Arrastrar reutiliza los setters ya validados de cada tipo (`changeTicketStatus` / `updateActivityWorkflow`) y **no inventa reglas de transición**. Una categoría puede contener varios estatus para un tipo — "En espera" cubre *Waiting customer* y *Waiting third party* — y adivinar cuál quiso la persona reescribiría la historia de SLA del ticket en silencio. Entonces:

- La categoría resuelve a **exactamente un** estatus para ese tipo → se aplica.
- Resuelve a cero o a varios → se rechaza nombrando las opciones, igual que el tablero de Recurrentes rechaza una transición que no puede expresar.

Con el catálogo actual de la organización eso hace arrastrable `in_progress`, `closed` y `cancelled` para tickets, y todo salvo `waiting` para actividades. **Recortar el catálogo a lo que el equipo realmente usa es lo que vuelve arrastrable el resto** — de 11 estatus de ticket solo 5 se han usado alguna vez, y 197 de 205 tickets están en `Closed`.

## 6. Deliberadamente escasa

El equipo no usa `/today` porque lo considera sobrecargado de información. Esta pantalla abre al revés:

- **Seis columnas** por defecto (folio, trabajo, empresa, responsable, estado, vence), no catorce. El resto del registro (prioridad, etapa) espera en el selector de columnas.
- **Sin tira de KPIs**, sin secciones, sin contadores.
- Abre en **"Pendientes"**: con 197 de 205 tickets cerrados, mostrar todo por defecto sepultaría los ~16 vivos bajo el historial. "Todo" es un chip explícito.
- Acciones de fila solo para tickets (`TicketRowActions`, reutilizado). Las actividades no tienen dropdown de fila en ningún lado de Watson todavía; inventarlo pertenece a su módulo, no a esta vista.

## 7. Sin vistas guardadas (todavía), a propósito

Trabajo es una vista transversal de la misma familia que Hoy y Calendario, que se manejan con query params. Cablear el Motor de Vistas habría requerido una migración de `config_module` más vistas sembradas **antes de que nadie use la pantalla una sola vez**.

Filtros, búsqueda y rango de fechas ya viven en la URL (los pone `FilterBar`), así que una vista es compartible y marcable hoy. Las columnas elegidas son locales a la sesión hasta que alguien pida que persistan — y agregar el módulo al Motor después es aditivo.

## 8. Componentes reutilizados, cero nuevos

`DataTable`, `FilterBar`, `KanbanBoard`, `TicketRowActions`, `CatalogChip`-equivalente, `Badge`, `EmptyState`, y el idiom de control segmentado de Calendario. No se creó ningún componente compartido nuevo.

## 9. Verificado (2026-11-08, datos reales)

Consulta unificada ejecutada contra la base productiva en modo lectura:

| Filtro | Filas | Etapas |
|---|---|---|
| Pendientes (default) | **16** | open=3 waiting=10 resolved=1 in_progress=2 |
| Pendientes · solo tickets | 8 | waiting=6 resolved=1 open=1 |
| Pendientes · solo actividades | 8 | open=2 waiting=4 in_progress=2 |
| Todo | 60+ | closed=49 … |

**IDs únicos 16/16 y 60/60**: la identidad de fila es `work_items.id`, no el id de la especialización, porque un ticket #322 y una actividad #322 coexisten. El id de la especialización viaja aparte (`entityId`) para construir el enlace.

`npm run build` compila y registra `ƒ /work`; typecheck limpio, lint sin errores, 284 tests.

## 10. Vista rápida (modal)

Hacer click en una fila no abría nada: el `<tr>` de `DataTable` no lleva handler (es el componente del Motor de Vistas, intacto) y solo el texto del título era enlace. Reportado 2026-11-08.

Ahora el **folio y el título** abren un panel lateral (`?peek=t:123` / `a:45`), y la tarjeta del Kanban completa también. Dos blancos en la tabla, no uno, y el folio está al inicio de la fila donde la gente apunta.

- El panel se resuelve **contra las filas ya cargadas** — sin segunda consulta, así que no puede contradecir a la lista detrás. Un `?peek=` que apunte fuera de la página actual simplemente no renderiza nada.
- Es un adelanto, no una segunda página de detalle: la sustancia exclusiva de cada tipo (SLA y cobro, proyecto y subactividades) vive en el detalle real, al que enlaza directo. Los tickets además traen los controles en línea de estatus/prioridad/responsable reutilizados de `TicketRowActions`.
- `SidePanel` + `PanelRow` (`src/components/side-panel.tsx`) son el componente compartido nuevo, **sin hooks**, cerrado por URL — así funciona desde un server component y queda marcable y compatible con el botón atrás. `/today` tiene su propia versión inline equivalente; la siguiente vez que se toque esa página debe migrar a este componente para que haya una sola implementación.
- El formato del token lo posee `src/lib/work-peek.ts` (puro, con prueba de ida y vuelta). Está ahí a propósito: lo construye un componente de cliente y lo parsea el server page, y si las dos mitades divergen el modal **falla en silencio** — no lanza, solo no abre nunca.
- Cambiar de vista, de tipo o de página cierra el panel; filtros y búsqueda se conservan al cerrarlo.

Sin atajo de Escape todavía: forzaría el panel a ser componente de cliente. `/today` tiene la misma limitación.

> **Corregido 2026-11-08** — el panel se entregó roto: `work-peek.tsx` es un server component y llamaba `workHref`, importado de `work-views.tsx`, que es `"use client"`. Cruzando esa frontera el import es una *referencia de cliente*, no la función, así que `next build` compilaba limpio y el modal lanzaba "Attempted to call workHref() from the server" al abrirse. La construcción de URLs se movió a `src/lib/work-peek.ts` (puro, importable por ambos runtimes) y ahora `src/lib/client-boundary.test.ts` recorre `src/app` y falla si cualquier server component importa un valor no-componente de un módulo `"use client"` — tercera vez que esta frontera muerde el repo, y la primera con red.

## 11. Pendiente

- **Categorías realineadas 2026-11-08** por decisión del equipo: `Pending confirmation` pasó de `resolved` a `waiting` ("pending confirmation, waiting customer y waiting third party van en Waiting"); `open` y `resolved` se dejaron como estaban. Resultado: `in_progress`, `resolved`, `closed` y `cancelled` quedan con un solo estatus y por tanto **arrastrables** (4 de 6 carriles); `open` sigue con 4 estatus (New, Assigned, Scheduled, Reopened) y `waiting` con 3. Editable en Configuración → Tickets → "Categoría semántica", auditado.
  - Efectos secundarios verificados de ese movimiento: `canTransition` **no** cambia, porque para estatus de sistema manda `SYSTEM_TRANSITIONS` por `semanticKey` y el grafo por categoría es solo respaldo de estatus personalizados. `isSlaPauseStatus` sí cubre `waiting`, así que un ticket en Pending confirmation ahora **pausa el reloj de SLA** — impacto menor porque `resolvedAt` ya está estampado y la compliance de resolución ya quedó decidida. `isWorkflowDropdownCategory` incluye `waiting`, así que Pending confirmation ahora aparece en el dropdown genérico de estatus; `canTransition` lo rechaza salvo viniendo de Resolved, así que es una verruga de UX, no un hueco de workflow.
- Vistas guardadas, si el uso real las pide.
- Acciones de fila para actividades (pertenece al módulo de Actividades).
