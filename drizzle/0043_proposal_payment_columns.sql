ALTER TABLE "proposals" ADD COLUMN "subtotal_monthly_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "iva_monthly_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "total_monthly_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "subtotal_annual_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "iva_annual_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "proposals" ADD COLUMN "total_annual_cents" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Recalcula los totales de los borradores desde sus partidas con la regla
-- nueva: una columna por recurrencia, sin plegar las mensuales en la anualidad.
-- Misma aritmética que lib/proposals/calc.ts (importe redondeado por partida,
-- IVA redondeado por columna; "No Incluido" = precio null, no suma). Las
-- propuestas emitidas (snapshot no nulo) no se tocan: su documento está
-- congelado. Al 2026-11-17 no existe ninguna.
UPDATE "proposals" AS p SET
  "subtotal_one_time_cents" = s.ot,
  "iva_one_time_cents" = round(s.ot * p."iva_bps" / 10000.0),
  "total_one_time_cents" = s.ot + round(s.ot * p."iva_bps" / 10000.0),
  "subtotal_monthly_cents" = s.mo,
  "iva_monthly_cents" = round(s.mo * p."iva_bps" / 10000.0),
  "total_monthly_cents" = s.mo + round(s.mo * p."iva_bps" / 10000.0),
  "subtotal_annual_cents" = s.an,
  "iva_annual_cents" = round(s.an * p."iva_bps" / 10000.0),
  "total_annual_cents" = s.an + round(s.an * p."iva_bps" / 10000.0)
FROM (
  SELECT p2."id",
    coalesce(sum(x.amt) FILTER (WHERE x.rec = 'one_time'), 0) AS ot,
    coalesce(sum(x.amt) FILTER (WHERE x.rec = 'monthly'), 0) AS mo,
    coalesce(sum(x.amt) FILTER (WHERE x.rec = 'annual'), 0) AS an
  FROM "proposals" AS p2
  LEFT JOIN LATERAL (
    SELECT i->>'recurrence' AS rec,
      round(coalesce((i->>'quantity')::numeric, 1) * (i->>'unitPriceCents')::numeric) AS amt
    FROM jsonb_array_elements(p2."items") AS i
    WHERE i->>'unitPriceCents' IS NOT NULL
  ) AS x ON true
  GROUP BY p2."id"
) AS s
WHERE s."id" = p."id" AND p."snapshot" IS NULL;
