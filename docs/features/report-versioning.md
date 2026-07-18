# Versionado de Reportes

> Status: shipped 2026-07-18. Tabla `report_versions` (única por `(reportId, versionNumber)`, cascade con el reporte).

## Arquitectura elegida

Tabla dedicada `report_versions` (la opción "ReportVersion" del spec §5): cada generación escribe una fila inmutable con número consecutivo, `contentSnapshot`, `metricsSnapshot`, línea base de narrativa, campos narrativos del momento (resumen ejecutivo/conclusiones/recomendaciones), autor, motivo de cambio, y los sellos de aprobación/envío. `reports.version` apunta a la versión vigente; `reports.contentSnapshot/metricsSnapshot` duplican la vigente para lecturas de una sola fila (el historial completo vive en las versiones).

## Reglas (verificadas en `scripts/verify-reports.ts`)

- **Regenerar después de una edición crea la versión siguiente** (`max(versionNumber) + 1`, `changeReason: "Regeneración"`); la v1 conserva sus métricas originales intactas aunque los datos operativos hayan cambiado.
- **Aprobar identifica una versión específica**: `approveReport` estampa `approvedByUserId/approvedAt` en la fila de la versión vigente dentro de la misma transacción que cambia el estado — si la versión no existe, la aprobación se revierte completa ("No debe quedar un reporte aprobado sin versión aprobada consistente", spec §33).
- **Marcar enviado sella la versión enviada** (`report_versions.sentAt`).
- **Nunca se sobrescribe evidencia**: las versiones no tienen acción de update ni delete (solo cascadean con la eliminación permanente SuperAdmin del reporte completo).
- **Editar un reporte aprobado** lo devuelve a `ready_for_review` e invalida la aprobación del reporte (la versión aprobada conserva su sello como evidencia histórica de qué se aprobó y cuándo).

## Comparación

La pestaña **Versiones** del detalle muestra número, autor, fecha, motivo, aprobada y enviada por versión — comparación de metadatos, como pide el spec. La comparación visual línea por línea está explícitamente fuera de alcance.
