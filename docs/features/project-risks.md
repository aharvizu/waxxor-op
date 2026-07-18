# Riesgos de Proyecto

> Status: shipped 2026-07-17, parte de Proyectos (E-09). Tabla: `project_risks`. Sin IA — registro y seguimiento manual.

## Modelo

`project_risks`: `projectId` (FK cascade), `title`, `description`, `probability` (`low|medium|high`), `impact` (`low|medium|high|critical`), `status` (`open|monitoring|mitigated|occurred|closed`), `ownerId`, `mitigationPlan`, `dueDate`, `resolvedAt`, `createdById`. **La severidad nunca se almacena** — se deriva.

## Severidad determinística

`riskSeverity(probability, impact)` (`src/lib/projects.ts`) es una matriz fija unit-tested en sus 12 celdas:

| prob \ imp | low | medium | high | critical |
|---|---|---|---|---|
| low | low | low | medium | high |
| medium | low | medium | high | critical |
| high | medium | high | critical | critical |

"Riesgo alto" = severidad `high` o `critical` con estado abierto (`open|monitoring|occurred`).

## Reglas

- **Cualquier rol interno puede reportar** un riesgo (`createRisk` — spec §25: Technician "reportar riesgos"); editar/cerrar es de los roles de gestión (`updateRisk`). Cerrar (`mitigated`/`closed`) estampa `resolvedAt`; reabrir lo limpia. Todo auditado por campo con `metadata.projectId`.
- Los riesgos altos abiertos alimentan: el contador del header del proyecto, la sección **Atención requerida** del Resumen, la **salud sugerida** (`suggestedHealth` → `at_risk`), la pestaña Proyectos de **Cliente 360** y **Hoy** (recordatorio `project_risk_<id>` de severidad alta para el `ownerId` del riesgo — verificado en vivo).
- La pestaña Riesgos ordena: abiertos primero, luego por severidad (critical → low).

## UI

Pestaña **Riesgos**: reporte inline (`Disclosure`), tabla con severidad derivada, probabilidad/impacto, estado, responsable, fecha límite, plan de mitigación truncado y edición en `<details>` para roles de gestión. Sin widget vacío cuando no hay riesgos — solo el EmptyState con el call-to-action.
