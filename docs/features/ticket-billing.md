# Ticket Operational Billing

> Status: shipped 2026-07-16 (Tickets Operativos feature). Operational classification only — **no invoices are emitted** and contracts are not automatic (OQ-03/OQ-04 pending).

## Fields (on `tickets`, migration `drizzle/0011`)

| Field | Notes |
|---|---|
| `billing_status` | `pending_review` (default) · `included_in_contract` · `billable` · `contract_overage` · `fixed_price` · `no_charge` · `included_in_monthly_charge` · `charged` |
| `billing_modality` | `remote` · `onsite` · `fixed_price` · `not_applicable` (default) |
| `hourly_rate`, `fixed_amount` | Optional (contract-driven rates are future scope) |
| `calculated_amount` | Server-computed on every classification change |
| `billing_period` | Free text (e.g. `2026-07`) — marks immediate vs. monthly cycles together with `included_in_monthly_charge`/`charged` |
| `external_reference`, `billing_notes` | Optional |
| `billing_determined_by_id`, `billing_determined_at` | Who/when decided — stamped on every change |

Index on `billing_status` (the "Billable" list view uses it).

## Calculation (`computeTicketAmount`, pure — `src/lib/tickets.ts`)

- `remote`/`onsite`: `billableMinutes / 60 × hourly_rate`, cents-rounded.
- `fixed_price`: `fixed_amount` (minutes ignored).
- `not_applicable` or missing rate: `null`.
- **`billableMinutes` always comes from TimeEntry**: non-voided entries marked `billable`, summed at classification time — never stored on the ticket, voided entries never count (verified).

## Rules

1. **Every internal user** may classify billing; the client role has no portal access.
2. Every change is **audited per field** (old/new), including the recomputed amount.
3. At **close**, if the ticket is still `pending_review`, the close form asks for a decision — it is **never assumed billable automatically**; "keep pending review" is allowed.
4. No invoicing, no automatic contracts, no fiscal documents.

## UI

Ticket detail → right panel **Billing** card: status, modality, rates, period, reference, notes, live billable-minutes hint and the calculated amount. The list view exposes a Billing column, a billing filter and the "Billable" saved view (billable + contract_overage).

## Verified (2026-07-16, dev)

90 billable minutes + remote @ $100/h → `calculated_amount = 150.00` with `billing_determined_by` stamped (HTTP flow); voided-entry exclusion and the 60m × $120 = $120.00 case in `scripts/verify-tickets-feature.ts`; unit tests for hourly, fixed and null cases in `src/lib/tickets.test.ts`.

## Integración con Reportes e Indicadores (2026-07-18)

- **Indicators → Billing Operations** (`/indicators?view=billing`): pendientes de revisión, monto potencial (tickets clasificados cobrables con tarifa), monto del periodo (`charged`), horas facturables vs no facturables, distribución por estado de cobro, cerrados con cobro sin resolver — todo desde `billingMetrics` de la capa central (`src/lib/report-metrics.ts`), con drill-down a la vista "Billable" de tickets. El panel deja explícito que Watson **no emite facturas**.
- **Reportes**: el tipo `billing_support` (uso interno) y la sección `billing` de los snapshots congelan estos mismos agregados por periodo como soporte de cobro. La sección billing **nunca aparece en la salida externa** (PDF marca "Uso interno"). Ver `docs/features/reports.md`.

## Catálogo dinámico de Estatus de cobro (2026-07-22)

`billing_status` dejó de ser un enum fijo: ahora es un catálogo dinámico por organización (`ticket_billing_statuses`, Configuración → Tickets), con `tickets.billing_status_id` como campo autoritativo. Los 8 valores originales se conservan como filas de sistema (no eliminables) con una categoría semántica (`not_billable/included/pending/approved/billed/rejected`); se pueden crear estatus personalizados (ej. "Rechazado por el cliente", categoría `rejected`). El enum Postgres original se conserva como espejo interno — nunca se muestra ni se edita — para no romper reportes/indicadores que aún lo leen. El estatus de cobro sigue sin modificar por sí solo importe, tarifa, horas o reglas contractuales: es puramente administrativo (`computeTicketAmount` solo depende de `billing_modality`). Ver `src/lib/ticket-catalogs.ts`.

