# Proyectos

> Status: shipped 2026-07-17. Implements E-09 (jerarquía oficial del PRD R4) + hitos, riesgos y dependencias.
> Rutas: **/projects** (directorio), **/projects/new**, **/projects/[id]** (detalle con 9 pestañas).
> Regla central (PRD R3): **los Tickets nunca pertenecen a Proyectos.**

## Jerarquía

```
Proyecto → Listas → Actividades → Subactividades
```

Las actividades de proyecto **son WorkItems tipo `activity`** con `activities.projectId` + `projectListId` (+ `parentActivityId` para subactividades). No existe un modelo paralelo de tareas: estado, prioridad, asignación, fechas, TimeEntry, archivos, auditoría y conversión a Ticket son los de Activities, sin duplicación. La antigua tabla plana `tasks` quedó **congelada** (sus 3 filas se migraron con `scripts/migrate-legacy-tasks.ts` a actividades en la lista "General"; borrar la tabla es una decisión destructiva aparte).

## Modelo (migración `drizzle/0015_faithful_lightspeed.sql`)

`projects` ampliado: `folio` (único por organización, secuencia `project_folio_seq`, formato `PRJ-000001`, backfilled), `priority` (low/normal/high/urgent), `healthStatus` (on_track/attention/at_risk/blocked/completed/not_set), `projectManagerId`, `ownerId`, `completedAt`, `archivedAt`, `estimatedMinutes`, `billingType`, `color`/`icon` (reservados), `createdById`, `updatedAt`. `targetDate`/`budgetAmount` mapean sin rename destructivo a las columnas preexistentes `due_date`/`budget`. Estados: planning/active/on_hold/at_risk/completed/cancelled/archived (enum append-only). Tablas nuevas: `project_members`, `project_lists`, `project_milestones`, `milestone_activities`, `project_risks`, `work_item_dependencies`, `project_comments`; `attachments.projectId` para archivos a nivel proyecto.

## Reglas de negocio implementadas

1. **Cliente opcional** — un proyecto sin cliente es interno; sus actividades pueden existir sin cliente. Con cliente, cada actividad creada hereda `clientId` del proyecto.
2. **PM obligatorio para activar** (`setProjectStatus` rechaza `active` sin PM) y el PM **siempre es participante** con rol `manager` (upsert transaccional al crear/cambiar PM); no puede quitarse sin reasignar.
3. **Crear proyecto es una transacción**: proyecto + folio + participante PM + participantes elegidos + lista inicial ("General" si no se nombra otra) + auditoría — nunca existe un proyecto sin lista operativa.
4. **Completar valida pendientes**: con actividades abiertas (pending/in_progress/waiting/blocked) se rechaza; la **excepción explícita** requiere checkbox + motivo y queda auditada (`metadata.event = "completed_with_exception"` con el conteo y el motivo). Verificado por HTTP en ambas direcciones.
5. **Cancelar no elimina; archivar es reversible** (banner de solo lectura, excluido de vistas operativas por defecto, `restoreProject` vuelve a planning/completed). **Solo SuperAdmin elimina permanentemente**, y solo si el proyecto no tiene actividades.
6. **`organizationId` jamás viene del navegador**; todos los ids foráneos (cliente, PM, listas, actividades padre) se revalidan dentro de la organización.

## Avance y salud (`src/lib/projects.ts` — puro, unit-tested)

- **`computeProgress`**: % = completadas / totales (canceladas y archivadas excluidas), días restantes desde `targetDate`, desviación = registrado − estimado. **Nunca se almacena** — siempre se calcula.
- **`suggestedHealth`**: reglas deterministas (hitos vencidos, riesgos altos, fecha pasada o desviación >20% → `at_risk`; vencidas/bloqueadas/sin responsable → `attention`; bloqueadas + on_hold → `blocked`; completado → `completed`). Es una **sugerencia**: se muestra junto al valor manual y jamás lo sobreescribe; el cambio manual se audita con `metadata.event = "health_set_manually"`.

## Directorio /projects

11 vistas (Activos por defecto, Todos, Mis proyectos, Mi equipo*, En riesgo, Bloqueados, Próximos a vencer, Vencidos, Sin cliente, Completados, Archivados) + filtros (búsqueda, estado, salud, prioridad, cliente, PM) + tabla con folio, cliente, PM, estado, salud, prioridad, avance con barra, pendientes/vencidas, próximo hito, fecha objetivo y tiempo. Agregados por fila como subconsultas correlacionadas — un solo round-trip, límite 200. *"Mi equipo" = organización activa hasta que exista la entidad Team (OQ-02), sin datos simulados.

## Detalle /projects/[id]

Header (folio, nombre, badges de estado/salud/prioridad, cliente/PM/objetivo, 6 stats) + pestañas: **Resumen** (Atención requerida con salud sugerida, hitos próximos, actividades vencidas, riesgos principales, distribución del trabajo, participantes, actividad reciente), **Trabajo** (lista estructurada expandible con creación/edición inline, subactividades anidadas, mover de lista con las subactividades siguiendo al padre, reordenar listas con ↑/↓ — sin drag&drop frágil — y modo Tabla), **Hitos**, **Riesgos**, **Tiempo**, **Archivos**, **Comentarios**, **Historial** (legible + AuditLog técnico solo SuperAdmin/Administrator), **Configuración** (editar, estado/salud, completar, participantes, archivar/restaurar/eliminar).

