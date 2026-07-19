# Contactos

> Status: shipped 2026-07-17, parte de Cliente 360 (E-13). Tabla: `contacts` (migración `drizzle/0014_cloudy_true_believers.sql`).
> **Actualizado 2026-07-20**: Contact es ahora una entidad independiente con su propia pantalla (`/contacts`, Contacto 360) — ver `docs/features/companies-contacts.md`. La FK se renombró `clientId`→`companyId` y se agregó `department`; el resto del modelo y las reglas de esta página siguen vigentes sin cambios.

## Modelo

`contacts`: `companyId` (FK cascade a `companies`), `firstName`/`lastName`, `jobTitle`, `department`, `email`/`phone`/`mobile`/`whatsappNumber`, `contactType` (`owner|primary|technical|administrative|billing|management|requester|other`), `isPrimary`, `isActive`, `notes`.

`whatsappNumber` existe como campo de datos (no de mensajería activa) — mantiene el modelo listo para el canal WhatsApp futuro sin acoplar Manual Messaging a Contactos todavía.

## Contacto principal (regla central)

Exactamente **un** contacto activo por cliente puede tener `isPrimary = true`. La operación de "hacer principal" (`setPrimaryContact` / al marcar el checkbox en crear-editar) es transaccional:

1. Degradar (`isPrimary = false`) a cualquier otro contacto del mismo cliente que fuera principal.
2. Promover (`isPrimary = true`) al contacto objetivo.
3. Apuntar `clients.primaryContactId` al nuevo contacto.
4. Un evento de auditoría (`metadata.event = "primary_contact_changed"`).

Los cuatro pasos ocurren en la misma transacción de base de datos — si cualquiera falla, ninguno se aplica (no puede quedar un cliente con dos principales ni con cero). Verificado en `scripts/verify-client360.ts`.

Un contacto **inactivo no puede ser principal** — `setPrimaryContact` lo rechaza con un error de negocio.

## Archivar, no borrar

`toggleContactActive` es soft (cambia `isActive`); si el contacto archivado era el principal, `clients.primaryContactId` se limpia (`null`) en la misma transacción. Un contacto puede reactivarse sin perder historial.

**Hard delete** (`deleteContact`) es SuperAdmin-only y está **bloqueado** si el contacto está referenciado por `tickets.confirmedByContactId`, `conversations.contactId` o `messages.contactId` — el mensaje de error sugiere archivar en su lugar. Sin referencias, el borrado es permanente y auditado con un snapshot (`metadata.values`).

## Dónde vive la UI

Pestaña **Contactos** de Client 360 (`/clients/[id]?tab=contactos`): tabla con nombre, tipo, email/teléfono, estado, y acciones inline (Hacer principal, Archivar/Restaurar). Formulario de alta en un `<details>` colapsable (`Disclosure`).

## Limitaciones conocidas

- No hay opt-in/opt-out de canal por contacto todavía (se añadirá cuando exista mensajería real).
- `whatsappNumber` no se valida contra un formato E.164 — es texto libre por ahora.
