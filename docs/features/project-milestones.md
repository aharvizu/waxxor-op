# Hitos de Proyecto

> Status: shipped 2026-07-17, parte de Proyectos (E-09). Tablas: `project_milestones` + `milestone_activities` (vínculo opcional hito ↔ actividad).

## Modelo

`project_milestones`: `projectId` (FK cascade), `name`, `description`, `targetDate` (obligatoria), `status` (`pending|in_progress|completed|delayed|cancelled`), `completedAt`, `ownerId`, `position`. Índices por proyecto y por `target_date`. `milestone_activities` vincula hitos con actividades del **mismo proyecto** (único por par, validado en la action).

## Reglas

- Un hito **vencido** (targetDate pasada y estado abierto) se muestra en rojo, cuenta en `milestonesOverdue` y **alimenta la salud sugerida** del proyecto (`suggestedHealth` → `at_risk`).
- Completar todas las actividades vinculadas **no completa el hito automáticamente** — la UI muestra `completadas/vinculadas` y completar es una acción explícita.
- Acciones: crear, editar (incluye **cambiar fecha** y estado), completar/reabrir (`toggleMilestoneComplete`), vincular/desvincular actividades (`linkMilestoneActivity` con flag `unlink`). Roles de gestión (SuperAdmin/Administrator/Director/PM); todo auditado con `metadata.projectId` (`milestone_completed`, `milestone_reopened`, `activity_linked`, `activity_unlinked`).
- No hay borrado de hitos — cancelar (estado `cancelled`) los saca de las vistas activas conservando historial.

## Integración con Hoy

`getUserProjectSignals` trae los hitos **del responsable** (`ownerId`) con estado abierto y `targetDate` ≤ 7 días (o vencida) de proyectos operativos; `evaluateReminders` los convierte en recordatorios `milestone_<id>` (severidad alta si está vencido) con enlace a `/projects/[id]?tab=hitos`. Posponer/descartar/resolver reutilizan `operational_reminders` sin lógica nueva. Verificado en vivo (hito "Go-live" vencido apareció en No olvides).

## UI

Pestaña **Hitos**: tarjetas con fecha, responsable, progreso de vinculadas, badge Vencido cuando aplica, completar/reabrir, vincular/desvincular inline y edición en `<details>`. Los próximos hitos también aparecen en el Resumen del proyecto, en la columna "Próximo hito" del directorio y en Cliente 360.
