# Plantillas de Reporte

> Status: shipped 2026-07-18, parte de Reportes. Tabla `report_templates` extendida (migración `drizzle/0017`).

## Modelo

Campos nuevos sobre la tabla existente: `reportType`, **`sections` jsonb** (`[{ key, title, enabled, intro? }]` en orden de despliegue, validado con `sectionsSchema` — nunca JSON libre), `defaultPeriodRule`, flags (`includeLogo`, `includeCover`, `includeExecutiveSummary`, `includeConclusions`, `includeRecommendations`), `status` (active/inactive/archived), `createdById`, `updatedAt`, `archivedAt`. El campo legacy `content` (texto con placeholders) se conserva con default `""` para las 2 plantillas seed de entregables — no se migran ni se rompen.

## Secciones disponibles

Portada · Resumen ejecutivo · Resumen del periodo · Tickets · SLA · Actividades · Proyectos · Tiempo · Conversaciones · Cobro operativo · Recurrentes · Riesgos · Conclusiones · Recomendaciones · Anexos (claves en `REPORT_SECTIONS`, `src/lib/reports.ts`). `defaultSections()` habilita todas menos riesgos/recomendaciones/anexos.

Lo permitido por plantilla (spec §6, sin editor visual complejo): activar/desactivar secciones, ordenar (orden del array), cambiar títulos, texto introductorio opcional por sección. El editor (`/reports/templates`) es un formulario con checkboxes + un textarea JSON validado servidor-side — deliberadamente simple.

## Resolución en generación

`generateReport` resuelve la plantilla del reporte (validada en la org); sin plantilla usa `defaultSections()`. Las secciones resueltas se congelan dentro de `contentSnapshot` — cambiar la plantilla después **no** altera reportes ya generados (los snapshots mandan). La vista previa y el print renderizan solo las secciones `enabled` del snapshot.

## Permisos

Crear/editar plantillas: SuperAdmin/Administrator/Director/Project Manager (`saveReportTemplate`, auditado con create/update). Sin borrado — `status: archived` las retira de la selección.
