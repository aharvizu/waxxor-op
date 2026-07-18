# Diccionario de Indicadores

> Status: shipped 2026-07-18. Fuente única: `INDICATOR_DEFINITIONS` en `src/lib/indicators.ts` (key, name, description, formula, unit, source, drillDownRoute, emptyState) + implementación en `src/lib/report-metrics.ts`. Unit-tested: claves únicas y campos completos en cada definición.

## Criterios temporales (aplican a todo el diccionario)

| Dato | Evento | Columna |
|---|---|---|
| Tickets creados | creación | `work_items.created_at` |
| Tickets cerrados/resueltos | cierre/resolución | `tickets.closed_at` / `resolved_at` |
| Reaperturas | última reapertura | `tickets.last_reopened_at` |
| Tiempo | fecha de la sesión | `time_entries.date` (fecha local) |
| Mensajes | ocurrencia | `messages.occurred_at` |
| SLA | banderas finales congeladas al cierre | `tickets.sla_*_met` |
| Recurrencias | programación de la ocurrencia | `recurrence_executions.scheduled_for` |

Límites de periodo: bordes de día en la timezone de la organización convertidos a instantes UTC (`periodBounds`).

## Indicadores

**Backlog** — tickets creados ≤ fin del periodo, sin `closed_at` ≤ fin, estado ≠ cancelled. Instantáneo con `backlogAt(t)` para comparaciones. Drill-down: `/helpdesk?view=all`.

**Tickets nuevos / cerrados** — conteos por los eventos de la tabla anterior. Drill-down: `/helpdesk?view=new|closed`.

**Tasa de reapertura** — `reabiertos ∈ periodo / cerrados ∈ periodo × 100`; "No disponible" sin cierres. Drill-down: `/helpdesk?view=reopened`.

**Cumplimiento de SLA (resolución)** — `count(sla_resolution_met = true) / count(sla_resolution_met is not null) × 100` sobre tickets **cerrados en el periodo**. Exclusiones por construcción: cancelados y tickets sin snapshot de SLA nunca reciben bandera final (se reportan como `excludedNoSla`); las excepciones de tiempo documentadas se cuentan aparte (`timeExceptions`). Drill-down: `/helpdesk?view=overdue`.

**Cumplimiento de primera respuesta** — misma fórmula sobre `sla_first_response_met`.

**Primera respuesta promedio** — `avg(first_response_at − created_at)` en minutos naturales para respuestas del periodo. Las pausas de SLA **no** aplican a la primera respuesta (la política existente de SLA solo pausa la ventana de resolución — documentado, no asumido).

**Resolución promedio** — `avg(resolved_at − created_at)` en minutos naturales para resoluciones del periodo.

**Tiempo registrado / facturable / no facturable / en contrato / por revisar** — `sum(duration_minutes)` de sesiones **no anuladas** con fecha en el periodo, por `billing_status`; desgloses por persona/cliente/tipo de objeto/modalidad.

**Cobro: por revisar / cobrable / incluido / precio fijo / mensual / cobrado / sin cargo** — conteos por `tickets.billing_status` sobre tickets tocados por el periodo (creados o cerrados en él). **Monto potencial** = `sum(calculated_amount)` en estados cobrables; **monto cobrado** = suma en `charged`. **Tickets sin clasificación** = `pending_review`.

**Proyectos activos / en riesgo / completados / vencidos / hitos vencidos / riesgos altos / sin actualización** — sobre `projects` (+ subconsultas de hitos/riesgos); "en riesgo" = `status at_risk` o `health_status at_risk|blocked`; "sin actualización" = >14 días sin `updated_at`.

**Recurrencias: ejecuciones/exitosas/fallidas/omitidas/generadas** — por `scheduled_for` en el periodo; **tasa de éxito** = `succeeded / (succeeded + failed)`; activas/en error/vencidas sin procesar desde `recurrence_definitions`.

**Reportes en flujo** — conteos por estado (excluye archivados); **vencidos** = estados abiertos con `period_end` anterior a hoy menos el umbral `report_overdue_days`.

**Salud por cliente** — abiertos, vencidos, cobro pendiente, tiempo del periodo, reportes pendientes, inactividad (> umbral `client_inactive_days`) — una consulta con subqueries correlacionadas, límite 15.

**Cerrados sin tiempo** — tickets cerrados en el periodo sin ninguna sesión activa (señal de datos incompletos que corrompen rentabilidad — riesgo documentado en system-overview §9.4).
