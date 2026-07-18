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

## Future

Contract-driven rates and automatic overage detection (E-04/OQ-03) · fiscal invoicing (explicitly out of scope, PRD §10). Monthly billing runs shipped as reporting support (E-14, ver arriba) — invoice emission remains out of scope.