## Cobro inicial por Póliza General (2026-10-04)

El **Cobro** con el que nace un ticket ya no es siempre el default de la organización ("Unclassified"). El trabajo ya cubierto por un contrato nace en **"In contract"** (`semanticKey = INCLUDED_IN_CONTRACT`): no hay nada que decidir al cerrar y no aparece en Cobros y facturación. Hay dos formas de quedar cubierto, evaluadas en ese orden:

1. **Vínculo explícito** de una Recurrencia a un servicio contratado (ver abajo, 2026-10-07).
2. **Póliza del cliente**: tiene contratado un servicio activo con **"Incluido en póliza"** (`services.defaultBillingIncluded` — p. ej. "Poliza Global"), y entonces no se le cobra por ticket en absoluto.

Cualquier otro caso conserva el default de la organización.

### Trabajo recurrente bajo contrato (2026-10-07)

Un cliente puede tener varios servicios contratados y solo uno cubre un trabajo recurrente dado (Frutteto tiene 3), así que la Recurrencia declara **cuál**: `recurrence_definitions.client_service_id` → `client_services.id` (migración `drizzle/0040`, nullable, `ON DELETE SET NULL` — perder el vínculo nunca borra el trabajo operativo). Campo "Servicio contratado" en el paso 2 del asistente.

- **El vínculo por sí solo cubre el trabajo**, sin importar el flag "Incluido en póliza" del servicio: el trabajo recurrente es trabajo contratado. Así "Backup gestionado" (que no es póliza) sirve de contrato para las revisiones de respaldos sin tener que marcar al cliente completo como no facturable.
- Se valida en escritura (`validateContext` → `isClientServiceActive`): el servicio debe ser de **ese** cliente y estar activo, para que un vínculo equivocado no deje de cobrar trabajo en silencio.
- Se **re-valida en cada generación**. Si el servicio se canceló, el vínculo deja de cubrir y el ticket cae al default de la organización — queda sin clasificar para que alguien lo decida, en lugar de seguir naciendo no facturable. El detalle de la recurrencia marca ese caso en el panel Contexto.
- El cambio de vínculo se audita (`clientServiceId` está en `REC_AUDITED`), y `duplicateRecurrence` lo conserva.

- Regla única en `resolveInitialTicketBillingStatus` (`src/lib/ticket-catalogs.ts`), aplicada por **los tres caminos de alta**: el formulario de ticket nuevo, la conversión Actividad → Ticket y el motor de Recurrentes. Antes los tres usaban `getDefaultTicketBillingStatus` y la póliza solo se aplicaba al **registro de tiempo** (`getCompanyBillingDefaults.isGlobalPolicyIncluded`), de modo que un ticket recurrente de un cliente con póliza nacía "Unclassified" y alguien tenía que reclasificarlo a mano.
- El predicado compartido es `isCompanyOnPolicyService`: exige que tanto el servicio como la fila contratada del cliente estén `active`, igual que `isGlobalPolicyIncluded`.
- Si el catálogo de la organización no tiene una fila `INCLUDED_IN_CONTRACT` activa (los catálogos son configurables y un admin pudo retirarla), cae al default de la organización.
- No estampa `billingDeterminedById`/`billingDeterminedAt`: esos campos registran **quién** decidió, y aquí decidió la póliza, no una persona. El alta queda auditada por el registro `create` normal del ticket.

## Future

Contract-driven rates and automatic overage detection (E-04/OQ-03) · fiscal invoicing (explicitly out of scope, PRD §10). Monthly billing runs shipped as reporting support (E-14, ver arriba) — invoice emission remains out of scope.
