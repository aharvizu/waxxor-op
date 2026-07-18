# Configuración (Settings)

> Status: shipped 2026-07-18. Implements E-02 (módulo de Configuración; la entidad Team sigue fuera — OQ-02 abierta) y entrega el navegador global de auditoría pendiente de E-15.
> Ruta: **/settings** con 14 secciones y navegación propia.
> Objetivo: que la organización configure Watson **sin intervención técnica**, reutilizando los módulos existentes — cero motores nuevos, cero catálogos duplicados.

## Acceso

- Módulo completo: **SuperAdmin + Administrator** (`requireRole` en el layout; Technician/Director/PM reciben el redirect estándar — verificado por HTTP: cero contenido filtrado).
- Secciones técnicas **solo SuperAdmin**: Usuarios, API Keys, Entorno, y el calendario laboral dentro de Organización (regla R7 — reutiliza `saveCalendar`/`CalendarForm` de `/sla` sin duplicar).
- Materializa la frontera documentada en `roles-and-authorization.md`: Administrator configura negocio, no lo técnico.

## Modelo (migración `drizzle/0018_regular_zombie.sql`, aditiva)

- **`organization_settings`** — una fila por `(org, key)` (índice único), `value` jsonb **validado por el esquema Zod de su sección** (`src/lib/settings.ts`) antes de escribir; un valor almacenado que deja de validar **degrada a defaults en lectura** (nunca rompe páginas — verificado). Claves: `organization.profile`, `clients.defaults`, `projects.defaults`, `recurrence.defaults`, `reports.branding`.
- **`catalog_items`** — catálogos compartidos: `(org, kind, coalesce(parent,0), name)` único; jerárquico (subcategorías = filas con `parentId`); `config` jsonb (plantillas de proyecto); archivado reversible (`isActive`), hard-delete solo SuperAdmin y sin hijos.
- **`api_keys`** — solo el **hash SHA-256** se almacena; el token (`wxk_<id>_<secreto>`) se muestra exactamente una vez; revocación suave (`revokedAt`).
- **`users`** gana `is_active` (default true), `invitation_token` (único), `invited_at`.

## Secciones

1. **Organización** — nombre (sincroniza `organizations.name`), logo (data URI acotado ~150 KB, sin blob storage), moneda/idioma, color de marca, datos fiscales informativos ("Watson no emite facturas"), y zona horaria + horario laboral = el **calendario de SLA reutilizado** (R7).
2. **Usuarios** — invitación **sin email real** (enlace `/invite/[token]` copiable, token de un solo uso que se limpia al fijar contraseña en la misma transacción), activar/desactivar (login bloqueado en `authorize`: cuenta inactiva o invitación sin aceptar no entra — verificado), **reasignación transaccional** del trabajo abierto al desactivar (work items abiertos, proyectos como PM no finales, recurrencias, reportes no enviados, responsables de cliente — con conteos por dominio en el evento de auditoría; lo histórico/cerrado no se toca). Alta directa/edición/eliminación siguen en `/users` (mismas actions).
3. **Roles y permisos** — matriz **visual de solo lectura** del RBAC real (`src/lib/roles.ts` + las verificaciones `requireRole` reales de cada módulo). Sin motor nuevo; OQ-10 sigue abierta por decisión.
4. **Clientes** — responsables por defecto (aplicados server-side en `createClient` solo cuando el alta rápida los deja vacíos; ids revalidados en la org al guardar), vista del SLA por defecto por prioridad (administrado en `/sla`), catálogos categoría/etiquetas (preparados).
5. **Tickets** — **categorías/subcategorías configurables** (resuelve el catálogo de OQ-09): alimentan datalists en Nuevo ticket, Resolver y el panel de clasificación **manteniendo texto libre** (compatible con datos históricos, nada se migra ni se rompe). Prioridades/modalidades/estados: solo lectura con explicación (enums del sistema).
6. **Actividades** — tipos y prioridades del sistema (solo lectura), etiquetas (catálogo preparado).
7. **Proyectos** — salud y prioridad iniciales (settings, aplicadas en `createProject`/prefill), colores (catálogo, `projects.color` sigue reservado), **plantillas de proyecto**: sus listas se crean transaccionalmente al elegirla en `/projects/new` (plantilla archivada = rechazada), estados solo lectura.
8. **Recurrentes** — timezone/hora por defecto del asistente y **límite de fallos consecutivos configurable**: el motor lo lee por organización (`orgFailureLimit`, fallback a la constante 3) — verificado: con límite 1 la recurrencia pausa al primer fallo. La política "sin reintento automático" se documenta en pantalla.
9. **Reportes** — branding del PDF (logo, portada, pie, textos corporativos, aviso de confidencialidad) consumido por `/reports/[id]/print`; plantillas enlazan a `/reports/templates` (sin duplicar).
10. **Indicadores** — reutiliza `ThresholdForm` + `setIndicatorThreshold` del módulo Indicadores: **un solo write-path y una sola auditoría** para umbrales.
11. **Auditoría** — navegador global (entidad/acción/actor/id/fechas, últimos 100) + **exportación CSV** (mismos filtros vía `buildAuditConditions` compartido, límite 5,000, BOM + `csvEscape`); ruta `/api/audit/export` restringida a SuperAdmin/Administrator (401 al resto — verificado).
12. **API Keys** — preparación de infraestructura únicamente; SSO/LDAP/Azure AD/Google Sync explícitamente fuera de alcance.
13. **Entorno** — diagnóstico de variables (presente/faltante/opcional) con secretos **siempre enmascarados** (`maskSecret`: 4 caracteres + longitud; verificado que el valor completo no aparece en la respuesta).
14. **Salud del sistema** — latencia de BD, versión (package.json), migraciones aplicadas (tabla drizzle), CRON_SECRET configurado, última ejecución de recurrencias + éxitos/fallos 24 h + activas atrasadas, última generación de reportes + fallidos.

