# Inbox (Mensajería)

> Status: shipped 2026-07-19. Implements the operational base of E-17 — a unified conversation view across Tickets, Clientes, Actividades y Proyectos.
> Ruta: **/inbox**. **No se integra ningún canal externo** (WhatsApp/Email/Teams/API quedan preparados, no conectados) — PRD principle "WhatsApp is a channel, not the system".

## Objetivo

Una sola bandeja para todo lo conversacional que hoy vivía disperso (el hilo de un ticket, notas internas, futuras conversaciones de cliente/actividad/proyecto), reutilizando exactamente el modelo `conversations`/`messages` que ya sostenía el Composer de Tickets — sin segundo motor de mensajería.

## Modelo (migración `drizzle/0019_cooing_random.sql`, aditiva)

- **`conversations`** — `ticketId` pasó de obligatorio a **opcional** (una conversación puede vivir sin ticket): sigue existiendo el índice único sobre `ticketId` cuando no es null, así que **un ticket admite como máximo una conversación** (regla verificada). Nuevas columnas: `workItemId` (actividad), `projectId`, `subject`, `createdById`, `archivedAt`. `status` gana dos valores de texto nuevos — **open · pending · closed · archived** (los datos previos en `"attended"` se migraron a `"closed"` en la misma migración).
- **`conversation_participants`** (nueva) — estado por usuario: `lastReadAt` (cursor de lectura → no leídos), `pinnedAt` (fijar), `favoriteAt` (favorita). Único `(conversationId, userId)`; fila creada perezosamente al primer contacto del usuario con la conversación.
- **`message_mentions`** (nueva) — menciones explícitas (elegidas en el composer, nunca parseadas por regex de `@`). Único `(messageId, userId)`; `readAt` alimenta el contador de menciones no leídas.
- **`messages`** — `direction` gana el valor **`system`** (eventos del sistema: cambios de estado, participantes agregados — nunca cuentan como no leído ni bloquean el conteo de mensajes de cliente). `deletedAt`/`deletedById` para **eliminación lógica** (el mensaje se oculta en la UI; la fila y su auditoría sobreviven).
- **`conversation_channel`** gana `teams` y `api` (enum append-only) — arquitectura lista, sin integración.

## Capa de dominio compartida

- **`src/lib/conversations.ts`** (puro + transaccional) — `postConversationMessage` es el **único punto de escritura** de un mensaje: inserta la fila, registra menciones (nunca auto-mención), actualiza `conversations.updatedAt`, mueve el cursor de lectura del autor, y — si la conversación pertenece a un ticket — congela el primer response de SLA (mismo guard `IS NULL`, nunca sobreescrito). **El Composer de Tickets (`helpdesk/actions.ts logMessage`) fue refactorizado para usar este mismo servicio** — cero lógica duplicada entre Tickets e Inbox. `recordSystemEvent` envuelve el mismo servicio con `direction: "system"`. `canEditMessage`/`canSoftDeleteMessage` son las reglas puras de propiedad (autor, no eliminado, no evento de sistema).
- **`src/lib/channels.ts`** (puro) — el contrato de adaptador (`ChannelAdapter.deliver()`, nunca lanza, retorna `ChannelSendResult` tipado) y el registro `CHANNEL_ADAPTERS` para los 5 canales de arquitectura (`internal`/`whatsapp`/`email`/`teams`/`api`). **Solo `internal` está `configured: true`** — su "entrega" es la propia escritura en BD. Los demás retornan `{ ok: false, code: "not_configured" }` con una nota explicando que el mensaje quedó registrado en Watson, no enviado externamente; ese resultado se guarda en `metadata.channelNote` del mensaje saliente, nunca oculto. Añadir un canal real en el futuro es implementar un adaptador — el dominio no cambia.
- **`src/lib/inbox-data.ts`** — lecturas org-scoped: `listConversations` (filtros + 8 vistas, un solo round-trip con subconsultas de no-leídos/menciones), `getConversationDetail` (mensajes + menciones + adjuntos + participantes en consultas acotadas), `getUserUnreadMentions`, `getConversationSummary` (agregado reutilizado por las integraciones).

## Vistas /inbox

Todas | No leídas | Mías | Fijadas | Favoritas | Menciones | Sin respuesta (último mensaje entrante) | Archivadas. Filtros: estado, canal, cliente, proyecto, actividad, ticket, texto libre (asunto, cliente, folio, cuerpo de mensajes no eliminados vía `ilike` + `exists`).

## Vista tipo chat

Lista de mensajes cronológica con burbujas por tipo (entrante/saliente/nota interna resaltada/evento de sistema centrado), menciones y adjuntos inline, panel lateral con vínculos (Ticket/Cliente/Actividad/Proyecto, cada uno enlaza al detalle real) y participantes. El composer alterna entre **Responder** (saliente), **Nota interna** (nunca sale del equipo) y **Registrar entrante** (log manual de lo que dijo el cliente) — el canal es seleccionable pero **registrar no es enviar**.

## Reglas de negocio implementadas

