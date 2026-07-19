# Watson — Current Status vs PRD (per epic)

> Audit date: 2026-07-15, commit `30d7a7a`. Maps the existing codebase to the epics in `docs/backlog/epics.md`.
> **Status legend:** ✅ done for MVP · 🟡 partial (usable base, gaps vs PRD) · 🔴 not started · ⚠️ exists but conflicts with the PRD.

## Summary

| Epic | Status | What exists today |
|---|---|---|
| E-01 Authentication & roles | 🟡 | Credentials login, JWT sessions, `requireUser/requireAdmin`. Only 2 roles (`admin`, `member`) vs 6 in PRD §7. No permission matrix. |
| E-02 Org, teams & configuration | ✅* | Shipped 2026-07-18: módulo `/settings` con 14 secciones (organización/branding/fiscal, usuarios con invitaciones y activación + reasignación, matriz RBAC visual, catálogos por módulo, defaults de clientes/proyectos/recurrentes, branding de reportes, umbrales, navegador de auditoría + CSV, API keys preparadas, diagnóstico de entorno, salud del sistema). *La entidad **Team** sigue sin existir (OQ-02 abierta) — "Mi equipo" continúa equivaliendo a la organización. Ver `docs/features/settings.md`. |
| E-03 Clients & contacts | ✅ | Shipped 2026-07-17 con Cliente 360: modelo de cliente ampliado (estatus, responsables, dirección), entidad `Contact` con contacto principal único transaccional, archivado y hard-delete protegido. Ver `docs/features/client-360.md` y `docs/features/contacts.md`. |
| E-04 Services & contracts | ✅ | Shipped 2026-07-17: catálogo `services` + `client_services` (licencias como `serviceType='license'`) + `contracts`, estados `expiring/expired` derivados, renovaciones consolidadas 90/60/30/15/7/vencido alimentando Hoy. Ver `docs/features/services.md`, `contracts.md`, `renewals.md`. |
| E-05 WorkItem core | 🔴 | No shared base. `tickets` and `tasks` are unrelated tables with different shapes — conversion (R2) impossible on this model. |
| E-06 Activities | 🔴 | No Activity entity. Project `tasks` (todo/in_progress/done) are the closest thing but are project-bound and lack client/date-optional semantics (R1) and subactivities. |
| E-07 Tickets & SLA | 🟡 | Solid helpdesk: statuses, priorities, assignee, client link, comments, updated_at. **No SLA anywhere** (definitions, targets, measurement) — the PRD's core differentiator for tickets. |
| E-08 Activity→Ticket conversion | 🔴 | Nothing; blocked on E-05/E-06. |
| E-09 Projects (Lists > Activities > Subactivities) | ✅ | Shipped 2026-07-17: jerarquía oficial R4 sobre WorkItem (folio, PM obligatorio, participantes, listas reordenables, subactividades máx. 2 niveles, hitos, riesgos con severidad derivada, dependencias sin ciclos, avance/salud calculados, completar con excepción auditada, archivar/restaurar, integración con Hoy y Cliente 360). Tasks legacy migradas; tabla congelada. Ver `docs/features/projects.md`. |
| E-10 Recurrence | ✅ | Shipped 2026-07-18: `RecurrenceDefinition`/`RecurrenceExecution` generan Activity/Ticket/Project Activity a través de los mismos servicios de dominio de esos módulos (folio, SLA snapshot, ciclo de vida oficial); programación propia con timezone IANA y corrección de DST (sin dependencia nueva); idempotencia garantizada por índice único (verificado con concurrencia real); motor aislado por recurrencia; Vercel Cron una vez al día (0 6 * * * — límite del plan Hobby, cambiado desde cada 10 min el 2026-07-19) contra endpoint protegido + runner local; pausa automática tras 3 fallos consecutivos; integraciones con Hoy, Cliente 360 y Proyectos. Reportes habilitado desde 2026-07-18 (crea borradores de Report con periodo resuelto — nunca aprueba ni envía solo). Ver `docs/features/recurring.md`. |
| E-11 Time tracking | 🔴 | No `time_entries` table, no UI. |
| E-12 Today | ✅ | Shipped 2026-07-16: `/today` es la pantalla inicial (resumen, Atención inmediata, No olvides con recordatorios persistentes/auditables, Enfoque del día, Mi trabajo con 3 vistas, Agenda, Esperando, Mensajes, Quick View). El dashboard legado vive en `/dashboard`. Ver `docs/features/today.md`. |
| E-13 Client 360 | ✅ | Shipped 2026-07-17: `/clients/[id]` es la vista 360 (header con stats y alertas + 15 pestañas: resumen, contactos, servicios, licenciamientos, contratos, renovaciones, tickets, actividades, proyectos, conversaciones, tiempo, cobros, reportes, notas, historial legible + AuditLog técnico para SuperAdmin/Administrator). `/clients` rediseñado con búsqueda amplia, filtros y acciones inline. Ver `docs/features/client-360.md`. |
| E-14 Reports | ✅ | Shipped 2026-07-18: reportes operativos por cliente/proyecto/periodo con flujo draft→generating→ready_for_review→approved→sent, snapshots inmutables + versionado, narrativa determinista sin IA, PDF (print) y CSV, plantillas configurables, recurrencia habilitada, integraciones con Cliente 360/Proyectos/Hoy. El módulo legacy de documentos (plantillas con placeholders) quedó absorbido: `report_templates` se extendió al modelo nuevo y el campo `content` legacy se conserva sin uso destructivo (resuelve OQ-18). Ver `docs/features/reports.md`. |
| E-15 Audit log | 🔴 | No audit of any kind. Every mutation is untracked — directly against PRD principle "audit everything important". |
| E-16 Indicators | ✅ | Shipped 2026-07-18: `/indicators` con paneles Executive/Operations/Billing calculados desde datos operativos reales (capa central `src/lib/report-metrics.ts`, diccionario de definiciones con fórmulas documentadas, umbrales configurables auditados, drill-down a vistas existentes, "No disponible" en vez de ceros engañosos, Technician excluido del panel ejecutivo). Los KPIs manuales (`/kpis`) permanecen como complemento, no sustituto (resuelve OQ-19). Ver `docs/features/indicators.md`. |
| E-17 Manual messaging | 🟡 | Shipped 2026-07-19: `/inbox` unifica `Conversation`/`Message` (participantes, menciones, fijar/favorita, no-leídos, eliminación lógica, estados abierta/pendiente/cerrada/archivada) relacionable a Cliente/Contacto/Ticket/Actividad/Proyecto; adaptadores de canal preparados (`internal`/`whatsapp`/`email`/`teams`/`api`) — **solo `internal` operativo**, sin integración externa (fuera de alcance explícito). Ver `docs/features/inbox.md`. |