## Permisos (spec §25)

- Gestión de proyecto (crear/editar/estado/salud/completar/archivar/participantes/hitos/editar riesgos): SuperAdmin, Administrator, Director, Project Manager (`MGMT_ROLES`).
- Technician: ve todos los proyectos, crea/edita actividades y subactividades, listas, registra tiempo, comenta, adjunta, completa actividades y **reporta** riesgos.
- SuperAdmin: además eliminación permanente. Client: sin acceso (redirect `/no-access` heredado). Sin permisos por cliente ni proyectos privados.

## Rendimiento

Índices en org/cliente/estado/PM/fecha objetivo de projects, (project) en listas/hitos/riesgos/comentarios, único en dependencias y en (project,user) de members. Directorio y header con agregados en el mismo SELECT; detalle carga solo la pestaña activa; árbol de trabajo en 2 consultas (listas + actividades con tiempo y contadores de dependencias por fila); rollup de tiempo en 5 agregaciones paralelas; historial y comentarios con límites (120/50). Sin caché adicional (datos operativos).

## Integraciones

- **Hoy**: ver `docs/features/today.md` — badges "Act. de proyecto"/"Subactividad" y recordatorios de hitos vencidos/próximos del responsable, riesgos altos asignados y proyectos en riesgo del PM (`getUserProjectSignals`, acotado, sin cargar proyectos completos).
- **Cliente 360**: pestaña Proyectos con folio, estado, salud, PM, avance real, objetivo, tiempo, próximo hito y riesgos altos + botón "Crear proyecto" con cliente preseleccionado (`/projects/new?clientId=`).
- **Conversión A→T**: ver `docs/features/project-activities.md`.

## Integración con Recurrentes (2026-07-18)

Un proyecto puede tener recurrencias de tipo `project_activity` asociadas (crean actividades directamente en una lista del proyecto). El Resumen del proyecto muestra una tarjeta compacta "Recurrentes" (solo si existen — sin widget vacío) con nombre, estado y próxima ejecución de cada una, más acciones "Crear" (`/recurring/new?projectId=`) y "Ver todas" (`/recurring?projectId=`); no se agregó como pestaña principal para no saturar la navegación (spec §23). La generación respeta que el proyecto y la lista estén operativos — un proyecto archivado/completado/cancelado o una lista archivada hacen fallar la ejecución con un error de configuración (`project_not_operational`/`list_archived`), nunca genera actividades "fantasma". Ver `docs/features/recurring.md`.

## Integración con Reportes (2026-07-18)

El Resumen del proyecto incluye la tarjeta "Reportes": generar un reporte de estado (`/reports/new?projectId=&type=project_report` — periodo seleccionable, métricas de avance/hitos/riesgos/tiempo del periodo) y abrir el historial filtrado (`/reports?projectId=`). No es un módulo distinto — usa `Report` con `projectId` (spec Reportes §15). Ver `docs/features/reports.md`.

## Integración con Configuración (2026-07-18)

`/projects/new` acepta una **plantilla de proyecto** (Configuración → Proyectos): al elegirla, sus listas se crean transaccionalmente en lugar de la lista inicial única (plantilla archivada = rechazada con error de negocio). La salud y prioridad iniciales salen de los defaults de la organización (`projects.defaults`), siempre editables. Ver `docs/features/settings.md`.

## Integración con Inbox (2026-07-19)

El Resumen del proyecto incluye la tarjeta "Conversaciones": ver los hilos vinculados al proyecto (`/inbox?projectId=`) o crear uno nuevo con el proyecto preseleccionado. Una conversación puede vincularse a proyecto **junto con** cliente/ticket/actividad — no es exclusivo. Ver `docs/features/inbox.md`.

## Integración con Knowledge (2026-07-19)

Tarjeta "Base de conocimiento" en Resumen con artículos vinculados al proyecto vía `knowledge_article_relations`. Ver `docs/features/knowledge.md`.

## Fuera de alcance / futuro

Kanban, Gantt, ruta crítica, calendarios laborales, dependencias entre proyectos, portafolios, OKRs, sprints, estados personalizados de actividad, drag & drop. (Las plantillas de proyecto, antes futuras, shippearon 2026-07-18 vía Configuración — ver arriba.)

## Limitaciones conocidas

1. `color`/`icon` existen en el modelo pero no tienen UI todavía.
2. Tiempo "general del proyecto": por decisión documentada se registra siempre sobre actividades — para coordinación se crea una actividad dedicada (la pestaña Tiempo lo explica). No hay TimeEntry directo a proyecto.
3. La tabla `tasks` legacy sigue existiendo congelada (decisión de borrado pendiente, destructiva).
4. `work_item_type` conserva el valor `project_activity` sin uso (enums append-only); las actividades de proyecto son tipo `activity` por spec.
