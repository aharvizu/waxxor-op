import type { Metadata } from "next";
import Link from "next/link";
import { getThresholds } from "@/lib/indicator-data";
import { INDICATOR_THRESHOLD_DEFAULTS } from "@/lib/indicators";
import { requireRole } from "@/lib/session";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { ThresholdForm } from "../../reports/report-forms";

export const metadata: Metadata = { title: "Configuración · Indicadores" };

/**
 * Same thresholds the Indicators module reads (indicator_thresholds) — this
 * page reuses the exact ThresholdForm + setIndicatorThreshold action, so there
 * is one write path and one audit trail.
 */
export default async function IndicatorsSettingsPage() {
  const user = await requireRole("superadmin", "administrator");
  const thresholds = await getThresholds(user.organizationId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Indicadores"
        subtitle="Umbrales que controlan la atención ejecutiva: objetivo SLA, backlog crítico, renovaciones, reportes vencidos."
      />

      <Card className="p-5">
        <CardHeader
          title="Umbrales"
          description="Cada cambio queda auditado con el valor anterior. Los paneles de /indicators los aplican de inmediato."
        />
        <div className="space-y-3">
          {Object.entries(INDICATOR_THRESHOLD_DEFAULTS).map(([key, def]) => (
            <ThresholdForm
              key={key}
              thresholdKey={key}
              label={def.label}
              unit={def.unit}
              current={thresholds[key] ?? def.value}
            />
          ))}
        </div>
        <p className="mt-4 text-xs text-muted">
          Las definiciones y fórmulas de cada indicador viven en el diccionario del módulo{" "}
          <Link href="/indicators" className="text-primary hover:underline">Indicadores</Link>.
        </p>
      </Card>
    </div>
  );
}
