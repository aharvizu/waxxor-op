# Reportes

> Status: shipped 2026-07-18. Implementa E-14 (reportes operativos) sustituyendo el módulo legacy de generación de documentos.
> Rutas: **/reports** (listado), **/reports/new**, **/reports/[id]** (detalle con 6 pestañas), **/reports/[id]/print** (salida PDF), **/reports/templates**.
> Separación funcional: Reports = revisar y comunicar el trabajo realizado; Indicators (`docs/features/indicators.md`) = decidir. Nunca se mezclan en una pantalla.

## Modelo (migración `drizzle/0017_conscious_sentry.sql`)

`reports` extendido: `reportType` (8 tipos: monthly_service, operational_summary, executive_summary, sla_report, time_report, project_report, billing_support, custom_internal), `clientId`/`projectId` opcionales (cliente **obligatorio** para tipos de cara al cliente — `clientRequiredFor`), `periodStart`/`periodEnd`, responsables y timestamps de cada paso del flujo (generated/reviewed/approved/sent + quién), narrativa editable (`content`, `executiveSummary`, `conclusions`, `recommendations`), `internalNotes` (**nunca** en salida externa), **`contentSnapshot`/`metricsSnapshot` jsonb** (ver `docs/architecture/report-snapshots.md`), `version`, `deliveryChannel`/`recipientContactId`. `report_status` amplió (append-only): draft, generating, ready_for_review, changes_requested, approved, sent, failed, archived. Tabla nueva `report_versions` (ver `docs/features/report-versioning.md`).

## Flujo de trabajo

`draft → generating → ready_for_review → approved → sent`, con caminos alternos `ready_for_review → changes_requested → draft/generating`, `generating → failed`, y `approved → draft/generating` al editar (la aprobación nunca sobrevive silenciosamente a una edición — `approval_invalidated_by_edit` auditado). Máquina de transiciones en `canTransitionReport` (`src/lib/reports.ts`, unit-tested): los atajos (draft→approved, draft→sent, sent→approved) están bloqueados.

Reglas verificadas:
- **Aprobar requiere contenido generado** y estampa la versión específica (`report_versions.approvedAt`) en la misma transacción — no puede existir un reporte aprobado sin versión aprobada consistente (check del verify script).
- **Marcar enviado** requiere versión aprobada; enviar desde `ready_for_review` es una **excepción con motivo obligatorio** auditada (`sent_with_exception`). Pide destinatario (contacto del cliente, validado en la org), canal, fecha y notas. **No envía correo ni WhatsApp reales** — solo registra.
- **Sin ajustes manuales de métricas** en el MVP (preferencia explícita del spec §11): las métricas calculadas no son editables; la narrativa sí.

## Periodos (criterios temporales documentados)

`resolvePeriod` (`src/lib/reports.ts`, unit-tested): semana ISO lun–dom, mes, trimestre, año — actual/anterior — resueltos en la **timezone de la organización** (`ORG_TIMEZONE = America/Mexico_City`, la misma convención single-org del resto de Watson) para evitar desfases por hora UTC (test explícito del caso frontera). Cada dato usa su evento correcto: creados por `work_items.created_at`; cerrados por `tickets.closed_at`; tiempo por `time_entries.date` (fecha local, sin deriva); mensajes por `occurred_at`; SLA por las banderas finales congeladas al cierre. Ver `docs/architecture/analytics-queries.md`.

## Exportación

- **PDF**: `/reports/[id]/print` — vista de impresión dedicada (portada con organización/cliente/periodo/responsable/versión/clasificación interna-externa, secciones numeradas, pie de página) que el navegador convierte a PDF con Imprimir. **Decisión documentada**: no se agregó librería PDF (puppeteer/pdfkit violarían "sin herramientas nuevas sin justificación") ni almacenamiento de blobs (el adaptador local no es productivo — misma limitación documentada de attachments); la impresión HTML es un canal explícitamente permitido (spec §12). Los montos de cobro solo aparecen en reportes **internos** (sin cliente); las notas internas jamás se renderizan.
- **CSV**: `GET /api/reports/[id]/export?dataset=summary|tickets|time|sla` — autenticado, org-scoped, UTF-8 con BOM, fechas legibles, **escape anti CSV-injection** (`csvEscape` neutraliza `= + - @` iniciales, unit-tested), descarga con nombre claro, exportación auditada (`exported_csv`).

