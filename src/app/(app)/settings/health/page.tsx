import type { Metadata } from "next";
import Link from "next/link";
import { fmtDateTime } from "@/lib/format";
import { getSystemHealth } from "@/lib/settings-data";
import { requireRole } from "@/lib/session";
import { Database, Layers, Repeat, Tag } from "lucide-react";
import { Badge, Card, CardHeader, PageHeader, StatCard } from "@/components/ui";

export const metadata: Metadata = { title: "Configuración · Salud del sistema" };

export const dynamic = "force-dynamic";

function asDateTime(value: string | Date | null): string {
  if (!value) return "Nunca";
  return fmtDateTime(typeof value === "string" ? new Date(value) : value);
}

export default async function HealthSettingsPage() {
  const user = await requireRole("superadmin", "administrator");
  const health = await getSystemHealth(user.organizationId);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Salud del sistema"
        subtitle="Scheduler, recurrencias, reportes, versión, migraciones y base de datos."
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          icon={<Database />}
          label="Base de datos"
          value={`${health.dbLatencyMs} ms`}
          hint="Latencia de la consulta de diagnóstico"
        />
        <StatCard icon={<Tag />} label="Versión de la app" value={health.version} hint="package.json" />
        <StatCard
          icon={<Layers />}
          label="Migraciones aplicadas"
          value={String(health.migrations.applied)}
          hint={`Última: ${asDateTime(health.migrations.lastAppliedAt)}`}
        />
        <StatCard
          icon={<Repeat />}
          label="Recurrencias activas"
          value={String(health.recurrence.activeDefinitions)}
          hint={`${health.recurrence.definitionsInError} en error`}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <CardHeader title="Scheduler de recurrencias" />
          <dl className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted">Cron configurado (CRON_SECRET)</dt>
              <dd>
                {health.cronConfigured ? (
                  <Badge tone="green">Configurado</Badge>
                ) : (
                  <Badge tone="amber">Sin configurar — el endpoint responde 503</Badge>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">Última ejecución completada</dt>
              <dd className="text-fg">{asDateTime(health.recurrence.lastExecutedAt)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">Exitosas / fallidas (24 h)</dt>
              <dd className="text-fg">
                {health.recurrence.succeededLast24h} / {health.recurrence.failedLast24h}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">Activas con ejecución atrasada (&gt;30 min)</dt>
              <dd>
                {health.recurrence.overdueDefinitions > 0 ? (
                  <Badge tone="amber">{health.recurrence.overdueDefinitions}</Badge>
                ) : (
                  <Badge tone="green">0</Badge>
                )}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted">
            Frecuencia del cron: cada 10 minutos (vercel.json). Runner local:{" "}
            <span className="font-mono">npx tsx scripts/run-recurrences.ts</span>.{" "}
            <Link href="/recurring" className="text-primary hover:underline">Ver recurrencias →</Link>
          </p>
        </Card>

        <Card className="p-5">
          <CardHeader title="Reportes" />
          <dl className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted">Última generación de reporte</dt>
              <dd className="text-fg">{asDateTime(health.reports.lastGeneratedAt)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">Reportes en estado fallido</dt>
              <dd>
                {health.reports.failed > 0 ? (
                  <Badge tone="red">{health.reports.failed}</Badge>
                ) : (
                  <Badge tone="green">0</Badge>
                )}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-muted">
            <Link href="/reports?view=failed" className="text-primary hover:underline">
              Ver reportes fallidos →
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