## Auditoría

Nuevos entity types: `organization_setting` (evento `setting_saved`, con valor anterior/nuevo — logos redactados como `[imagen]`), `catalog_item` (create/update/archived/restored/delete), `api_key` (create sin token ni hash / `api_key_revoked`); `user` gana `user_invited`, `invitation_regenerated`, `invitation_accepted`, `user_activated`/`user_deactivated` (con conteos de reasignación). Todo dentro de la transacción del negocio (rollback verificado).

## Pruebas

- Unitarias (`src/lib/settings.test.ts`, 15): esquemas por sección (defaults, logo data-URI, límites), kinds de catálogo, `maskSecret` nunca revela más de 4 caracteres, API keys con hash round-trip.
- Integración (`scripts/verify-settings.ts`, **11/11 PASS** contra la BD real): upsert único por (org,key), fallback ante valor inválido, unicidad de catálogo + subnombres repetidos entre padres, aislamiento por organización, hash-only de API keys, desactivación con reasignación (histórico intacto), token de invitación de un solo uso, rollback por fallo de auditoría, **motor pausando al primer fallo con límite 1 configurado**. Limpia todo.
- Smoke HTTP (servidor real): 14 secciones 200 · guardar perfil (auditado) · crear categoría → aparece como datalist en Nuevo ticket · umbral guardado y auditado · invitar → login bloqueado antes de aceptar → aceptar en `/invite/[token]` → login OK → Technician bloqueado de `/settings` sin filtrar contenido → desactivar → login rechazado (`CredentialsSignin`) → reactivar desde la UI (auditado) · CSV con filtros (401 para Technician) · Entorno enmascarado. Datos limpiados (conteos finales 0).

## Limitaciones conocidas (documentadas, no bloqueantes)

1. **Sesiones JWT**: desactivar bloquea el **inicio de sesión**; una sesión ya emitida sigue viva hasta expirar/re-login (TD-11, consistente con el comportamiento de roles).
2. **Catálogos "preparados"** (categorías/etiquetas de clientes, etiquetas de actividades, colores de proyecto): se administran aquí; el campo consumidor llega con la fase correspondiente de su módulo — sin campos simulados.
3. **Estados/prioridades/modalidades no configurables** — enums de base de datos de los que dependen SLA/cierres/facturación; se muestran como catálogo del sistema ("configurable cuando sea compatible": hoy no lo es).
4. **Idioma** es una preferencia guardada sin motor i18n (la UI ya es española/inglesa mixta por módulo); **moneda** es informativa (los montos existentes no se reformatean).
5. **API keys sin consumidor**: ningún endpoint las acepta todavía (preparación explícita del spec).
