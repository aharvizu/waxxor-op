/**
 * Pure, deterministic rules for the Today screen (no generative AI).
 * Data shapes come from src/lib/today-data.ts; everything here is unit-testable.
 * See docs/features/today.md.
 */

export type TodayItemKind = "ticket" | "activity" | "related_activity";

export type TodayItem = {
  kind: TodayItemKind;
  id: number;
  workItemId: number;
  folio: string | null;
  title: string;
  clientId: number | null;
  clientName: string | null;
  assigneeId: number | null;
  assigneeName: string | null;
  status: string;
  priority: string;
  activityType: string | null;
  category: string | null;
  dueDate: string | null;
  createdAt: Date;
  updatedAt: Date;
  // tickets only
  firstResponseAt: Date | null;
  firstResponseTargetAt: Date | null;
  resolutionTargetAt: Date | null;
  slaName: string | null;
  slaResolutionMinutes: number | null;
  slaPausedAt: Date | null;
  reopenCount: number;
  billingStatus: string | null;
  unansweredInbound: boolean;
  lastInboundAt: Date | null;
  // shared
  minutes: number;
  // project membership (2026-07-17): null for tickets and loose activities
  projectId: number | null;
  parentActivityId: number | null;
};

export const ACTIVE_TICKET_STATUSES = [
  "new", "assigned", "in_progress", "waiting_customer",
  "waiting_third_party", "scheduled", "reopened",
] as const;
export const ACTIVE_ACTIVITY_STATUSES = [
  "pending", "in_progress", "waiting", "blocked",
] as const;
export const WAITING_STATUSES = [
  "waiting_customer", "waiting_third_party", "pending_confirmation", "waiting", "blocked",
] as const;

export function isActive(item: TodayItem): boolean {
  return item.kind === "ticket"
    ? (ACTIVE_TICKET_STATUSES as readonly string[]).includes(item.status)
    : (ACTIVE_ACTIVITY_STATUSES as readonly string[]).includes(item.status);
}

export function isOverdue(item: TodayItem, now: Date): boolean {
  if (!isActive(item)) return false;
  if (item.kind === "ticket" && item.resolutionTargetAt && !item.slaPausedAt) {
    if (item.resolutionTargetAt.getTime() < now.getTime()) return true;
  }
  if (item.dueDate) return item.dueDate < now.toISOString().slice(0, 10);
  return false;
}

export function isDueToday(item: TodayItem, now: Date): boolean {
  const today = now.toISOString().slice(0, 10);
  if (item.dueDate === today) return true;
  if (item.kind === "ticket" && item.resolutionTargetAt) {
    return item.resolutionTargetAt.toISOString().slice(0, 10) === today;
  }
  return false;
}

/** Remaining SLA fraction of the applied resolution window; null without SLA or while paused. */
function slaFraction(item: TodayItem, now: Date): number | null {
  if (item.kind !== "ticket" || !item.resolutionTargetAt || item.slaPausedAt) return null;
  const total = item.slaResolutionMinutes ?? 480;
  const remainingMs = item.resolutionTargetAt.getTime() - now.getTime();
  return remainingMs / (total * 60_000);
}

export function isSlaAtRisk(item: TodayItem, now: Date): boolean {
  const f = slaFraction(item, now);
  return f !== null && f > 0 && f <= 0.25 && isActive(item);
}

export function isSlaBreached(item: TodayItem, now: Date): boolean {
  return (
    item.kind === "ticket" &&
    isActive(item) &&
    !item.slaPausedAt &&
    item.resolutionTargetAt !== null &&
    item.resolutionTargetAt.getTime() < now.getTime()
  );
}

/* ------------------------------------------------------ immediate attention */

export type AttentionReason = {
  rank: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  label: string;
};

