import { z } from "zod";
import {
  projectLists,
  projectMembers,
  projectMilestones,
  projectRisks,
  projects,
} from "@/db/schema";

/** Pure domain rules for Projects — see docs/features/projects.md. */

export const PROJECT_STATUSES = [
  "planning",
  "active",
  "on_hold",
  "at_risk",
  "completed",
  "cancelled",
  "archived",
] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/** Statuses users set directly — completed/archived go through their own flows. */
export const PROJECT_WORKFLOW_STATUSES = ["planning", "active", "on_hold", "at_risk", "cancelled"] as const;

/** Statuses hidden from operational views by default. */
export const PROJECT_INACTIVE_STATUSES = ["completed", "cancelled", "archived"] as const;

export const PROJECT_PRIORITIES = projects.priority.enumValues;
export const PROJECT_HEALTHS = projects.healthStatus.enumValues;
export const PROJECT_MEMBER_ROLES = projectMembers.role.enumValues;
export const PROJECT_LIST_STATUSES = projectLists.status.enumValues;
export const MILESTONE_STATUSES = projectMilestones.status.enumValues;
export const RISK_PROBABILITIES = projectRisks.probability.enumValues;
export const RISK_IMPACTS = projectRisks.impact.enumValues;
export const RISK_STATUSES = projectRisks.status.enumValues;

export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export const projectWorkflowStatusSchema = z.enum(PROJECT_WORKFLOW_STATUSES);
export const projectPrioritySchema = z.enum(PROJECT_PRIORITIES);
export const projectHealthSchema = z.enum(PROJECT_HEALTHS);
export const projectMemberRoleSchema = z.enum(PROJECT_MEMBER_ROLES);
export const projectListStatusSchema = z.enum(PROJECT_LIST_STATUSES);
export const milestoneStatusSchema = z.enum(MILESTONE_STATUSES);
export const riskProbabilitySchema = z.enum(RISK_PROBABILITIES);
export const riskImpactSchema = z.enum(RISK_IMPACTS);
export const riskStatusSchema = z.enum(RISK_STATUSES);

/** Activity statuses that count as "pending work" for completion checks. */
export const OPEN_ACTIVITY_STATUSES = ["pending", "in_progress", "waiting", "blocked"] as const;

/* ------------------------------------------------------------ risk severity */

export type RiskSeverity = "low" | "medium" | "high" | "critical";

const SEVERITY_MATRIX: Record<string, Record<string, RiskSeverity>> = {
  low: { low: "low", medium: "low", high: "medium", critical: "high" },
  medium: { low: "low", medium: "medium", high: "high", critical: "critical" },
  high: { low: "medium", medium: "high", high: "critical", critical: "critical" },
};

/** Deterministic probability × impact matrix. Never stored — always derived. */
export function riskSeverity(
  probability: (typeof RISK_PROBABILITIES)[number],
  impact: (typeof RISK_IMPACTS)[number],
): RiskSeverity {
  return SEVERITY_MATRIX[probability][impact];
}

export const OPEN_RISK_STATUSES = ["open", "monitoring", "occurred"] as const;

/* ---------------------------------------------------------------- progress */

export type ProjectProgressInput = {
  totalActivities: number; // excludes cancelled and archived
  completedActivities: number;
  overdueActivities: number;
  blockedActivities: number;
  unassignedActivities: number;
  milestonesTotal: number;
  milestonesCompleted: number;
  milestonesOverdue: number;
  estimatedMinutes: number | null;
  loggedMinutes: number;
  openHighRisks: number; // open/monitoring/occurred with severity high|critical
  targetDate: string | null; // YYYY-MM-DD
  status: string;
  now: Date;
};

export type ProjectProgress = {
  percent: number; // 0–100, completed / total (cancelled excluded)
  daysRemaining: number | null; // negative = past target
  timeDeviationMinutes: number | null; // logged - estimated (null without estimate)
};

export function computeProgress(input: ProjectProgressInput): ProjectProgress {
  const percent =
    input.totalActivities === 0
      ? 0
      : Math.round((input.completedActivities / input.totalActivities) * 100);
  let daysRemaining: number | null = null;
  if (input.targetDate) {
    daysRemaining = Math.ceil(
      (new Date(`${input.targetDate}T23:59:59Z`).getTime() - input.now.getTime()) / 86_400_000,
    );
  }
  const timeDeviationMinutes =
    input.estimatedMinutes === null ? null : input.loggedMinutes - input.estimatedMinutes;
  return { percent, daysRemaining, timeDeviationMinutes };
}

/* ------------------------------------------------------------------ health */

/**
 * SUGGESTED health from real aggregates. Never overwrites a manually set
 * healthStatus — the UI shows the suggestion next to the manual value.
 */
export function suggestedHealth(
  input: ProjectProgressInput,
): (typeof PROJECT_HEALTHS)[number] {
  if (input.status === "completed") return "completed";
  const { daysRemaining, timeDeviationMinutes } = computeProgress(input);
  const overTime =
    timeDeviationMinutes !== null &&
    input.estimatedMinutes !== null &&
    input.estimatedMinutes > 0 &&
    timeDeviationMinutes > input.estimatedMinutes * 0.2;

  if (input.blockedActivities > 0 && input.status === "on_hold") return "blocked";
  if (
    input.milestonesOverdue > 0 ||
    input.openHighRisks > 0 ||
    (daysRemaining !== null && daysRemaining < 0) ||
    overTime
  ) {
    return "at_risk";
  }
  if (input.blockedActivities > 0 || input.overdueActivities > 0 || input.unassignedActivities > 2) {
    return "attention";
  }
  return "on_track";
}