## Recurrentes

`targetType = "report"` quedó **habilitado** (era la limitación documentada de la feature Recurrentes): una recurrencia de reporte crea el Report en **draft** con el periodo resuelto (`periodRule`: mes/semana/trimestre anterior o mes actual), cliente, plantilla, responsable (assignee de la recurrencia) y título renderizado con variables. **Nunca aprueba ni marca enviado automáticamente; nunca genera contenido falso** — la generación de métricas es un clic del responsable y el flujo de revisión es el normal. La ejecución queda en `recurrence_executions` con `generatedEntityType = "report"`; duplicados imposibles por el índice único de ocurrencias. Verificado en `scripts/verify-reports.ts` (check 9: draft + título renderizado + periodo mes-anterior + responsable).

## Permisos

Crear/generar/editar narrativa/solicitar cambios: cualquier rol interno. **Aprobar, marcar enviado y plantillas**: SuperAdmin/Administrator/Director/Project Manager. Eliminación permanente: SuperAdmin (las versiones cascadean; archivar es la alternativa sin pérdida). `organizationId` nunca del navegador; cliente/proyecto/responsable/contacto revalidados en la org; rol client sin acceso.

## Integraciones

- **Cliente 360**: pestaña Reportes rediseñada (tipo, periodo, versión, estado, enviado + crear/programar); reportes por atender alimentan `buildClientAlerts` (`reportsNeedingAttention`).
- **Proyectos**: tarjeta "Reportes" en el Resumen del proyecto (generar con `?projectId=&type=project_report`, historial filtrado).
- **Hoy**: señales del responsable en No olvides (listo para revisión / cambios solicitados / aprobado sin enviar / generación fallida — esta última severidad alta y no descartable). Verificado en vivo.

## Pruebas

20 unit tests (`reports.test.ts`: periodos/tz, transiciones, narrativa determinística sin interpretaciones, CSV injection, secciones, diccionario de indicadores, umbrales, atención ejecutiva) + `scripts/verify-reports.ts` (14 checks: métricas reales, **inmutabilidad del snapshot ante cambios posteriores**, versión 2 con v1 intacta, aprobación por versión, notas internas sin fuga, aislamiento org en lectura y generación, rollback de auditoría, recurrencia→reporte) + smoke HTTP E2E (crear→generar→aprobar→enviar→CSV→print→Cliente 360→Hoy→umbral).

## Limitaciones conocidas

1. **PDF vía impresión del navegador** — sin archivo persistido (`fileId` del spec queda sin uso hasta que exista almacenamiento productivo; documentado, no bloqueante).
2. **Comparación entre versiones** = metadatos e historial (no diff visual línea a línea — fuera de alcance explícito).
3. Las 2 plantillas legacy (entregables de pentest con `content` de placeholders) siguen existiendo como plantillas de texto; el flujo nuevo usa `sections` (ver `docs/features/report-templates.md`).
4. Timezone de organización fija (`America/Mexico_City`) — consistente con la decisión single-org (OQ-01); parametrizable cuando exista Configuración.

## Branding del PDF (2026-07-18, Configuración)

La vista print (`/reports/[id]/print`) aplica el branding de la organización (`reports.branding` en Configuración → Reportes): logo, título/subtítulo de portada, introducción corporativa, aviso de confidencialidad y pie de página. Todo opcional — sin configurar, la salida es idéntica a la original. El branding es presentación: **no** forma parte del snapshot congelado.
