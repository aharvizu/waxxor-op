import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, ne } from "drizzle-orm";
import { AlertTriangle } from "lucide-react";
import { db } from "@/db";
import { clients, users } from "@/db/schema";
import { fmtMoney } from "@/lib/format";
import {
  INDICATOR_THRESHOLD_DEFAULTS,
  buildExecutiveAttention,
  indicatorDefinition,
} from "@/lib/indicators";
import {
  backlogAt,
  clientHealthBoard,
  closedWithoutTime,
  getReportsPipeline,
  getThresholdRows,
  getThresholds,
  workloadByAssignee,
} from "@/lib/indicator-data";
import { computePeriodMetrics, periodBounds } from "@/lib/report-metrics";
import { ORG_TIMEZONE, PERIOD_RULES, resolvePeriod, type PeriodRule } from "@/lib/reports";
import { requireRole } from "@/lib/session";
import { formatMinutes } from "@/lib/time-entries";
import {
  Badge,
  Card,
  CardHeader,
  PageHeader,
  THead,
  Table,
  Td,
  Th,
  buttonSecondaryClass,
  cx,
  inputClass,
} from "@/components/ui";
import { ThresholdForm } from "../reports/report-forms";

export const metadata: Metadata = { title: "Indicators" };

const PANELS = [
  ["executive", "Executive Overview"],
  ["operations", "Operations"],
  ["billing", "Billing Operations"],
  ["thresholds", "Umbrales"],
] as const;

const PERIOD_LABELS: Record<string, string> = {
  current_week: "Semana actual",
  previous_week: "Semana anterior",
  current_month: "Mes actual",
  previous_month: "Mes anterior",
  current_quarter: "Trimestre actual",
  previous_quarter: "Trimestre anterior",
  current_year: "Año actual",
};

function previousOf(rule: Exclude<PeriodRule, "custom">): Exclude<PeriodRule, "custom"> | null {
  const map: Partial<Record<string, Exclude<PeriodRule, "custom">>> = {
    current_week: "previous_week",
    current_month: "previous_month",
    current_quarter: "previous_quarter",
  };
  return map[rule] ?? null;
}