/** Spec priority order; null when the item doesn't demand immediate attention. */
export function attentionReason(item: TodayItem, now: Date): AttentionReason | null {
  if (!isActive(item)) return null;
  if (isSlaBreached(item, now)) return { rank: 1, label: "SLA vencido" };
  if (
    item.kind === "ticket" &&
    item.priority === "critical" &&
    !item.firstResponseAt
  ) {
    return { rank: 2, label: "Crítico sin respuesta" };
  }
  const f = slaFraction(item, now);
  if (f !== null && f > 0 && f <= 0.1) return { rank: 3, label: "SLA crítico" };
  if (
    item.kind !== "ticket" &&
    (item.priority === "high" || item.priority === "critical") &&
    isOverdue(item, now)
  ) {
    return { rank: 4, label: "Actividad urgente vencida" };
  }
  if (item.kind === "ticket" && item.unansweredInbound) {
    return { rank: 5, label: "Cliente esperando respuesta" };
  }
  if (item.kind === "ticket" && item.status === "reopened") {
    return { rank: 6, label: "Reabierto pendiente" };
  }
  if (isOverdue(item, now)) return { rank: 7, label: "Vencido" };
  return null;
}

export function buildAttention(
  items: TodayItem[],
  now: Date,
  limit = 5,
): { item: TodayItem; reason: AttentionReason }[] {
  return items
    .map((item) => ({ item, reason: attentionReason(item, now) }))
    .filter((x): x is { item: TodayItem; reason: AttentionReason } => x.reason !== null)
    .sort(
      (a, b) =>
        a.reason.rank - b.reason.rank ||
        (a.item.resolutionTargetAt?.getTime() ?? Infinity) -
          (b.item.resolutionTargetAt?.getTime() ?? Infinity),
    )
    .slice(0, limit);
}

/* --------------------------------------------------------- smart ordering */

const PRIORITY_WEIGHT: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };

/** Overdue → SLA at risk → priority → date/time → dateless. */
export function smartOrder(items: TodayItem[], now: Date): TodayItem[] {
  const bucket = (i: TodayItem) =>
    isOverdue(i, now) ? 0 : isSlaAtRisk(i, now) ? 1 : 2;
  const dateKey = (i: TodayItem) => {
    if (i.resolutionTargetAt) return i.resolutionTargetAt.getTime();
    if (i.dueDate) return new Date(`${i.dueDate}T23:59:00Z`).getTime();
    return Infinity; // dateless last
  };
  return [...items].sort(
    (a, b) =>
      bucket(a) - bucket(b) ||
      (PRIORITY_WEIGHT[a.priority] ?? 9) - (PRIORITY_WEIGHT[b.priority] ?? 9) ||
      dateKey(a) - dateKey(b),
  );
}

/* --------------------------------------------------------------- reminders */

export type ReminderSeverity = "high" | "medium" | "low";

export type Reminder = {
  ruleKey: string;
  entityType: "ticket" | "activity" | "client" | "project" | "recurrence_definition" | "report";
  entityId: number;
  title: string;
  detail: string;
  severity: ReminderSeverity;
  /** When the condition started — a mark older than this means "reappear". */
  conditionSince: Date;
  href: string;
  recommendedAction: string;
  canDismiss: boolean;
  canResolve: boolean;
};

export const REMINDER_THRESHOLDS = {
  pendingConfirmationDays: 2,
  waitingFollowUpDays: 3,
  unassignedActivityHours: 24,
  clientInactiveDays: 30,
} as const;

const DAY = 86_400_000;

export type RenewalInput = {
  source: string;
  sourceId: number;
  clientId: number;
  clientName: string;
  concept: string;
  date: string; // YYYY-MM-DD
};

/** Per-user project signals (2026-07-17): milestones/risks/projects the user owns. */
export type ProjectSignalsInput = {
  milestones: { id: number; name: string; targetDate: string; projectId: number; projectName: string }[];
  risks: { id: number; title: string; projectId: number; projectName: string; createdAt: Date }[];
  riskyProjects: { id: number; name: string; folio: string; healthStatus: string; status: string; updatedAt: Date }[];
};

/** Per-user recurrence signals (2026-07-17) — see src/lib/recurrence-data.ts's RecurrenceSignal. */
export type RecurrenceSignalInput = {
  id: number;
  name: string;
  reason: "failed" | "overdue" | "no_assignee" | "invalid_context" | "expiring_soon";
  detail: string;
};

/** Per-user report signals (2026-07-18) — see src/lib/indicator-data.ts's ReportSignal. */
export type ReportSignalInput = {
  id: number;
  title: string;
  reason: "ready_for_review" | "changes_requested" | "approved_unsent" | "failed";
  detail: string;
};

