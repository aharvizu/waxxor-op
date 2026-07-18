# Dependencias entre Actividades

> Status: shipped 2026-07-17, parte de Proyectos (E-09). Tabla: `work_item_dependencies`.

## Modelo

`work_item_dependencies`: `blockerWorkItemId` → `blockedWorkItemId` (ambos FK a `work_items` con cascade), único por par, `createdById`. **"blocks" y "blocked_by" son los dos extremos de la misma fila** — no hay dos tipos almacenados. Índices: único (blocker, blocked) + blocked.

## Reglas

- Solo entre actividades de la **misma organización** (ambos extremos se cargan org-scoped en `addDependency`); en la práctica se crean desde la vista Trabajo entre actividades del mismo proyecto.
- **Sin ciclos y sin auto-dependencia**: `wouldCreateDependencyCycle` (`src/lib/projects.ts`, BFS puro unit-tested — directo, transitivo y self) se evalúa dentro de la transacción sobre las aristas de la organización; la duplicada la rechaza además el índice único (verificado en `scripts/verify-projects.ts`).
- **Completar una actividad bloqueada no está impedido** — requiere confirmación explícita: `completeProjectActivity` rechaza con error de negocio si hay bloqueadores en estado abierto y no llegó `confirmBlocked`; la UI pide `window.confirm` y el completado forzado se audita (`event: "completed_while_blocked"` con el número de bloqueadores).
- Crear y eliminar dependencias se auditan (`work_item_dependency` create/delete con títulos y `projectId` en metadata).

## Visualización

En la vista Trabajo cada actividad muestra "Bloqueada por: X" (con eliminación inline) y "Bloquea a: Y"; el badge rojo `bloqueada (n)` cuenta solo bloqueadores **abiertos** (un bloqueador completado deja de bloquear visualmente sin borrar la arista — la dependencia histórica se conserva). El modo Tabla muestra el resumen `n↓ n↑`.

## Fuera de alcance (spec §10)

Finish-to-start avanzado, calendarios laborales, ruta crítica, dependencias entre proyectos.