1. **Cada conversación puede vincularse a Cliente, Contacto, Ticket, Actividad y Proyecto simultáneamente** — todos opcionales excepto que debe existir al menos un asunto o un vínculo al crear. Cada id foráneo se revalida dentro de la organización (`validateLinks`); el contacto debe pertenecer al cliente si ambos están presentes.
2. **Un ticket, una conversación** — reutilizar la existente al crear/vincular; intentar una segunda es rechazado (regla de negocio + índice único, verificado con concurrencia real de constraint).
3. **Editar mensajes propios**: solo el autor, solo si no está eliminado y no es evento de sistema (`canEditMessage`) — misma regla para notas y mensajes.
4. **Eliminación lógica**: mismo dueño; el cuerpo y la fila persisten para auditoría, la UI muestra "Mensaje eliminado".
5. **Menciones explícitas**: seleccionadas en el composer (checkboxes de usuarios internos), nunca auto-mención, nunca parseo de texto.
6. **No leídos**: cursor por usuario (`lastReadAt`), se marca automáticamente al abrir la conversación (`AutoMarkRead`) y manualmente con "Marcar no leída".
7. **Fijar / favorita**: estado por usuario, no global — cada quien fija lo suyo.
8. **Adjuntos**: reutiliza `src/lib/attachments.ts` (límite 15 MB, mismo storage) — nada nuevo.
9. **Estados**: abierta → pendiente → cerrada, con archivada como estado terminal reversible (el composer se bloquea archivada; una respuesta entrante reabre automáticamente una conversación cerrada).
10. **`organizationId` nunca viene del navegador**; toda mutación revalida los ids foráneos dentro de la organización del actor.

## Integraciones

- **Hoy**: la sección "Mensajes recientes" gana un bloque "Te mencionaron" (hasta 5, `getUserUnreadMentions`) con enlace directo a la conversación y a `/inbox?view=mentions`.
- **Cliente 360**: la pestaña Conversaciones ahora incluye también conversaciones sin ticket (subject-only) y expone "Abrir en Inbox" / "Nueva conversación" con el cliente preseleccionado.
- **Tickets**: la pestaña Conversation del detalle gana el botón "Abrir en Inbox" (`?ticketId=`); el Composer del ticket sigue viviendo ahí — mismo servicio de escritura por debajo.
- **Actividades**: botón "Conversaciones" (`?workItemId=`) en el detalle.
- **Proyectos**: tarjeta "Conversaciones" en Resumen (ver conversaciones del proyecto / crear una nueva).

## Permisos

Reutiliza el RBAC existente: `requireUser()` en todas las acciones/lecturas (cualquier rol interno participa); `client` sin acceso (hereda `/no-access`). No se creó ninguna regla de permiso nueva.

## Pruebas

- Unitarias (`src/lib/conversations.test.ts`, 12 casos): reglas de propiedad de edición/eliminación (autor, eliminado, evento de sistema, nota interna), catálogo de estados (rechaza el legado `"attended"`), los 5 adaptadores de canal (`internal` configurado y entrega sin ref externa; los otros 4 reportan `not_configured` sin lanzar), resolución de `channelAdapter`.
- Integración (`scripts/verify-inbox.ts`, **14/14 PASS** contra la BD real): conversación sin ticket con actividad+cliente+proyecto, el servicio compartido mueve el cursor del autor, menciones (sin auto-mención) y su feed de no-leídos, semántica de no-leído entre dos usuarios, eliminación lógica preserva la fila, **SLA first-response se congela una sola vez a través del servicio compartido**, eventos de sistema excluidos del conteo de no-leídos, agregado de integración, **un ticket admite exactamente una conversación** (índice único), aislamiento por organización, rollback transaccional ante fallo de auditoría.
- Smoke HTTP (servidor real): crear conversación con mensaje inicial → nota interna con mención a un colega real → cambio de estado a Pendiente (evento de sistema visible) → fijar → favorita → agregar participante (evento de sistema) → enviar mensaje con adjunto real (descargable) → eliminar mensaje propio (lógico, cuerpo preservado) → búsqueda por folio/cliente → filtros por vista/cliente → desde un ticket real, "Abrir en Inbox" crea la conversación vinculada → el colega mencionado ve "Te mencionaron" en Hoy y la conversación en `?view=mentions` → Cliente 360 exhibe la conversación y sus enlaces → Actividades/Proyectos muestran sus botones/tarjeta de Inbox. Todos los datos de prueba limpiados (conteos finales 0, sin organización secundaria residual).

## Limitaciones conocidas (documentadas, no bloqueantes)

1. **Ningún canal externo integrado** — WhatsApp/Email/Teams/API existen como adaptadores no configurados; "registrar" un mensaje de esos canales es un log manual, nunca un envío real (fuera de alcance explícito).
2. **Sin IA, llamadas, videollamadas ni chatbot** — fuera de alcance explícito del sprint.
3. **Menciones sin notificación push/email** — solo aparecen en Hoy e Inbox al recargar; no hay socket ni polling en tiempo real (consistente con el resto de Watson, sin infraestructura de tiempo real).
4. **Contact requiere Client**: mencionar un contacto sin cliente asociado es rechazado — es la regla ya existente del modelo `Contact`, no una limitación nueva de Inbox.