export function evaluateReminders(
  items: TodayItem[],
  clientsLastTouch: { clientId: number; clientName: string; lastTouchAt: Date | null }[],
  now: Date,
  renewals: RenewalInput[] = [],
  projectSignals: ProjectSignalsInput = { milestones: [], risks: [], riskyProjects: [] },
  recurrenceSignals: RecurrenceSignalInput[] = [],
  reportSignals: ReportSignalInput[] = [],
): Reminder[] {
  const out: Reminder[] = [];
  const age = (d: Date) => Math.floor((now.getTime() - d.getTime()) / DAY);

  for (const i of items) {
    if (i.kind === "ticket") {
      if (
        i.status === "pending_confirmation" &&
        now.getTime() - i.updatedAt.getTime() >
          REMINDER_THRESHOLDS.pendingConfirmationDays * DAY
      ) {
        out.push({
          ruleKey: "pending_confirmation_stale",
          entityType: "ticket",
          entityId: i.id,
          title: `Confirmación pendiente: ${i.folio}`,
          detail: `${i.title} lleva ${age(i.updatedAt)} días esperando confirmación del cliente.`,
          severity: "high",
          conditionSince: i.updatedAt,
          href: `/helpdesk/${i.id}`,
          recommendedAction: "Solicita la confirmación o cierra el ticket",
          canDismiss: false,
          canResolve: true,
        });
      }
      if (
        (i.status === "waiting_customer" || i.status === "waiting_third_party") &&
        now.getTime() - i.updatedAt.getTime() >
          REMINDER_THRESHOLDS.waitingFollowUpDays * DAY
      ) {
        out.push({
          ruleKey:
            i.status === "waiting_customer" ? "waiting_customer_stale" : "waiting_third_party_stale",
          entityType: "ticket",
          entityId: i.id,
          title: `Espera sin seguimiento: ${i.folio}`,
          detail: `${i.title} lleva ${age(i.updatedAt)} días en "${i.status === "waiting_customer" ? "esperando cliente" : "esperando tercero"}" sin actividad.`,
          severity: "medium",
          conditionSince: i.updatedAt,
          href: `/helpdesk/${i.id}`,
          recommendedAction: "Registra un seguimiento",
          canDismiss: false,
          canResolve: true,
        });
      }
      if (i.status === "closed" && i.billingStatus === "pending_review") {
        out.push({
          ruleKey: "billing_pending_review",
          entityType: "ticket",
          entityId: i.id,
          title: `Cobro sin revisar: ${i.folio}`,
          detail: `${i.title} está cerrado con clasificación de cobro pendiente.`,
          severity: "medium",
          conditionSince: i.updatedAt,
          href: `/helpdesk/${i.id}`,
          recommendedAction: "Revisa la clasificación de cobro",
          canDismiss: false,
          canResolve: true,
        });
      }
      if (i.status === "closed" && i.billingStatus === "included_in_monthly_charge") {
        out.push({
          ruleKey: "monthly_charge_pending",
          entityType: "ticket",
          entityId: i.id,
          title: `Pendiente de cobro mensual: ${i.folio}`,
          detail: `${i.title} está cerrado e incluido en cobro mensual, aún no marcado como cobrado.`,
          severity: "low",
          conditionSince: i.updatedAt,
          href: `/helpdesk/${i.id}`,
          recommendedAction: "Márcalo como cobrado al facturar el mes",
          canDismiss: true,
          canResolve: true,
        });
      }
      if (
        (i.status === "resolved" || i.status === "pending_confirmation" || i.status === "closed") &&
        i.minutes === 0
      ) {
        out.push({
          ruleKey: "missing_time",
          entityType: "ticket",
          entityId: i.id,
          title: `Tiempo sin registrar: ${i.folio}`,
          detail: `${i.title} se resolvió sin ninguna sesión de tiempo activa.`,
          severity: "medium",
          conditionSince: i.updatedAt,
          href: `/helpdesk/${i.id}?tab=time`,
          recommendedAction: "Registra el tiempo trabajado",
          canDismiss: true,
          canResolve: true,
        });
      }
    } else {
      if (
        isActive(i) &&
        i.assigneeId === null &&
        now.getTime() - i.createdAt.getTime() >
          REMINDER_THRESHOLDS.unassignedActivityHours * 3_600_000
      ) {
        out.push({
          ruleKey: "activity_unassigned",
          entityType: "activity",
          entityId: i.id,
          title: `Actividad sin responsable`,
          detail: `"${i.title}" lleva ${Math.floor((now.getTime() - i.createdAt.getTime()) / 3_600_000)}h sin asignar.`,
          severity: "medium",
          conditionSince: i.createdAt,
          href: `/activities/${i.id}`,
          recommendedAction: "Asigna un responsable",
          canDismiss: false,
          canResolve: true,
        });
      }
      if (isOverdue(i, now)) {
        out.push({
          ruleKey: "activity_overdue",
          entityType: "activity",
          entityId: i.id,
          title: `Actividad vencida`,
          detail: `"${i.title}" venció el ${i.dueDate}.`,
          severity: i.priority === "critical" || i.priority === "high" ? "high" : "medium",
          conditionSince: new Date(`${i.dueDate}T23:59:00Z`),
          href: `/activities/${i.id}`,
          recommendedAction: "Reagenda o completa la actividad",
          canDismiss: false,
          canResolve: true,
        });
      }
    }
  }

  for (const c of clientsLastTouch) {
    if (
      c.lastTouchAt &&
      now.getTime() - c.lastTouchAt.getTime() > REMINDER_THRESHOLDS.clientInactiveDays * DAY
    ) {
      out.push({
        ruleKey: "client_inactive",
        entityType: "client",
        entityId: c.clientId,
        title: `Cliente sin interacción: ${c.clientName}`,
        detail: `Sin trabajo ni mensajes desde hace ${age(c.lastTouchAt)} días.`,
        severity: "low",
        conditionSince: c.lastTouchAt,
        href: `/clients/${c.clientId}`,
        recommendedAction: "Programa un seguimiento comercial",
        canDismiss: true,
        canResolve: true,
      });
    }
  }

  // Renewals ≤30 days (or overdue) — same data source as Client 360 alerts.
  for (const r of renewals) {
    const dueMs = new Date(`${r.date}T23:59:59Z`).getTime();
    const daysLeft = Math.ceil((dueMs - now.getTime()) / DAY);
    if (daysLeft > 30) continue;
    const overdue = daysLeft < 0;
    out.push({
      ruleKey: `renewal_${r.source}_${r.sourceId}`.slice(0, 64),
      entityType: "client",
      entityId: r.clientId,
      title: overdue
        ? `Renovación vencida: ${r.concept}`
        : `Renovación próxima: ${r.concept}`,
      detail: `${r.clientName} · ${r.date} (${overdue ? `${-daysLeft} días vencida` : `${daysLeft} días restantes`}).`,
      severity: overdue || daysLeft <= 7 ? "high" : "medium",
      conditionSince: new Date(dueMs - 30 * DAY),
      href: `/clients/${r.clientId}?tab=renewals`,
      recommendedAction: overdue ? "Renueva o cancela el servicio" : "Gestiona la renovación con el cliente",
      canDismiss: true,
      canResolve: true,
    });
  }

  // Project signals (owner-scoped, bounded queries — see getUserProjectSignals).
  for (const m of projectSignals.milestones) {
    const dueMs = new Date(`${m.targetDate}T23:59:59Z`).getTime();
    const overdue = dueMs < now.getTime();
    out.push({
      ruleKey: `milestone_${m.id}`.slice(0, 64),
      entityType: "project",
      entityId: m.projectId,
      title: overdue ? `Hito vencido: ${m.name}` : `Hito próximo: ${m.name}`,
      detail: `${m.projectName} · ${m.targetDate}.`,
      severity: overdue ? "high" : "medium",
      conditionSince: new Date(dueMs - 7 * DAY),
      href: `/projects/${m.projectId}?tab=hitos`,
      recommendedAction: overdue ? "Reagenda o completa el hito" : "Prepara el hito",
      canDismiss: true,
      canResolve: true,
    });
  }
  for (const r of projectSignals.risks) {
    out.push({
      ruleKey: `project_risk_${r.id}`.slice(0, 64),
      entityType: "project",
      entityId: r.projectId,
      title: `Riesgo alto asignado: ${r.title}`,
      detail: `${r.projectName} — riesgo abierto de severidad alta/crítica a tu nombre.`,
      severity: "high",
      conditionSince: r.createdAt,
      href: `/projects/${r.projectId}?tab=riesgos`,
      recommendedAction: "Mitiga o actualiza el riesgo",
      canDismiss: true,
      canResolve: true,
    });
  }
  for (const p of projectSignals.riskyProjects) {
    out.push({
      ruleKey: `project_at_risk_${p.id}`.slice(0, 64),
      entityType: "project",
      entityId: p.id,
      title: `Proyecto en riesgo: ${p.folio} ${p.name}`,
      detail: `Salud/estado en riesgo o bloqueado — eres el Project Manager.`,
      severity: "high",
      conditionSince: p.updatedAt,
      href: `/projects/${p.id}`,
      recommendedAction: "Revisa el resumen del proyecto",
      canDismiss: true,
      canResolve: true,
    });
  }

  // Recurrence signals (2026-07-17). "Atención inmediata" only shows WorkItem
  // items by design (tickets/activities) — critical recurrence failures reach
  // the user through No olvides instead, sorted to the top by severity=high,
  // rather than reshaping Atención inmediata's data model. See docs/features/recurring.md.
  const RECURRENCE_REASON_META: Record<
    RecurrenceSignalInput["reason"],
    { severity: ReminderSeverity; title: string; action: string; dismissible: boolean }
  > = {
    failed: { severity: "high", title: "Recurrencia con fallos", action: "Revisa y corrige la configuración", dismissible: false },
    overdue: { severity: "high", title: "Recurrencia vencida sin procesar", action: "Ejecuta manualmente o espera al scheduler", dismissible: false },
    no_assignee: { severity: "medium", title: "Recurrencia sin responsable", action: "Asigna un responsable", dismissible: true },
    invalid_context: { severity: "medium", title: "Recurrencia con contexto inválido", action: "Corrige cliente/proyecto/lista", dismissible: true },
    expiring_soon: { severity: "low", title: "Recurrencia próxima a finalizar", action: "Revisa si debe renovarse", dismissible: true },
  };
  for (const r of recurrenceSignals) {
    const meta = RECURRENCE_REASON_META[r.reason];
    out.push({
      ruleKey: `recurrence_${r.reason}_${r.id}`.slice(0, 64),
      entityType: "recurrence_definition",
      entityId: r.id,
      title: `${meta.title}: ${r.name}`,
      detail: r.detail,
      severity: meta.severity,
      conditionSince: now,
      href: `/recurring/${r.id}`,
      recommendedAction: meta.action,
      canDismiss: meta.dismissible,
      canResolve: true,
    });
  }

  // Report signals (2026-07-18): review/correct/send/failed states reach the
  // responsible through No olvides; only failures are high severity.
  const REPORT_REASON_META: Record<
    ReportSignalInput["reason"],
    { severity: ReminderSeverity; title: string; action: string }
  > = {
    ready_for_review: { severity: "medium", title: "Reporte listo para revisión", action: "Revisa y aprueba o solicita cambios" },
    changes_requested: { severity: "medium", title: "Reporte con cambios solicitados", action: "Corrige y regenera" },
    approved_unsent: { severity: "medium", title: "Reporte aprobado sin enviar", action: "Márcalo como enviado" },
    failed: { severity: "high", title: "Reporte con generación fallida", action: "Corrige la configuración y regenera" },
  };
  for (const r of reportSignals) {
    const meta = REPORT_REASON_META[r.reason];
    out.push({
      ruleKey: `report_${r.reason}_${r.id}`.slice(0, 64),
      entityType: "report",
      entityId: r.id,
      title: `${meta.title}: ${r.title}`,
      detail: r.detail,
      severity: meta.severity,
      conditionSince: now,
      href: `/reports/${r.id}`,
      recommendedAction: meta.action,
      canDismiss: r.reason !== "failed",
      canResolve: true,
    });
  }

  const sevOrder: Record<ReminderSeverity, number> = { high: 0, medium: 1, low: 2 };
  return out.sort(
    (a, b) =>
      sevOrder[a.severity] - sevOrder[b.severity] ||
      a.conditionSince.getTime() - b.conditionSince.getTime(),
  );
}

