# Report Snapshots

> Status: adopted 2026-07-18, para la feature Reportes e Indicadores.

## El problema

Un reporte comunica el estado de un periodo **en el momento en que se generó**. Los datos operativos siguen cambiando después (se registran horas tarde, se reabren tickets, se reclasifican cobros) — si el reporte consultara en vivo, el documento aprobado y enviado al cliente diría cosas distintas cada vez que se abre. Eso destruye la evidencia.

## La solución: doble snapshot congelado

En la generación (`generateReport`) se congelan dos estructuras jsonb:

1. **`metricsSnapshot`** — el resultado completo de `computePeriodMetrics` (tickets, SLA, actividades, proyectos, tiempo, conversaciones, cobro, recurrentes, con sus desgloses), más `computedAt` (cuándo se calculó) y el alcance exacto (`clientId`/`projectId`).
2. **`contentSnapshot`** — las secciones resueltas de la plantilla (con títulos e intro del momento), la línea base de narrativa determinística y la referencia a la plantilla usada.

Ambos se escriben **dos veces**: en la fila del reporte (versión vigente, lecturas de una sola fila para vista previa/print/CSV) y en `report_versions` (evidencia inmutable por versión — ver `docs/features/report-versioning.md`).

## Garantías (verificadas en `scripts/verify-reports.ts`)

- **Inmutabilidad**: insertar datos operativos después de generar no altera el snapshot (check explícito: una sesión de tiempo tardía de 999 min no cambió el total congelado de 90).
- **Regenerar es la única forma de refrescar** — y crea la versión siguiente, preservando la anterior intacta.
- **Todo lo renderizado sale del snapshot**: vista previa, print/PDF y CSV leen `metricsSnapshot`/`contentSnapshot`, nunca la base operativa — un reporte histórico es reproducible byte a byte.
- **Cambiar la plantilla después no afecta reportes generados** (las secciones viven en el snapshot).
- Escritura de snapshot + versión + estado + auditoría en **una transacción** — un fallo de auditoría revierte todo (convención de `docs/architecture/database-transactions.md`).

## Qué NO se congela

La narrativa editable (`content`, resumen ejecutivo, conclusiones, recomendaciones) vive en la fila del reporte y es del humano; cada generación guarda su línea base determinística en la versión (`report_versions.narrative`) para saber qué propuso el sistema en ese momento, pero no sobreescribe lo editado.