## Out-of-PRD functionality present in the code

| Feature | Where | PRD position |
|---|---|---|
| **Quotes** (quotes + line items, currency, tax, pipeline stats on dashboard) | `/quotes`, `quotes`/`quote_items` tables, dashboard cards | Not in MVP §9; nearest concept (Billing) is explicitly **future scope §10**. Decision needed: remove, freeze, or formally adopt into scope → registered as OQ-17 in `docs/decisions/open-questions.md` companion note below. |
| Report templates as pentest/security deliverables | seed + `/reports/templates` | Not contradicting, but orthogonal to PRD reports |
| "Revenue" nav section grouping Quotes/Reports/KPIs | app shell | Reflects the pre-PRD product framing |

## What is genuinely reusable as-is

1. **UI foundation** — shell, command menu, theme system, `ui.tsx` library: aligned with CLAUDE.md UI mandate, keep.
2. **Auth plumbing** — Auth.js credentials + JWT + session helpers: extend to 6 roles rather than rebuild.
3. **Helpdesk module** — best-aligned feature; needs SLA, WorkItem base, audit.
4. **Clients module** — ~~needs Contact extraction and 360 view~~ done 2026-07-17 (Cliente 360).
5. **Module conventions** — `page/[id]/new/actions.ts` pattern is a good template for the missing modules.
6. **Seed/env conventions** — `.env`, seed script pattern.

## Net assessment

Roughly **4 of 17 epics have a meaningful head start** (E-01, E-03, E-07, E-09-partial), **2 modules need a product decision** (Quotes; Reports/KPIs reframing), and **11 epics are greenfield**, including everything the PRD treats as differentiating: WorkItem unification, Activities, conversion, SLA, time, Today, audit, recurrence, Client 360, messaging. *(2026-07-17/18 update: E-03, E-04, E-09, E-10, E-12, E-13, E-14 and E-16 are now ✅ — see the table above; this paragraph reflects the original 2026-07-15 audit.)*

New open questions raised by this audit (to add to `docs/decisions/open-questions.md` when triaged):

- **OQ-17** — Keep, freeze or remove the Quotes module? (Billing is future scope.)
- ~~**OQ-18**~~ — resolved 2026-07-18: the document-style templates were absorbed into the new operational report templates (legacy `content` column kept, unused). See E-14 above.
- ~~**OQ-19**~~ — resolved 2026-07-18: manual KPIs remain as a complement at `/kpis`; computed indicators live at `/indicators`. See E-16 above.
- **OQ-20** — Migration strategy for existing production data (users/tickets/tasks) when the PRD schema (roles, WorkItem, Lists) lands — is there production data to preserve?