export type ReminderMark = {
  ruleKey: string;
  entityType: string;
  entityId: number;
  status: "snoozed" | "dismissed" | "resolved";
  snoozedUntil: Date | null;
  actedAt: Date;
};

/** Hide marked reminders; re-show when the condition re-triggered after the mark. */
export function applyMarks(
  reminders: Reminder[],
  marks: ReminderMark[],
  now: Date,
): Reminder[] {
  const byKey = new Map(
    marks.map((m) => [`${m.ruleKey}:${m.entityType}:${m.entityId}`, m]),
  );
  return reminders.filter((r) => {
    const mark = byKey.get(`${r.ruleKey}:${r.entityType}:${r.entityId}`);
    if (!mark) return true;
    if (r.conditionSince.getTime() > mark.actedAt.getTime()) return true; // condition reappeared
    if (mark.status === "snoozed") {
      return mark.snoozedUntil !== null && mark.snoozedUntil.getTime() <= now.getTime();
    }
    return false; // dismissed / resolved while the same condition instance holds
  });
}

/* ------------------------------------------------------------------ focus */

export type FocusRecommendation = {
  title: string;
  impact: string;
  href: string;
};

/** Máximo 3 recomendaciones deterministas basadas en conteos reales. */
export function buildFocus(counts: {
  dueToday: number;
  overdue: number;
  pendingConfirmation: number;
  unassignedActivities: number;
  unassignedTickets: number;
  billingReview: number;
  unansweredConversations: number;
  slaAtRisk: number;
}): FocusRecommendation[] {
  const out: FocusRecommendation[] = [];
  if (counts.slaAtRisk > 0) {
    out.push({
      title: `Prioriza ${counts.slaAtRisk} ticket${counts.slaAtRisk === 1 ? "" : "s"} con SLA en riesgo`,
      impact: "Evita incumplimientos de SLA hoy",
      href: "/today?filter=sla_risk",
    });
  }
  if (counts.overdue > 0) {
    out.push({
      title: `Atiende ${counts.overdue} trabajo${counts.overdue === 1 ? "" : "s"} vencido${counts.overdue === 1 ? "" : "s"}`,
      impact: "Reduce el rezago acumulado",
      href: "/today?filter=overdue",
    });
  }
  if (counts.unansweredConversations > 0) {
    out.push({
      title: `Responde ${counts.unansweredConversations} conversación${counts.unansweredConversations === 1 ? "" : "es"} sin respuesta`,
      impact: "Clientes esperando una respuesta",
      href: "/today#messages",
    });
  }
  if (counts.pendingConfirmation > 0) {
    out.push({
      title: `Cierra ${counts.pendingConfirmation} ticket${counts.pendingConfirmation === 1 ? "" : "s"} pendiente${counts.pendingConfirmation === 1 ? "" : "s"} de confirmación`,
      impact: "Convierte trabajo terminado en tickets cerrados",
      href: "/helpdesk?view=pending_confirmation",
    });
  }
  if (counts.unassignedActivities + counts.unassignedTickets > 0) {
    const n = counts.unassignedActivities + counts.unassignedTickets;
    out.push({
      title: `Asigna ${n} elemento${n === 1 ? "" : "s"} sin responsable`,
      impact: "Nada avanza sin dueño",
      href: "/today?filter=unassigned",
    });
  }
  if (counts.billingReview > 0) {
    out.push({
      title: `Revisa ${counts.billingReview} ticket${counts.billingReview === 1 ? "" : "s"} cobrable${counts.billingReview === 1 ? "" : "s"} pendiente${counts.billingReview === 1 ? "" : "s"}`,
      impact: "Dinero trabajado que aún no se clasifica",
      href: "/helpdesk?billing=pending_review",
    });
  }
  return out.slice(0, 3);
}

/* --------------------------------------------------------------- greeting */

export function greetingFor(hour: number): string {
  if (hour < 12) return "Buenos días";
  if (hour < 19) return "Buenas tardes";
  return "Buenas noches";
}

export function summaryText(counts: {
  pending: number;
  overdue: number;
  slaAtRisk: number;
}): string {
  const parts = [
    `Tienes ${counts.pending} trabajo${counts.pending === 1 ? "" : "s"} pendiente${counts.pending === 1 ? "" : "s"}`,
  ];
  if (counts.overdue > 0) parts.push(`${counts.overdue} vencido${counts.overdue === 1 ? "" : "s"}`);
  if (counts.slaAtRisk > 0) {
    parts.push(`${counts.slaAtRisk} SLA en riesgo`);
  }
  if (parts.length === 1) return `${parts[0]}.`;
  const last = parts.pop();
  return `${parts.join(", ")} y ${last}.`;
}
