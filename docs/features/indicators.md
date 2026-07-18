# Indicadores

> Status: shipped 2026-07-18. Implementa E-16 (indicadores medidos desde datos operativos — los KPIs manuales de `/kpis` siguen existiendo como complemento, OQ-19).
> Ruta: **/indicators** — SuperAdmin, Administrator, Director y Project Manager. **Technician no accede** (redirect de `requireRole`; sus indicadores personales viven en Hoy). Client rechazado siempre.

## Objetivo

Responder con datos reales: cómo opera la organización, qué requiere atención, si se cumplen los SLA, dónde se invierte el tiempo, qué clientes consumen más, qué está pendiente de cobro, qué proyectos están en riesgo y qué tendencias empeoran. **Sin predicciones, sin IA, sin recomendaciones estratégicas inventadas** — solo hechos contra umbrales configurados.

## Paneles

1. **Executive Overview** (default): Atención requerida (reglas determinísticas de `buildExecutiveAttention` — crecimiento de backlog ≥ umbral, SLA bajo objetivo, tickets vencidos, proyectos en riesgo, cobro sin revisar, reportes vencidos, recurrencias fallidas — alta severidad primero), scorecards de Operación/SLA/Tiempo-Cobro/Proyectos-Recurrentes-Reportes, y tabla de salud por cliente (top 15 por consumo).
2. **Operations**: carga abierta por persona (tickets/actividades/vencidos — detecta saturación y trabajo sin asignar), categorías del periodo, tiempo por persona, señales (cerrados sin tiempo, sin responsable, por confirmar, conversaciones pendientes).
3. **Billing Operations**: por revisar (acción directa), monto potencial/cobrado, tiempo facturable, distribución completa de estados de cobro. **No emite facturas.**
4. **Umbrales**: configuración editable (ver `docs/features/indicator-thresholds.md`).

## Alcances y periodos

Selectores visibles: periodo (semana/mes/trimestre/año, actual/anterior — resueltos en timezone de la org) + alcance (organización / cliente / usuario) vía query params validados servidor-side (ids revalidados dentro de la organización — un id foráneo simplemente no filtra datos ajenos porque toda consulta lleva `organizationId` de sesión). Alcance "Proyecto" se cubre vía drill-down a `/projects` y los reportes de proyecto. La comparación con el periodo anterior existe donde es segura (crecimiento de backlog: `backlogAt(fin) vs backlogAt(fin del periodo anterior)`); **sin periodo anterior no se fabrica la comparación** (unit-tested). Un periodo en curso muestra la advertencia "los datos aún no son definitivos".

## Reglas de visualización

Scorecards compactos con título, valor, definición y fórmula en el tooltip, y **drill-down** a la vista existente filtrada (nunca tablas paralelas — spec §26): `/helpdesk?view=…`, `/projects?view=…`, `/recurring?view=…`, `/reports?view=…`, `/clients/[id]`. "**No disponible**" cuando el denominador es 0 — nunca un 0 engañoso. **Sin utilización porcentual**: no existe capacidad laboral configurada y no se inventan horas disponibles (nota visible en el panel). Sin gráficas decorativas — el MVP privilegia scorecards y tablas accionables; las tendencias visuales (líneas/barras) quedan para cuando haya snapshots históricos (ver `docs/architecture/analytics-queries.md` §Futuro).

## Fórmulas

Todas viven en `src/lib/report-metrics.ts` (implementación) y `src/lib/indicators.ts` (diccionario) — ver `docs/features/indicator-definitions.md`. Ningún componente calcula sus propios números.
