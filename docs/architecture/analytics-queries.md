# Analytics Queries

> Status: adopted 2026-07-18, para Reportes e Indicadores. Capa central: `src/lib/report-metrics.ts` (+ `src/lib/indicator-data.ts` para agregados exclusivos de Indicators).

## Principio

**Una sola capa calcula todos los números.** `computePeriodMetrics(orgId, period, scope)` alimenta tanto los snapshots de Reportes como los paneles de Indicadores — las fórmulas viven una vez (spec §25: "no dispersar fórmulas en múltiples componentes"). Los componentes solo formatean.

## Estrategia de consultas (MVP)

- **Agregados de un solo paso** con `count(*) filter (where …)` / `sum(…) filter (…)` — un `SELECT` por grupo de métricas, nunca N+1.
- **8 grupos en paralelo** (`Promise.all`): tickets, SLA, actividades, proyectos, tiempo, conversaciones, cobro, recurrentes.
- **Desgloses acotados**: `group by` con `limit 12–15` (por técnico, categoría, cliente, prioridad…) — nunca tablas sin límite.
- **Límites de periodo**: `periodBounds` convierte las fechas locales de la org a instantes UTC (bordes de día en `America/Mexico_City`) — evita duplicidad/omisión por desfase horario en columnas timestamp; las columnas date (`time_entries.date`) se comparan como fechas locales directamente.
- **Alcance**: `organizationId` siempre de sesión en cada consulta; `clientId`/`projectId`/`userId` opcionales como filtros adicionales revalidados.

## Índices que soportan estas consultas

Ya existentes de features previas: `work_items (org, type, status, client, assignee, due_date, created vía PK)`, `time_entries (org, work_item, user, date, billing, type)`, `tickets (folio único, work_item único)`, `recurrence_exec (org,status) y (definition, scheduled_for)`. Nuevos en `drizzle/0017`: `reports (org,status)`, `(client)`, `(project)`, `(responsible)`, `(period_end)`; `report_versions (report, version)` único; `indicator_thresholds (org, key)` único.

## Caché y revalidación

Sin caché adicional en el MVP: los datos son operativos y deben estar frescos; las páginas son server components dinámicos y las mutaciones revalidan sus rutas. La única "caché" del sistema son los **snapshots de reportes**, que son evidencia intencional, no optimización (`docs/architecture/report-snapshots.md`).

## Errores parciales y estados

Cada panel/pestaña consulta solo lo suyo; una sección que falla no rompe la pantalla (patrón de secciones existente). "No disponible" cuando el denominador es 0; advertencia visible con periodo en curso.

## Límites actuales y estrategia futura (documentada, no implementada)

Con el volumen actual (una organización, cientos de filas) las consultas agregadas directas responden en milisegundos. Cuando el volumen real lo justifique (decenas de miles de work items o consultas de tendencia multi-periodo):

1. **Primera palanca**: vistas SQL para los agregados más repetidos (sin cambiar la capa TS).
2. **Segunda**: snapshots diarios de indicadores (una tabla `indicator_snapshots` alimentada por el cron existente de Recurrentes) — habilitaría además las gráficas de tendencia sin costo de cómputo en request.
3. **Última**: materialized views con refresh programado.

No se agregó ninguna de las tres (complejidad prematura — preferencia explícita del spec §31); este documento es el plan de escalamiento.
