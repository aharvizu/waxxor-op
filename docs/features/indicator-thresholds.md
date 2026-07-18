# Umbrales de Indicadores

> Status: shipped 2026-07-18. Tabla `indicator_thresholds` (clave-valor por organización, única por `(org, key)`); defaults en `INDICATOR_THRESHOLD_DEFAULTS` (`src/lib/indicators.ts`).

## Valores por defecto (documentados)

| Clave | Default | Uso |
|---|---|---|
| `sla_target_pct` | 90 % | Objetivo de cumplimiento de SLA (Atención requerida cuando el real queda debajo) |
| `client_inactive_days` | 30 días | Cliente "sin interacción reciente" en la tabla de salud |
| `report_overdue_days` | 5 días | Días tras el fin de periodo para considerar un reporte vencido |
| `renewal_upcoming_days` | 30 días | Renovación "próxima" (alineado con la regla existente de Cliente 360/Hoy) |
| `backlog_critical_pct` | 25 % | Crecimiento de backlog vs periodo anterior considerado crítico |
| `recurrence_failures_allowed` | 3 | Fallos consecutivos permitidos (documenta el valor del motor de Recurrentes) |

`mergeThresholds` superpone las filas de la organización sobre los defaults e **ignora claves desconocidas** (unit-tested) — no es un sistema de OKR ni acepta métricas arbitrarias.

## Permisos y auditoría

- **Editar**: SuperAdmin y Administrator (`setIndicatorThreshold` — Zod valida que la clave exista en los defaults y el rango del valor; upsert transaccional).
- **Ver**: Director (y PM) consultan los valores en el panel Umbrales, solo lectura.
- Cada cambio se **audita** (`indicator_threshold`, campo = clave, valor anterior → nuevo; el valor anterior de una clave sin override es el default).
- `organizationId` siempre de sesión — el formulario solo envía `key` y `value`.

## Efecto

Los umbrales alimentan exclusivamente reglas determinísticas: `buildExecutiveAttention` (Executive Overview), el cálculo de reportes vencidos del pipeline, y la inactividad de clientes en la tabla de salud. Cambiar un umbral cambia qué se destaca — nunca cambia los datos.

## Superficie en Configuración (2026-07-18)

Configuración → Indicadores (`/settings/indicators`) reutiliza exactamente el mismo `ThresholdForm` + `setIndicatorThreshold`: un solo write-path, una sola auditoría, un solo conjunto de reglas de permiso (SuperAdmin/Administrator). El panel de umbrales dentro de `/indicators` sigue existiendo para Director en modo lectura.
