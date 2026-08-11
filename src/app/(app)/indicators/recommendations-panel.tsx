import { closedWithoutTime } from "@/lib/indicator-data";
import { buildRecommendations } from "@/lib/indicators";
import {
  categoryKpis,
  clientKpis,
  generalKpis,
  monthlySeries,
  slaMetrics,
  technicianKpis,
  ticketDataQuality,
  type MetricsScope,
  type Period,
} from "@/lib/report-metrics";
import { ORG_TIMEZONE, resolvePeriod, type PeriodRule } from "@/lib/reports";
import { previousOf } from "./page";

/** Pantalla 7 (Recomendaciones) — deterministic facts computed from the period's data, grouped into the brief's 7 sections, rendered as native <details> disclosures. */
export async function RecommendationsPanel({
  orgId,
  period,
  periodRule,
  scope,
}: {
  orgId: number;
  period: Period;
  periodRule: Exclude<PeriodRule, "custom">;
  scope: MetricsScope;
}) {
  const prevRule = previousOf(periodRule);
  const prevPeriod = prevRule ? resolvePeriod(prevRule, ORG_TIMEZONE, new Date()) : period;

  const [general, generalPrev, sla, clients, technicians, categories, closedNoTime, quality, series] = await Promise.all([
    generalKpis(orgId, period, scope),
    generalKpis(orgId, prevPeriod, scope),
    slaMetrics(orgId, period, scope),
    clientKpis(orgId, period, scope),
    technicianKpis(orgId, period, scope),
    categoryKpis(orgId, period, scope),
    closedWithoutTime(orgId, period),
    ticketDataQuality(orgId, period, scope),
    monthlySeries(orgId, 4, scope),
  ]);

  const sections = buildRecommendations({
    general,
    generalPrev,
    slaCompliancePct: sla.compliancePct,
    clients,
    technicians: technicians.summary,
    categories,
    closedWithoutTime: closedNoTime,
    noCategoryCount: quality.noCategory,
    noAssigneeCount: quality.noAssignee,
    recentMonths: series.slice(0, 3).map((m) => ({ monthLabel: m.monthLabel, costTotal: m.costTotal })),
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        Reglas determinísticas sobre los datos del periodo — sin texto generado por IA ni recomendaciones inventadas.
      </p>
      {sections.map((s, i) => (
        <details key={s.key} className="group rounded-xl border border-edge bg-surface shadow-card" open={i === 0}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 select-none">
            <div>
              <span className="text-sm font-semibold text-fg">{s.title}</span>
              <p className="mt-0.5 text-xs text-muted">{s.subtitle}</p>
            </div>
            <span className="text-xs text-faint transition-transform group-open:rotate-180">▾</span>
          </summary>
          <div className="border-t border-edge px-5 py-4">
            {s.items.length === 0 ? (
              <p className="text-sm text-muted">{s.emptyState}</p>
            ) : (
              <ul className="space-y-1.5 text-sm text-fg">
                {s.items.map((item, j) => (
                  <li key={j} className="flex gap-2">
                    <span className="text-faint">•</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}
