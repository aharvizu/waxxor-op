# Hoy (Today)

> Status: shipped 2026-07-16. Implements E-12 — Watson's home screen and the PRD promise "Nothing should be forgotten".
> Route: **/today** (login and `/` land here; the legacy dashboard moved to `/dashboard`). Deterministic rules only — **no generative AI**.

## Objetivo

Responder en una sola pantalla accionable: *¿qué debo atender ahora y qué no debo olvidar?* Consolida Actividades, Tickets, SLA, Time Entries, conversaciones, confirmaciones y alertas.

## Usuarios y alcances

Todos los roles internos ven el mismo diseño; `client` no accede (redirige a `/no-access`). El contenido se filtra por **alcance**: *Mi trabajo* (asignado a mí) · *Mi equipo* · *Toda la organización*. Defaults por rol: Technician → Mi trabajo; Project Manager → Mi equipo; Director/Administrator/SuperAdmin → Toda la organización. **Limitación documentada:** la entidad Team no existe (OQ-02), por lo que "Mi equipo" equivale hoy a "Toda la organización" — sin datos simulados. Los indicadores de "sin asignar" son siempre org-wide (son colas compartidas).

## Fuentes de datos

Un solo barrido de work items (tickets + actividades no archivadas/convertidas, límite 300 c/u) con CTEs para minutos activos y último mensaje por conversación (**sin N+1**); consultas separadas para last-touch por cliente, marcas de recordatorio, tiempo registrado del día y mensajes recientes. Todo org-scoped desde la sesión (`src/lib/today-data.ts`).

## Secciones

1. **Encabezado**: saludo por hora (CDMX), fecha, resumen textual desde conteos reales ("Tienes X pendientes, Y vencidos y Z SLA en riesgo"), selector de alcance/vista/fecha, Actualizar (router.refresh), **+ Crear** (Actividad, Reunión y Recordatorio como tipos de actividad preseleccionados, Ticket, Cliente; tiempo se registra desde el elemento) y búsqueda (⌘K existente).
2. **Resumen del día**: 9 indicadores accionables (para hoy, vencidos, tickets nuevos, sin asignar, SLA en riesgo/vencidos, por confirmar, conversaciones, cobro por revisar) — cada uno es un enlace-filtro. Sin gráficas.
3. **Atención inmediata**: máx. 5, orden del spec — 1 SLA vencido · 2 crítico sin respuesta · 3 SLA crítico (≤10% de la ventana real del snapshot) · 4 actividad urgente vencida · 5 cliente esperando respuesta · 6 reabierto · 7 otros vencidos — con Ver todos, Quick View y acciones inline. Recurrentes no se simulan (no existe el modelo).
4. **No olvides** (ver abajo).
5. **Enfoque del día**: máx. 3 recomendaciones deterministas (`buildFocus`) con impacto y enlace filtrado; vacío cuando no hay nada que recomendar.
6. **Mi trabajo**: lista inteligente (vencidos → SLA en riesgo → prioridad → fecha → sin fecha), Agenda (cronológica + "Durante el día") y Tabla compacta (10 columnas). 12 filtros rápidos + 7 agrupaciones. Identificación visual por tipo (Ticket/Actividad/Act. relacionada/Reunión/Recordatorio vía badges sobrias).
7. **Agenda lateral**: elementos del día con hora (target de SLA) y sin hora, navegación día anterior/siguiente, reagendar inline.
8. **Esperando**: waiting_customer/third_party/pending_confirmation/waiting/blocked con antigüedad, responsable, seguimiento programado y acciones (registrar seguimiento → composer del ticket, reagendar).
9. **Mensajes recientes**: última interacción por conversación (de tickets) con filtros No atendidos/Míos/Sin asignar/Todos y acciones (abrir, registrar respuesta, marcar atendida — auditada). **Menciones (2026-07-19)**: bloque "Te mencionaron" (hasta 5, `getUserUnreadMentions`) con enlace directo a la conversación en `/inbox` y a `/inbox?view=mentions` — la bandeja completa de todas las conversaciones (con o sin ticket) vive en `/inbox`, ver `docs/features/inbox.md`. "Crear ticket desde conversación" no aplica: las conversaciones de ticket siguen siendo 1:1 con su ticket.
10. **Quick View**: drawer server-rendered vía `?peek=t:ID|a:ID` — datos clave + acciones frecuentes (asignar/estado/prioridad para tickets; completar/reabrir/reagendar/convertir para actividades) + enlaces al detalle completo. No duplica la pantalla de detalle.

## No olvides (núcleo)