/* ------------------------------------------------------------- dependencies */

/**
 * Would adding blocker→blocked create a cycle? Pure BFS over the existing
 * edge list (edges as [blockerId, blockedId]). Also true for self-dependency.
 */
export function wouldCreateDependencyCycle(
  edges: Array<[number, number]>,
  blockerId: number,
  blockedId: number,
): boolean {
  if (blockerId === blockedId) return true;
  // cycle iff blocked can already reach blocker
  const adjacency = new Map<number, number[]>();
  for (const [from, to] of edges) {
    const list = adjacency.get(from);
    if (list) list.push(to);
    else adjacency.set(from, [to]);
  }
  const queue = [blockedId];
  const seen = new Set<number>([blockedId]);
  while (queue.length > 0) {
    const node = queue.shift()!;
    if (node === blockerId) return true;
    for (const next of adjacency.get(node) ?? []) {
      if (!seen.has(next)) {
        seen.add(next);
        queue.push(next);
      }
    }
  }
  return false;
}

/* -------------------------------------------------------------- subactivity */

/**
 * Hierarchy rule: max two levels. Valid parent = same project, same list,
 * not itself, not converted/archived, and not itself a subactivity.
 */
export function subactivityBlockReason(input: {
  parentId: number;
  childId: number | null; // null when creating a brand-new subactivity
  parentProjectId: number | null;
  parentListId: number | null;
  parentParentActivityId: number | null;
  parentConverted: boolean;
  parentArchived: boolean;
  childHasChildren: boolean;
}):
  | "self"
  | "parent_not_in_project"
  | "parent_is_subactivity"
  | "parent_inactive"
  | "child_has_children"
  | null {
  if (input.childId !== null && input.parentId === input.childId) return "self";
  if (!input.parentProjectId || !input.parentListId) return "parent_not_in_project";
  if (input.parentParentActivityId !== null) return "parent_is_subactivity";
  if (input.parentConverted || input.parentArchived) return "parent_inactive";
  if (input.childHasChildren) return "child_has_children";
  return null;
}

/* ------------------------------------------------------------------- labels */

export const PROJECT_BILLING_TYPES = [
  "fixed_price",
  "time_and_materials",
  "included_in_contract",
  "internal",
] as const;

/* ------------------------------------------------------- readable history */

const ENTITY_LABELS_ES: Record<string, string> = {
  project: "el proyecto",
  project_member: "un participante",
  project_list: "una lista",
  project_milestone: "un hito",
  project_risk: "un riesgo",
  project_comment: "un comentario",
  work_item_dependency: "una dependencia",
  work_item: "una actividad",
  activity: "una actividad",
  attachment: "un archivo",
  time_entry: "una sesión de tiempo",
};

const FIELD_LABELS_ES: Record<string, string> = {
  name: "nombre",
  status: "estado",
  healthStatus: "salud",
  priority: "prioridad",
  projectManagerId: "Project Manager",
  targetDate: "fecha objetivo",
  startDate: "fecha de inicio",
  assigneeId: "responsable",
  dueDate: "vencimiento",
  parentActivityId: "jerarquía",
  projectListId: "lista",
  isActive: "participación",
  position: "orden",
  body: "contenido",
};

/** One AuditLog row → a plain-language sentence for the Historial tab. */
export function describeProjectAuditEvent(log: {
  entityType: string;
  action: string;
  field: string | null;
  metadata: unknown;
}): string {
  const entity = ENTITY_LABELS_ES[log.entityType] ?? log.entityType;
  const meta = (log.metadata ?? {}) as Record<string, unknown>;
  const event = typeof meta.event === "string" ? meta.event : null;

  switch (event) {
    case "completed":
      return "Se completó el proyecto.";
    case "completed_with_exception":
      return `Se completó el proyecto con excepción (${meta.pendingActivities} pendiente(s)): ${meta.reason}.`;
    case "archived":
      return "Se archivó el proyecto.";
    case "restored":
      return "Se restauró el proyecto.";
    case "health_set_manually":
      return "Se cambió manualmente la salud del proyecto.";
    case "member_removed":
      return "Se retiró un participante.";
    case "member_restored":
      return "Se reincorporó un participante.";
    case "list_reordered":
      return "Se reordenó una lista.";
    case "moved_to_list":
      return `Se movió una actividad a la lista "${meta.listName}".`;
    case "hierarchy_changed":
      return "Se cambió la jerarquía de una actividad.";
    case "milestone_completed":
      return "Se completó un hito.";
    case "milestone_reopened":
      return "Se reabrió un hito.";
    case "activity_linked":
      return "Se vinculó una actividad a un hito.";
    case "activity_unlinked":
      return "Se desvinculó una actividad de un hito.";
    case "completed_while_blocked":
      return "Se completó una actividad con dependencias abiertas (confirmado).";
    case "comment_edited":
      return "Se editó un comentario.";
  }

  if (log.action === "create") return `Se creó ${entity}.`;
  if (log.action === "delete") return `Se eliminó ${entity}.`;
  if (log.action === "convert") return "Una actividad se convirtió en ticket y salió del proyecto.";
  if (log.action === "update" && log.field) {
    return `Se actualizó ${FIELD_LABELS_ES[log.field] ?? log.field} de ${entity}.`;
  }
  return `Se actualizó ${entity}.`;
}
