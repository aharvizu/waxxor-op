# Listas de Proyecto

> Status: shipped 2026-07-17, parte de Proyectos (E-09). Tabla: `project_lists` (migración `drizzle/0015_faithful_lightspeed.sql`).

## Modelo

`project_lists`: `projectId` (FK cascade), `name`, `description`, `position` (entero, reordenable), `status` (`planned|active|completed|archived`), `startDate`/`targetDate`, `color` (reservado), `createdById`, `archivedAt`. Índice por proyecto.

Una lista puede representar etapas, áreas, entregables, fases o grupos de trabajo — el modelo no distingue; el nombre lo dice. No hay carpetas adicionales en esta fase (spec §5).

## Reglas

- **Todo proyecto nace con al menos una lista** — `createProject` crea "General" (o el nombre elegido) en la misma transacción; no se pueden crear actividades de proyecto fuera de una lista.
- **Reordenar sin drag & drop**: `moveProjectList` intercambia posición con el vecino (↑/↓), normalizando posiciones a índices dentro de la transacción — estable, sin estados intermedios. Auditado (`event: "list_reordered"`).
- **Archivar no elimina actividades**: la lista archivada se atenúa en la vista Trabajo y no acepta actividades nuevas (`createProjectActivity` la rechaza), pero sus actividades siguen vivas y contando en el avance.
- **Completar todas las listas NO completa el proyecto** — completar el proyecto es siempre una acción explícita con su propia validación de pendientes.
- Al mover una actividad a otra lista, **sus subactividades se mueven con ella** en la misma transacción (una subactividad vive siempre en la lista de su padre).

## Acciones

`createProjectList`, `updateProjectList` (nombre/descripción/fechas/**estado** — completar, reabrir, archivar y restaurar pasan por aquí), `moveProjectList` (up/down). Todas: Zod + transacción + AuditLog + org de sesión; disponibles para cualquier rol interno (Technician incluido). Un proyecto archivado rechaza todas.

## UI

Vista **Trabajo** del detalle: cada lista es un `<details>` expandible (abierto si está activa) con contador completadas/total, fecha objetivo, controles ↑/↓, actividades anidadas, "+ Agregar actividad a esta lista" y "Editar lista" inline.
