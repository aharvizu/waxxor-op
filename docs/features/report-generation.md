# Generación de Reportes

> Status: shipped 2026-07-18. Servicio de dominio en `src/lib/report-generation.ts`, independiente de la UI (lo usan las server actions y el motor de Recurrentes).

## Secuencia

1. **Validar** organización (report org-scoped), periodo (existente, start ≤ end), estado (`canTransitionReport(status, "generating")`), cliente y proyecto dentro de la organización.
2. **Resolver plantilla** (org-scoped; default sections sin plantilla).
3. **Consultar datos del periodo** — `computePeriodMetrics` (`src/lib/report-metrics.ts`): 8 grupos de agregados en paralelo (tickets, SLA, actividades, proyectos, tiempo, conversaciones, cobro, recurrentes), consultas de solo lectura **antes** de la transacción de escritura.
4. **Calcular métricas** — todas las fórmulas viven en la capa central (ver `docs/features/indicator-definitions.md`), nunca en el servicio ni en componentes.
5. **Crear snapshot** — `metricsSnapshot` (los números congelados) + `contentSnapshot` (secciones resueltas, línea base de narrativa, plantilla usada).
6. **Narrativa determinística** — `buildNarrative` (pura, unit-tested): enuncia hechos ("Durante el periodo del X al Y se atendieron N tickets…"), **sin IA, sin interpretaciones, sin causas ni recomendaciones inventadas**; omite frases sin datos en lugar de escribir ceros. Solo siembra `content` cuando está vacío — las ediciones humanas sobreviven a la regeneración (la línea base de cada versión queda en `report_versions.narrative`).
7. **Guardar versión** — `report_versions` con número consecutivo (`max + 1`), snapshots, narrativa y autor.
8. **Cambiar estado** a `ready_for_review` (+ `generatedAt`/`generatedByUserId`, limpia `failureReason`).
9. **AuditLog** — evento `generated`/`regenerated` con versión y periodo.

Los pasos 7–9 son **una transacción**: no puede quedar un reporte generado sin versión ni una versión sin auditoría (rollback verificado).

## Fallos

`ReportGenerationError` con código (`no_period`, `bad_period`, `bad_status`, `bad_client`, `bad_project`). La action de generación registra el fallo en el reporte (`status = failed`, `failureReason` acotado, evento `generation_failed`) para que la UI muestre causa + reintentar — sin stack traces al usuario.

## Contenido externo vs interno

- `internalNotes` **jamás** entra a `contentSnapshot`, a las versiones externas, a la vista previa ni al print (verificado con un marcador centinela en `verify-reports.ts`).
- Montos de cobro solo se renderizan en reportes **sin cliente** (internos); un reporte de cliente omite la sección de importes en el print (la configuración explícita de exponerlos queda como futuro — preferencia conservadora documentada).
- Costos internos (`internalHourlyCost`, tarifas) nunca se incluyen en ninguna salida.

## Recurrentes

`createReportForRecurrence(tx, …)` es el punto de entrada del motor: crea el Report en `draft` (dentro de la transacción idempotente del motor) con periodo resuelto, cliente/proyecto/plantilla/responsable, y auditoría `source: "system"` con `generatedByRecurrenceId`. La generación de contenido no ocurre dentro de la transacción del motor (decisión: el flujo humano de generar-revisar-aprobar arranca desde el draft — un clic — manteniendo la transacción del motor mínima y la regla "no aprobar ni enviar automáticamente" imposible de violar por construcción).
