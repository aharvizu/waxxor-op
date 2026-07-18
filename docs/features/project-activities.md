# Actividades de Proyecto y Subactividades

> Status: shipped 2026-07-17, parte de Proyectos (E-09). Reutiliza WorkItem–Activity — **cero modelos paralelos**.

## Modelo

Una actividad de proyecto es un WorkItem tipo **`activity`** cuya fila en `activities` tiene `projectId` + `projectListId` (migración `drizzle/0015`). Una **subactividad** además tiene `parentActivityId` (self-FK). Todo lo demás — estado (pending/in_progress/waiting/blocked/completed/cancelled/archived), prioridad, asignación, fechas, estimación, TimeEntry, archivos, auditoría — es exactamente el de Activities (`docs/features/activities.md`).

## Reglas de pertenencia

- Toda actividad de proyecto pertenece a **una lista del mismo proyecto** (validado en `createProjectActivity` / `moveActivityToList`).
- `projectId` y `parentTicketId` son **mutuamente excluyentes**: una actividad vinculada a un Ticket no puede entrar a un proyecto y viceversa (la vinculación a tickets ya excluía actividades con proyecto; la creación de proyecto no acepta `parentTicketId`).
- Proyecto con cliente → la actividad hereda `clientId` del proyecto al crearse. Proyecto interno → actividad sin cliente, válida.

## Subactividades (máximo dos niveles)

`subactivityBlockReason` (`src/lib/projects.ts`, pura y unit-tested) rechaza: colgar una actividad de sí misma, un padre que no esté en proyecto+lista, un padre que ya es subactividad (**no hay tercer nivel**), un padre archivado/convertido, y convertir en subactividad una actividad que ya tiene hijas. La subactividad **siempre vive en la lista de su padre** (`setActivityParent` la mueve si hace falta) y se mueve con él (`moveActivityToList`). Completar subactividades **no** completa a la actividad padre; la vista Trabajo muestra el progreso `hechas/total`. Todo cambio de jerarquía se audita (`event: "hierarchy_changed"`).

## Dependencias y completado

Ver `docs/features/project-dependencies.md`. Completar una actividad **bloqueada por dependencias abiertas** no está impedido técnicamente pero exige confirmación explícita (`completeProjectActivity` con `confirmBlocked`; la UI muestra `window.confirm`) y genera el evento auditado `completed_while_blocked` — verificado por HTTP.

## Conversión a Ticket

Sigue las reglas existentes de Activity → Ticket (`docs/architecture/work-item-model.md`) con dos guardas nuevas en `conversionBlockReason` (unit-tested):

1. **`needs_project_confirmation`** — si la actividad pertenece a un proyecto, el formulario exige el checkbox "dejará de formar parte del proyecto". Al convertir, la misma transacción limpia `projectId`/`projectListId`/`parentActivityId` (el ticket **nunca** queda dentro del proyecto — PRD R3) y la vinculación previa queda en el metadata del evento `convert` (`unlinkedProjectId`).
2. **`has_subactivities`** — una actividad con subactividades no se convierte: hay que completarlas, moverlas o desprenderlas primero (las subactividades no pueden pertenecer a un ticket).

Identidad, historial, comentarios, archivos, fechas y TimeEntries se conservan porque el `work_items.id` es el mismo — verificado en `scripts/verify-projects.ts` (check 5).

## Quick View / detalle

El detalle completo de la actividad (`/activities/[id]`) sigue siendo la fuente de acciones ricas (estado, tiempo, conversión). La vista Trabajo ofrece las acciones frecuentes inline: completar (con confirmación si está bloqueada), mover de lista, crear subactividad, agregar dependencia. En Hoy, el Quick View existente funciona sin cambios (misma entidad) y el badge distingue "Act. de proyecto" / "Subactividad".