export default async function IndicatorsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; period?: string; clientId?: string; userId?: string }>;
}) {
  // Technician has no executive panel (spec §20); redirected by requireRole.
  const user = await requireRole("superadmin", "administrator", "director", "project_manager");
  const params = await searchParams;
  const view = PANELS.some(([k]) => k === params.view) ? params.view! : "executive";
  const periodRule = (
    PERIOD_RULES.includes(params.period as PeriodRule) && params.period !== "custom"
      ? params.period
      : "current_month"
  ) as Exclude<PeriodRule, "custom">;

  const now = new Date();
  const period = resolvePeriod(periodRule, ORG_TIMEZONE, now);
  const scope = {
    clientId: params.clientId ? Number(params.clientId) : null,
    userId: params.userId ? Number(params.userId) : null,
  };

  const [thresholds, clientRows, userRows] = await Promise.all([
    getThresholds(user.organizationId),
    db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.organizationId, user.organizationId)).orderBy(asc(clients.name)),
    db.select({ id: users.id, name: users.name }).from(users).where(and(eq(users.organizationId, user.organizationId), ne(users.role, "client"))).orderBy(asc(users.name)),
  ]);

  const periodIncomplete = period.end >= now.toISOString().slice(0, 10);

  const buildHref = (patch: Record<string, string | undefined>) => {
    const next = { ...params, ...patch };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(next)) if (v) qs.set(k, v);
    const s = qs.toString();
    return s ? `/indicators?${s}` : "/indicators";
  };

  return (
    <div>
      <PageHeader
        title="Indicadores"
        subtitle={`${PERIOD_LABELS[periodRule]} · ${period.start} – ${period.end} · fórmulas documentadas en el diccionario de indicadores.`}
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {PANELS.map(([key, label]) => (
          <Link
            key={key}
            href={buildHref({ view: key })}
            className={cx(
              "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
              view === key ? "bg-primary-soft text-primary" : "border border-edge text-muted hover:bg-subtle hover:text-fg",
            )}
          >
            {label}
          </Link>
        ))}
      </div>

      {view !== "thresholds" ? (
        <form method="get" className="mb-6 flex flex-wrap items-center gap-3">
          <input type="hidden" name="view" value={view} />
          <select name="period" defaultValue={periodRule} className={cx(inputClass, "w-auto")}>
            {PERIOD_RULES.filter((r) => r !== "custom").map((r) => (
              <option key={r} value={r}>{PERIOD_LABELS[r] ?? r}</option>
            ))}
          </select>
          <select name="clientId" defaultValue={params.clientId ?? ""} className={cx(inputClass, "w-auto")}>
            <option value="">Toda la organización</option>
            {clientRows.map((c) => <option key={c.id} value={c.id}>Cliente: {c.name}</option>)}
          </select>
          <select name="userId" defaultValue={params.userId ?? ""} className={cx(inputClass, "w-auto")}>
            <option value="">Todos los usuarios</option>
            {userRows.map((u) => <option key={u.id} value={u.id}>Usuario: {u.name}</option>)}
          </select>
          <button type="submit" className={buttonSecondaryClass}>Aplicar</button>
          {periodIncomplete ? (
            <span className="rounded-md border border-warning/30 bg-warning/5 px-2 py-1 text-xs text-fg">
              Periodo en curso — los datos aún no son definitivos.
            </span>
          ) : null}
        </form>
      ) : null}

      {view === "executive" ? (
        <ExecutivePanel orgId={user.organizationId} period={period} periodRule={periodRule} scope={scope} thresholds={thresholds} />
      ) : null}
      {view === "operations" ? (
        <OperationsPanel orgId={user.organizationId} period={period} scope={scope} />
      ) : null}
      {view === "billing" ? (
        <BillingPanel orgId={user.organizationId} period={period} scope={scope} />
      ) : null}
      {view === "thresholds" ? (
        <ThresholdsPanel orgId={user.organizationId} canEdit={["superadmin", "administrator"].includes(user.role)} />
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------- shared */

function Metric({
  defKey,
  value,
  href,
}: {
  defKey: string;
  value: string;
  href?: string | null;
}) {
  const def = indicatorDefinition(defKey);
  const body = (
    <span className="flex items-baseline gap-2">
      <span className="text-lg font-semibold tabular-nums">{value}</span>
      <span className="text-xs text-muted">{def?.name ?? defKey}</span>
    </span>
  );
  const target = href ?? def?.drillDownRoute;
  return target ? (
    <Link
      href={target}
      title={def ? `${def.description}\nFórmula: ${def.formula}` : undefined}
      className="rounded-lg border border-edge bg-surface px-3 py-2 shadow-card transition-colors hover:border-primary/30 hover:bg-primary-soft/40"
    >
      {body}
    </Link>
  ) : (
    <span title={def ? `${def.description}\nFórmula: ${def.formula}` : undefined} className="rounded-lg border border-edge bg-surface px-3 py-2 shadow-card">
      {body}
    </span>
  );
}

const NA = "No disponible";

/* ---------------------------------------------------------------- Executive */

async function ExecutivePanel({
  orgId,
  period,
  periodRule,
  scope,
  thresholds,
}: {
  orgId: number;
  period: { start: string; end: string };
  periodRule: Exclude<PeriodRule, "custom">;
  scope: { clientId: number | null; userId: number | null };
  thresholds: Record<string, number>;
}) {
  const prevRule = previousOf(periodRule);
  const prevPeriod = prevRule ? resolvePeriod(prevRule, ORG_TIMEZONE, new Date()) : null;
  const [metrics, pipeline, backlogNow, backlogPrev, clientBoard] = await Promise.all([
    computePeriodMetrics(orgId, period, scope),
    getReportsPipeline(orgId, thresholds),
    backlogAt(orgId, periodBounds(period).to > new Date() ? new Date() : periodBounds(period).to),
    prevPeriod ? backlogAt(orgId, periodBounds(prevPeriod).to) : Promise.resolve(null),
    clientHealthBoard(orgId, period, thresholds),
  ]);

  const attention = buildExecutiveAttention({
    backlog: backlogNow,
    backlogPrevious: backlogPrev,
    slaCompliancePct: metrics.sla.compliancePct,
    overdueTickets: metrics.tickets.overdueNow,
    projectsAtRisk: metrics.projects.atRisk,
    billingPendingReview: metrics.billing.pendingReview,
    reportsOverdue: pipeline.overdue,
    recurrencesInError: metrics.recurring.inError,
    thresholds,
  });

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-danger/20">
        <CardHeader title="Atención requerida" description="Reglas determinísticas sobre umbrales configurados — sin recomendaciones inventadas." />
        {attention.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted">Nada crítico con los umbrales actuales.</p>
        ) : (
          <ul className="divide-y divide-edge">
            {attention.map((a) => (
              <li key={a.key}>
                <Link href={a.href} className="flex items-center gap-2 px-5 py-2.5 text-sm text-fg transition-colors hover:bg-subtle">
                  <AlertTriangle className={cx("size-4 shrink-0", a.severity === "high" ? "text-danger" : "text-warning")} />
                  {a.text}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-fg">Operación</h3>
        <div className="flex flex-wrap gap-2">
          <Metric defKey="backlog" value={String(backlogNow)} />
          <Metric defKey="tickets_created" value={String(metrics.tickets.created)} />
          <Metric defKey="tickets_closed" value={String(metrics.tickets.closed)} />
          <Metric
            defKey="reopen_rate"
            value={metrics.tickets.closed > 0 ? `${Math.round((metrics.tickets.reopened / metrics.tickets.closed) * 100)}%` : NA}
          />
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-fg">SLA</h3>
        <div className="flex flex-wrap gap-2">
          <Metric defKey="sla_compliance" value={metrics.sla.compliancePct !== null ? `${metrics.sla.compliancePct}%` : NA} />
          <Metric defKey="sla_first_response" value={metrics.sla.firstResponsePct !== null ? `${metrics.sla.firstResponsePct}%` : NA} />
          <Metric defKey="avg_first_response" value={metrics.tickets.avgFirstResponseMinutes !== null ? formatMinutes(metrics.tickets.avgFirstResponseMinutes) : NA} />
          <Metric defKey="avg_resolution" value={metrics.tickets.avgResolutionMinutes !== null ? formatMinutes(metrics.tickets.avgResolutionMinutes) : NA} />
        </div>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-fg">Tiempo y cobro</h3>
        <div className="flex flex-wrap gap-2">
          <Metric defKey="time_total" value={formatMinutes(metrics.time.total)} />
          <Metric defKey="time_billable" value={formatMinutes(metrics.time.billable)} />
          <Metric defKey="billing_pending_review" value={String(metrics.billing.pendingReview)} />
          <Metric defKey="billing_potential" value={fmtMoney(metrics.billing.potentialAmount)} />
        </div>
        <p className="mt-1 text-xs text-muted">
          Utilización porcentual no calculada: no existe capacidad laboral configurada (no se inventan horas disponibles).
        </p>
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold text-fg">Proyectos · Recurrentes · Reportes</h3>
        <div className="flex flex-wrap gap-2">
          <Metric defKey="projects_at_risk" value={String(metrics.projects.atRisk)} />
          <Metric
            defKey="recurrence_success_rate"
            value={
              metrics.recurring.succeeded + metrics.recurring.failed > 0
                ? `${Math.round((metrics.recurring.succeeded / (metrics.recurring.succeeded + metrics.recurring.failed)) * 100)}%`
                : NA
            }
          />
          <Metric defKey="reports_pipeline" value={`${pipeline.readyForReview} por revisar / ${pipeline.approvedUnsent} sin enviar`} href="/reports?view=pending_review" />
        </div>
      </section>

      <Card className="overflow-visible">
        <CardHeader title="Clientes" description="Salud operativa por cliente (top 15 por consumo del periodo)." />
        <Table>
          <THead>
            <tr>
              <Th>Cliente</Th>
              <Th>Abiertos</Th>
              <Th>Vencidos</Th>
              <Th>Cobro pendiente</Th>
              <Th>Tiempo del periodo</Th>
              <Th>Reportes pendientes</Th>
              <Th>Interacción</Th>
            </tr>
          </THead>
          <tbody className="divide-y divide-edge">
            {clientBoard.map((c) => (
              <tr key={c.clientId} className="transition-colors hover:bg-subtle">
                <Td>
                  <Link href={`/clients/${c.clientId}`} className="font-medium text-fg hover:text-primary">{c.clientName}</Link>
                </Td>
                <Td className="tabular-nums text-muted">{c.openTickets}</Td>
                <Td className={cx("tabular-nums", c.overdueTickets > 0 ? "text-danger" : "text-muted")}>{c.overdueTickets}</Td>
                <Td className="tabular-nums text-muted">{c.pendingBilling}</Td>
                <Td className="tabular-nums text-muted">{formatMinutes(c.minutesInPeriod)}</Td>
                <Td className="tabular-nums text-muted">{c.pendingReports}</Td>
                <Td>{c.inactive ? <Badge tone="amber">Sin interacción reciente</Badge> : <Badge tone="green">Activo</Badge>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </div>
  );
}

/* --------------------------------------------------------------- Operations */

async function OperationsPanel({
  orgId,
  period,
  scope,
}: {
  orgId: number;
  period: { start: string; end: string };
  scope: { clientId: number | null; userId: number | null };
}) {
  const [metrics, workload, noTime] = await Promise.all([
    computePeriodMetrics(orgId, period, scope),
    workloadByAssignee(orgId),
    closedWithoutTime(orgId, period),
  ]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Metric defKey="tickets_created" value={String(metrics.tickets.created)} />
        <Metric defKey="tickets_closed" value={String(metrics.tickets.closed)} />
        <Metric defKey="backlog" value={String(metrics.tickets.openAtEnd)} />
        <Metric defKey="reopen_rate" value={metrics.tickets.closed > 0 ? `${Math.round((metrics.tickets.reopened / metrics.tickets.closed) * 100)}%` : NA} />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="overflow-visible">
          <CardHeader title="Carga por persona" description="Trabajo abierto ahora mismo — detecta saturación y trabajo sin asignar." />
          <Table>
            <THead>
              <tr><Th>Persona</Th><Th>Tickets</Th><Th>Actividades</Th><Th>Vencidos</Th></tr>
            </THead>
            <tbody className="divide-y divide-edge">
              {workload.map((w) => (
                <tr key={w.key}>
                  <Td className="font-medium text-fg">{w.key}</Td>
                  <Td className="tabular-nums text-muted">{w.openTickets}</Td>
                  <Td className="tabular-nums text-muted">{w.openActivities}</Td>
                  <Td className={cx("tabular-nums", w.overdue > 0 ? "text-danger" : "text-muted")}>{w.overdue}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          <p className="px-5 py-2 text-xs text-muted">
            Sin saturación porcentual: no hay capacidad laboral configurada.
          </p>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader title="Categorías del periodo" description="Tickets creados/cerrados por categoría." />
          <ul className="divide-y divide-edge">
            {metrics.tickets.byCategory.map((r) => (
              <li key={r.key} className="flex items-center justify-between px-5 py-2 text-sm">
                <span className="text-fg">{r.key}</span>
                <span className="tabular-nums text-muted">{r.created} / {r.closed}</span>
              </li>
            ))}
            {metrics.tickets.byCategory.length === 0 ? (
              <li className="px-5 py-6 text-sm text-muted">Sin tickets en el periodo.</li>
            ) : null}
          </ul>
        </Card>
        <Card className="overflow-hidden">
          <CardHeader title="Tiempo por persona" />
          <ul className="divide-y divide-edge">
            {metrics.time.byUser.map((r) => (
              <li key={r.key} className="flex items-center justify-between px-5 py-2 text-sm">
                <span className="text-fg">{r.key}</span>
                <span className="tabular-nums text-muted">{formatMinutes(r.minutes)}</span>
              </li>
            ))}
            {metrics.time.byUser.length === 0 ? (
              <li className="px-5 py-6 text-sm text-muted">Sin tiempo registrado en el periodo.</li>
            ) : null}
          </ul>
        </Card>
        <Card className="p-5">
          <CardHeader title="Señales" className="mb-3 px-0 pt-0" />
          <ul className="space-y-2 text-sm text-fg">
            <li className="flex justify-between"><span>Cerrados sin tiempo registrado</span><span className="font-medium tabular-nums">{noTime}</span></li>
            <li className="flex justify-between"><span>Sin responsable (actividades)</span><span className="font-medium tabular-nums">{metrics.activities.unassignedNow}</span></li>
            <li className="flex justify-between"><span>Pendientes de confirmación</span><span className="font-medium tabular-nums">{metrics.tickets.pendingConfirmation}</span></li>
            <li className="flex justify-between"><span>Conversaciones pendientes</span><span className="font-medium tabular-nums">{metrics.conversations.pendingConversations}</span></li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Billing */

async function BillingPanel({
  orgId,
  period,
  scope,
}: {
  orgId: number;
  period: { start: string; end: string };
  scope: { clientId: number | null; userId: number | null };
}) {
  const metrics = await computePeriodMetrics(orgId, period, scope);
  const b = metrics.billing;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-5">
          <div className="text-[13px] font-medium text-muted">Por revisar</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{b.pendingReview}</div>
          <Link href="/helpdesk?billing=pending_review" className="mt-2 block text-xs text-primary hover:underline">Revisar tickets</Link>
        </Card>
        <Card className="p-5">
          <div className="text-[13px] font-medium text-muted">Monto potencial</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{fmtMoney(b.potentialAmount)}</div>
          <div className="mt-2 text-xs text-muted">{b.billable} cobrable(s) · {b.fixedPrice} precio fijo</div>
        </Card>
        <Card className="p-5">
          <div className="text-[13px] font-medium text-muted">Cobrado</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{fmtMoney(b.chargedAmount)}</div>
          <div className="mt-2 text-xs text-muted">{b.charged} ticket(s)</div>
        </Card>
        <Card className="p-5">
          <div className="text-[13px] font-medium text-muted">Tiempo facturable</div>
          <div className="mt-1 text-2xl font-semibold tabular-nums">{formatMinutes(b.billableMinutes)}</div>
          <div className="mt-2 text-xs text-muted">{b.monthly} en cobro mensual · {b.inContract} en contrato</div>
        </Card>
      </div>
      <Card className="overflow-hidden">
        <CardHeader
          title="Distribución de cobro del periodo"
          action={
            <span className="text-xs text-muted">Exporta el detalle desde un reporte de soporte de cobro (CSV).</span>
          }
        />
        <ul className="divide-y divide-edge">
          {[
            ["Pendiente de revisión", b.pendingReview],
            ["Cobrable", b.billable],
            ["Incluido en contrato", b.inContract],
            ["Precio fijo", b.fixedPrice],
            ["Cobro mensual", b.monthly],
            ["Cobrado", b.charged],
            ["Sin cargo", b.noCharge],
          ].map(([label, value]) => (
            <li key={String(label)} className="flex items-center justify-between px-5 py-2 text-sm">
              <span className="text-fg">{label}</span>
              <span className="tabular-nums text-muted">{value}</span>
            </li>
          ))}
        </ul>
      </Card>
      <p className="text-xs text-muted">
        Watson clasifica y consolida el cobro operativo — no emite facturas (la facturación fiscal está fuera de alcance).
      </p>
    </div>
  );
}

/* --------------------------------------------------------------- Thresholds */

async function ThresholdsPanel({ orgId, canEdit }: { orgId: number; canEdit: boolean }) {
  const [rows, thresholds] = await Promise.all([getThresholdRows(orgId), getThresholds(orgId)]);
  void rows;
  return (
    <div className="max-w-2xl space-y-4">
      <Card className="p-5">
        <CardHeader
          title="Umbrales de la organización"
          description={
            canEdit
              ? "Editables por SuperAdmin y Administrator — cada cambio queda auditado."
              : "Solo lectura para tu rol (Director puede consultar, no editar)."
          }
          className="mb-4 px-0 pt-0"
        />
        <div className="space-y-4">
          {Object.entries(INDICATOR_THRESHOLD_DEFAULTS).map(([key, def]) =>
            canEdit ? (
              <ThresholdForm key={key} thresholdKey={key} label={def.label} unit={def.unit} current={thresholds[key]} />
            ) : (
              <div key={key} className="flex items-center justify-between text-sm">
                <span className="text-fg">{def.label}</span>
                <span className="font-medium tabular-nums">{thresholds[key]} {def.unit}</span>
              </div>
            ),
          )}
        </div>
      </Card>
      <p className="text-xs text-muted">
        Valores por defecto documentados en docs/features/indicator-thresholds.md; un umbral guardado
        aquí sustituye al default solo para esta organización.
      </p>
    </div>
  );
}