Reglas deterministas sobre datos reales (`evaluateReminders`, umbrales en `REMINDER_THRESHOLDS`): confirmación pendiente >2 días · espera cliente/tercero sin actividad >3 días · actividad sin responsable >24 h · actividad vencida · cerrado con cobro pending_review · cerrado en cobro mensual sin marcar cobrado · cliente sin interacción >30 días (last-touch calculado) · resuelto/cerrado sin TimeEntry activo · **renovaciones ≤30 días o vencidas** (desde 2026-07-17, Cliente 360: `evaluateReminders` recibe `getOrgRenewals(org, 30)` — servicios/licencias activos con `renewalDate` y contratos activos con `endDate` — y emite `renewal_<fuente>_<id>` con severidad alta si está vencida o ≤7 días, enlace a `/clients/[id]?tab=renewals`; misma fuente que las alertas de Client 360, ver `docs/features/renewals.md`). **Proyectos (2026-07-17):** `evaluateReminders` también recibe `getUserProjectSignals(org, user)` — hitos del responsable vencidos o ≤7 días, riesgos altos/críticos abiertos asignados y proyectos en riesgo/bloqueados del PM — y emite `milestone_<id>`, `project_risk_<id>` y `project_at_risk_<id>` con enlaces directos a la pestaña correspondiente; consultas acotadas, nunca se cargan proyectos completos. En Mi trabajo, las actividades de proyecto y subactividades se identifican con badges propios ("Act. de proyecto"/"Subactividad") sin duplicar la entidad. **Recurrentes (2026-07-18):** `evaluateReminders` recibe `getUserRecurrenceSignals(org, user)` — recurrencias del usuario con ejecución fallida (`status = "error"`), vencidas sin procesar, sin responsable configurado, o próximas a finalizar (`endAt` ≤14 días) — y emite `recurrence_<razón>_<id>` con enlace a `/recurring/[id]`; las señales críticas (`failed`/`overdue`) no son descartables. Los objetos generados por una recurrencia (Activity/Ticket) **son objetos normales** y aparecen en Mi trabajo/Atención inmediata sin ninguna vista paralela — spec: "no crear una vista paralela". El resumen del día agrega 3 indicadores (recurrencias programadas hoy, con error, generado hoy) desde `getRecurrenceSummary`, un solo agregado por organización. Ver `docs/features/recurring.md`. **Reportes (2026-07-18):** `evaluateReminders` recibe `getUserReportSignals(org, user)` — reportes del responsable listos para revisión, con cambios solicitados, aprobados sin marcar enviado, o con generación fallida (esta última severidad alta y no descartable) — y emite `report_<razón>_<id>` con enlace a `/reports/[id]`. Atención inmediata no se satura: los reportes viven en No olvides (decisión documentada — Atención inmediata es estrictamente WorkItem). Ya no queda ninguna regla pendiente por falta de modelo.

Cada recordatorio: título, explicación, objeto, antigüedad, severidad, acción recomendada y acciones. **Persistencia auditable** en `operational_reminders` (migración `drizzle/0013`, único por org+regla+entidad): *posponer* (1/3/7 días), *descartar* (solo reglas que lo permiten), *resolver*; cada marca genera evento `reminder_snoozed|dismissed|resolved` en AuditLog. Los resueltos desaparecen y **reaparecen solos** cuando la condición se re-dispara después de la marca (`conditionSince > actedAt`, unit-tested). La sección no puede quitarse de la pantalla.

## Preferencias

`user_preferences` (fila única por usuario, jsonb `today`): alcance, vista, filtro y agrupación se guardan al cambiarlos (POST-redirect-GET) y se aplican al volver sin parámetros.

## Rendimiento y estados

Tres límites de Suspense independientes (core / recordatorios / mensajes) con skeletons propios; cada sección captura sus errores y muestra un error parcial sin romper la pantalla. Sin caché adicional: los datos son operativos y deben estar frescos; el botón Actualizar usa `router.refresh()` (re-render RSC sin recarga completa). Consultas con CTEs y límites (300 items, 200 filas visibles). Estado "sin trabajo" con acciones (ver próximos, crear actividad, tickets sin asignar); las ausencias de configuración (sin SLA/clientes/usuarios) degradan a secciones vacías, nunca bloquean.

## Permisos y seguridad

organizationId siempre de sesión; ids foráneos verificados contra la org; Zod en todas las actions (incluye normalización de selects vacíos); transacciones + auditoría en marcas de recordatorio, reagendado (vía `updateWorkItemFields`) y conversación atendida; las mutaciones de tickets/actividades reutilizan las actions de sus módulos — cero lógica duplicada.

## Criterios de aceptación (verificados 2026-07-16, dev)

Login → `/` → `/today` · saludo/resumen desde datos reales · Atención inmediata con SLA vencido arriba · No olvides detectó confirmación estancada y actividad huérfana (sin falsos positivos) · snooze ocultó el recordatorio, persistió con `snoozed_until` y auditó `reminder_snoozed` · technician arrancó en Mi trabajo viendo solo lo suyo y con `?scope=org` vio todo · preferencias persistidas y aplicadas (vista tabla) · Quick View abre con folio y acciones · mensajes entrantes listados con "Registrar respuesta"/"Atendida" · rol client → 307 `/no-access` · 12 unit tests de reglas (ranking 1–7, orden inteligente, umbrales, marcas snooze/resolve/reaparición, focus, saludo/resumen).

## Limitaciones y futuro

"Mi equipo" = org hasta que exista Team (OQ-02) · Kanban/Gantt/calendario mensual/vistas persistentes complejas fuera de alcance · recurrentes/reportes sin regla hasta tener modelo (renovaciones ya tienen regla desde Cliente 360) · Playwright no está en el repo (no se agregó sin autorización); los flujos E2E se verificaron por HTTP · Watson Advisor con IA es futuro (las reglas actuales son el sustrato).
