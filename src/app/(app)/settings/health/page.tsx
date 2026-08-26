import type { Metadata } from "next";
import Link from "next/link";
import { fmtDateTime } from "@/lib/format";
import { getSystemHealth } from "@/lib/settings-data";
import { getOrgLocale } from "@/lib/get-org-locale";
import { t, type Locale } from "@/lib/i18n";
import { requireRole } from "@/lib/session";
import { Database, Layers, Repeat, Tag } from "lucide-react";
import { Badge, Card, CardHeader, PageHeader, StatCard } from "@/components/ui";

export const metadata: Metadata = { title: "Configuración · Salud del sistema" };

export const dynamic = "force-dynamic";

function asDateTime(value: string | Date | null, locale: Locale): string {
  if (!value) return t("Nunca", "Never", locale);
  return fmtDateTime(typeof value === "string" ? new Date(value) : value);
}

export default async function HealthSettingsPage() {
  const user = await requireRole("superadmin", "administrator");
  const locale = await getOrgLocale(user.organizationId);
  const health = await getSystemHealth(user.organizationId);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("Salud del sistema", "System health", locale)}
        subtitle={t(
          "Scheduler, recurrencias, reportes, versión, migraciones y base de datos.",
          "Scheduler, recurrences, reports, version, migrations, and database.",
          locale,
        )}
      />

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          icon={<Database />}
          label={t("Base de datos", "Database", locale)}
          value={`${health.dbLatencyMs} ms`}
          hint={t("Latencia de la consulta de diagnóstico", "Diagnostic query latency", locale)}
        />
        <StatCard icon={<Tag />} label={t("Versión de la app", "App version", locale)} value={health.version} hint="package.json" />
        <StatCard
          icon={<Layers />}
          label={t("Migraciones aplicadas", "Applied migrations", locale)}
          value={String(health.migrations.applied)}
          hint={`${t("Última", "Latest", locale)}: ${asDateTime(health.migrations.lastAppliedAt, locale)}`}
        />
        <StatCard
          icon={<Repeat />}
          label={t("Recurrencias activas", "Active recurrences", locale)}
          value={String(health.recurrence.activeDefinitions)}
          hint={t(`${health.recurrence.definitionsInError} en error`, `${health.recurrence.definitionsInError} in error`, locale)}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Card className="p-5">
          <CardHeader title={t("Scheduler de recurrencias", "Recurrence scheduler", locale)} />
          <dl className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted">{t("Cron configurado (CRON_SECRET)", "Cron configured (CRON_SECRET)", locale)}</dt>
              <dd>
                {health.cronConfigured ? (
                  <Badge tone="green">{t("Configurado", "Configured", locale)}</Badge>
                ) : (
                  <Badge tone="amber">{t("Sin configurar — el endpoint responde 503", "Not configured — the endpoint responds 503", locale)}</Badge>
                )}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">{t("Última ejecución completada", "Last completed run", locale)}</dt>
              <dd className="text-fg">{asDateTime(health.recurrence.lastExecutedAt, locale)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">{t("Exitosas / fallidas (24 h)", "Succeeded / failed (24 h)", locale)}</dt>
              <dd className="text-fg">
                {health.recurrence.succeededLast24h} / {health.recurrence.failedLast24h}
              </dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">{t("Activas con ejecución atrasada (>30 min)", "Active with overdue run (>30 min)", locale)}</dt>
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
            {t("Frecuencia del cron: cada 10 minutos (vercel.json). Runner local:", "Cron frequency: every 10 minutes (vercel.json). Local runner:", locale)}{" "}
            <span className="font-mono">npx tsx scripts/run-recurrences.ts</span>.{" "}
            <Link href="/recurring" className="text-primary hover:underline">{t("Ver recurrencias →", "View recurrences →", locale)}</Link>
          </p>
        </Card>

        <Card className="p-5">
          <CardHeader title={t("Reportes", "Reports", locale)} />
          <dl className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between">
              <dt className="text-muted">{t("Última generación de reporte", "Last report generation", locale)}</dt>
              <dd className="text-fg">{asDateTime(health.reports.lastGeneratedAt, locale)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-muted">{t("Reportes en estado fallido", "Reports in failed state", locale)}</dt>
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
              {t("Ver reportes fallidos →", "View failed reports →", locale)}
            </Link>
          </p>
        </Card>
      </div>
    </div>
  );
}
