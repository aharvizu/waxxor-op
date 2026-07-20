import { and, asc, desc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  activities,
  attachments,
  auditLogs,
  companies,
  milestoneActivities,
  projectComments,
  projectLists,
  projectMembers,
  projectMilestones,
  projectRisks,
  projects,
  timeEntries,
  users,
  workItemDependencies,
  workItems,
} from "@/db/schema";
import {
  OPEN_ACTIVITY_STATUSES,
  OPEN_RISK_STATUSES,
  type ProjectProgressInput,
  riskSeverity,
} from "@/lib/projects";

/**
 * Data layer for Projects. Aggregates run as single-pass SQL (correlated
 * subqueries or grouped counts) — no N+1. Tabs load only their own data.
 */

const openStatusList = sql.join(
  OPEN_ACTIVITY_STATUSES.map((s) => sql`${s}`),
  sql`, `,
);

/** Per-project aggregate columns reused by directory and detail. */
export function projectAggregates() {
  const total = sql<number>`(select count(*)::int from ${activities} a
    join ${workItems} w on w.id = a.work_item_id
    where a.project_id = ${projects.id} and a.converted_at is null
    and w.status not in ('cancelled','archived'))`;
  const completed = sql<number>`(select count(*)::int from ${activities} a
    join ${workItems} w on w.id = a.work_item_id
    where a.project_id = ${projects.id} and a.converted_at is null
    and w.status = 'completed')`;
  const overdue = sql<number>`(select count(*)::int from ${activities} a
    join ${workItems} w on w.id = a.work_item_id
    where a.project_id = ${projects.id} and a.converted_at is null
    and w.status in (${openStatusList}) and w.due_date < current_date)`;
  const blocked = sql<number>`(select count(*)::int from ${activities} a
    join ${workItems} w on w.id = a.work_item_id
    where a.project_id = ${projects.id} and a.converted_at is null
    and w.status = 'blocked')`;
  const unassigned = sql<number>`(select count(*)::int from ${activities} a
    join ${workItems} w on w.id = a.work_item_id
    where a.project_id = ${projects.id} and a.converted_at is null
    and w.status in (${openStatusList}) and w.assignee_id is null)`;
  const loggedMinutes = sql<number>`coalesce((select sum(te.duration_minutes)::int
    from ${timeEntries} te join ${activities} a on a.work_item_id = te.work_item_id
    where a.project_id = ${projects.id} and te.voided_at is null), 0)`;
  const milestonesTotal = sql<number>`(select count(*)::int from ${projectMilestones} m
    where m.project_id = ${projects.id} and m.status != 'cancelled')`;
  const milestonesCompleted = sql<number>`(select count(*)::int from ${projectMilestones} m
    where m.project_id = ${projects.id} and m.status = 'completed')`;
  const milestonesOverdue = sql<number>`(select count(*)::int from ${projectMilestones} m
    where m.project_id = ${projects.id} and m.status in ('pending','in_progress','delayed')
    and m.target_date < current_date)`;
  const nextMilestone = sql<string | null>`(select m.name || ' · ' || m.target_date::text
    from ${projectMilestones} m
    where m.project_id = ${projects.id} and m.status in ('pending','in_progress','delayed')
    order by m.target_date asc limit 1)`;
  const openHighRisks = sql<number>`(select count(*)::int from ${projectRisks} r
    where r.project_id = ${projects.id} and r.status in ('open','monitoring','occurred')
    and (r.probability = 'high' and r.impact in ('high','critical')
      or r.impact = 'critical' and r.probability in ('medium','high')
      or r.probability = 'medium' and r.impact = 'critical'))`;
  const openRisks = sql<number>`(select count(*)::int from ${projectRisks} r
    where r.project_id = ${projects.id} and r.status in ('open','monitoring','occurred'))`;
  return {
    total,
    completed,
    overdue,
    blocked,
    unassigned,
    loggedMinutes,
    milestonesTotal,
    milestonesCompleted,
    milestonesOverdue,
    nextMilestone,
    openHighRisks,
    openRisks,
  };
}

/** One project + all header aggregates in a single round trip. */
export async function getProjectDetail(orgId: number, projectId: number) {
  const agg = projectAggregates();
  const [row] = await db
    .select({
      project: projects,
      companyName: companies.name,
      managerName: users.name,
      ...agg,
    })
    .from(projects)
    .leftJoin(companies, eq(projects.companyId, companies.id))
    .leftJoin(users, eq(projects.projectManagerId, users.id))
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, orgId)));
  return row ?? null;
}

/** Aggregates → the pure-progress input shape. */
export function toProgressInput(
  row: NonNullable<Awaited<ReturnType<typeof getProjectDetail>>>,
  now = new Date(),
): ProjectProgressInput {
  return {
    totalActivities: row.total,
    completedActivities: row.completed,
    overdueActivities: row.overdue,
    blockedActivities: row.blocked,
    unassignedActivities: row.unassigned,
    milestonesTotal: row.milestonesTotal,
    milestonesCompleted: row.milestonesCompleted,
    milestonesOverdue: row.milestonesOverdue,
    estimatedMinutes: row.project.estimatedMinutes,
    loggedMinutes: row.loggedMinutes,
    openHighRisks: row.openHighRisks,
    targetDate: row.project.targetDate,
    status: row.project.status,
    now,
  };
}

/* -------------------------------------------------------------- work tree */

export type ProjectTreeActivity = {
  activityId: number;
  workItemId: number;
  listId: number | null;
  parentActivityId: number | null;
  title: string;
  status: string;
  priority: string;
  assigneeId: number | null;
  assigneeName: string | null;
  companyId: number | null;
  startDate: string | null;
  dueDate: string | null;
  estimatedMinutes: number | null;
  minutes: number;
  blockedByCount: number;
  blocksCount: number;
  updatedAt: Date;
};

/** Lists + all project activities (with per-row time and dependency counts) in 2 queries. */
export async function getProjectWorkTree(orgId: number, projectId: number) {
  const [lists, rows] = await Promise.all([
    db
      .select()
      .from(projectLists)
      .where(and(eq(projectLists.organizationId, orgId), eq(projectLists.projectId, projectId)))
      .orderBy(asc(projectLists.position), asc(projectLists.id)),
    db
      .select({
        activityId: activities.id,
        workItemId: workItems.id,
        listId: activities.projectListId,
        parentActivityId: activities.parentActivityId,
        title: workItems.title,
        status: workItems.status,
        priority: workItems.priority,
        assigneeId: workItems.assigneeId,
        assigneeName: users.name,
        companyId: workItems.companyId,
        startDate: workItems.startDate,
        dueDate: workItems.dueDate,
        estimatedMinutes: workItems.estimatedMinutes,
        minutes: sql<number>`coalesce((select sum(te.duration_minutes)::int from ${timeEntries} te
          where te.work_item_id = ${workItems.id} and te.voided_at is null), 0)`,
        blockedByCount: sql<number>`(select count(*)::int from ${workItemDependencies} d
          where d.blocked_work_item_id = ${workItems.id})`,
        blocksCount: sql<number>`(select count(*)::int from ${workItemDependencies} d
          where d.blocker_work_item_id = ${workItems.id})`,
        updatedAt: workItems.updatedAt,
      })
      .from(activities)
      .innerJoin(workItems, eq(activities.workItemId, workItems.id))
      .leftJoin(users, eq(workItems.assigneeId, users.id))
      .where(
        and(
          eq(activities.organizationId, orgId),
          eq(activities.projectId, projectId),
          isNull(activities.convertedAt),
          ne(workItems.status, "archived"),
        ),
      )
      .orderBy(asc(workItems.dueDate), asc(workItems.id)),
  ]);
  return { lists, activities: rows as ProjectTreeActivity[] };
}

/** Both directions of every dependency touching this project's activities. */
export async function getProjectDependencies(orgId: number, projectId: number) {
  const projectItems = db
    .select({ id: workItems.id })
    .from(activities)
    .innerJoin(workItems, eq(activities.workItemId, workItems.id))
    .where(and(eq(activities.projectId, projectId), eq(activities.organizationId, orgId)));
  return db
    .select({
      id: workItemDependencies.id,
      blockerWorkItemId: workItemDependencies.blockerWorkItemId,
      blockedWorkItemId: workItemDependencies.blockedWorkItemId,
      blockerTitle: sql<string>`(select w.title from ${workItems} w where w.id = ${workItemDependencies.blockerWorkItemId})`,
      blockedTitle: sql<string>`(select w.title from ${workItems} w where w.id = ${workItemDependencies.blockedWorkItemId})`,
      blockerStatus: sql<string>`(select w.status::text from ${workItems} w where w.id = ${workItemDependencies.blockerWorkItemId})`,
    })
    .from(workItemDependencies)
    .where(
      and(
        eq(workItemDependencies.organizationId, orgId),
        or(
          inArray(workItemDependencies.blockerWorkItemId, projectItems),
          inArray(workItemDependencies.blockedWorkItemId, projectItems),
        ),
      ),
    );
}

/* --------------------------------------------------- members / milestones */

export async function getProjectMembers(orgId: number, projectId: number) {
  return db
    .select({ member: projectMembers, userName: users.name, userRole: users.role })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(
      and(eq(projectMembers.organizationId, orgId), eq(projectMembers.projectId, projectId)),
    )
    .orderBy(desc(projectMembers.isActive), asc(users.name));
}

export async function getProjectMilestones(orgId: number, projectId: number) {
  return db
    .select({
      milestone: projectMilestones,
      ownerName: users.name,
      linkedActivities: sql<number>`(select count(*)::int from ${milestoneActivities} ma
        where ma.milestone_id = ${projectMilestones.id})`,
      linkedCompleted: sql<number>`(select count(*)::int from ${milestoneActivities} ma
        join ${activities} a on a.id = ma.activity_id
        join ${workItems} w on w.id = a.work_item_id
        where ma.milestone_id = ${projectMilestones.id} and w.status = 'completed')`,
    })
    .from(projectMilestones)
    .leftJoin(users, eq(projectMilestones.ownerId, users.id))
    .where(
      and(
        eq(projectMilestones.organizationId, orgId),
        eq(projectMilestones.projectId, projectId),
      ),
    )
    .orderBy(asc(projectMilestones.targetDate), asc(projectMilestones.position));
}

export async function getMilestoneLinks(orgId: number, milestoneIds: number[]) {
  if (milestoneIds.length === 0) return [];
  return db
    .select({
      milestoneId: milestoneActivities.milestoneId,
      activityId: milestoneActivities.activityId,
      title: workItems.title,
      status: workItems.status,
    })
    .from(milestoneActivities)
    .innerJoin(activities, eq(milestoneActivities.activityId, activities.id))
    .innerJoin(workItems, eq(activities.workItemId, workItems.id))
    .where(
      and(
        eq(milestoneActivities.organizationId, orgId),
        inArray(milestoneActivities.milestoneId, milestoneIds),
      ),
    );
}

/* -------------------------------------------------------------------- risks */

export async function getProjectRisks(orgId: number, projectId: number) {
  const rows = await db
    .select({ risk: projectRisks, ownerName: users.name })
    .from(projectRisks)
    .leftJoin(users, eq(projectRisks.ownerId, users.id))
    .where(
      and(eq(projectRisks.organizationId, orgId), eq(projectRisks.projectId, projectId)),
    )
    .orderBy(desc(projectRisks.createdAt));
  const sevOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  const openOrder = (s: string) => ((OPEN_RISK_STATUSES as readonly string[]).includes(s) ? 0 : 1);
  return rows
    .map((r) => ({ ...r, severity: riskSeverity(r.risk.probability, r.risk.impact) }))
    .sort(
      (a, b) =>
        openOrder(a.risk.status) - openOrder(b.risk.status) ||
        sevOrder[a.severity] - sevOrder[b.severity],
    );
}

/* --------------------------------------------------------------------- time */

export async function getProjectTimeRollup(
  orgId: number,
  projectId: number,
  from?: string,
  to?: string,
) {
  const base = and(
    eq(timeEntries.organizationId, orgId),
    eq(activities.projectId, projectId),
    isNull(timeEntries.voidedAt),
    from ? sql`${timeEntries.date} >= ${from}` : sql`true`,
    to ? sql`${timeEntries.date} <= ${to}` : sql`true`,
  );
  const joinChain = (q: ReturnType<typeof db.select>) => q;
  void joinChain;
  const [totals, byUser, byList, byActivity, byModality] = await Promise.all([
    db
      .select({
        total: sql<number>`coalesce(sum(${timeEntries.durationMinutes}), 0)::int`,
        billable: sql<number>`coalesce(sum(${timeEntries.durationMinutes}) filter (where ${timeEntries.billingStatus} = 'billable'), 0)::int`,
        nonBillable: sql<number>`coalesce(sum(${timeEntries.durationMinutes}) filter (where ${timeEntries.billingStatus} = 'non_billable'), 0)::int`,
        inContract: sql<number>`coalesce(sum(${timeEntries.durationMinutes}) filter (where ${timeEntries.billingStatus} = 'included_in_contract'), 0)::int`,
      })
      .from(timeEntries)
      .innerJoin(activities, eq(activities.workItemId, timeEntries.workItemId))
      .where(base),
    db
      .select({ name: users.name, minutes: sql<number>`sum(${timeEntries.durationMinutes})::int` })
      .from(timeEntries)
      .innerJoin(activities, eq(activities.workItemId, timeEntries.workItemId))
      .leftJoin(users, eq(timeEntries.userId, users.id))
      .where(base)
      .groupBy(users.name)
      .orderBy(desc(sql`sum(${timeEntries.durationMinutes})`)),
    db
      .select({
        listName: sql<string | null>`(select pl.name from ${projectLists} pl where pl.id = ${activities.projectListId})`,
        minutes: sql<number>`sum(${timeEntries.durationMinutes})::int`,
      })
      .from(timeEntries)
      .innerJoin(activities, eq(activities.workItemId, timeEntries.workItemId))
      .where(base)
      .groupBy(activities.projectListId)
      .orderBy(desc(sql`sum(${timeEntries.durationMinutes})`)),
    db
      .select({
        title: workItems.title,
        minutes: sql<number>`sum(${timeEntries.durationMinutes})::int`,
      })
      .from(timeEntries)
      .innerJoin(activities, eq(activities.workItemId, timeEntries.workItemId))
      .innerJoin(workItems, eq(workItems.id, timeEntries.workItemId))
      .where(base)
      .groupBy(workItems.title)
      .orderBy(desc(sql`sum(${timeEntries.durationMinutes})`))
      .limit(15),
    db
      .select({
        modality: timeEntries.modality,
        minutes: sql<number>`sum(${timeEntries.durationMinutes})::int`,
      })
      .from(timeEntries)
      .innerJoin(activities, eq(activities.workItemId, timeEntries.workItemId))
      .where(base)
      .groupBy(timeEntries.modality),
  ]);
  return { totals: totals[0], byUser, byList, byActivity, byModality };
}

/* ------------------------------------------------- comments / attachments */

export async function getProjectComments(orgId: number, projectId: number, limit = 50) {
  return db
    .select({ comment: projectComments, authorName: users.name })
    .from(projectComments)
    .leftJoin(users, eq(projectComments.authorId, users.id))
    .where(
      and(eq(projectComments.organizationId, orgId), eq(projectComments.projectId, projectId)),
    )
    .orderBy(desc(projectComments.createdAt))
    .limit(limit);
}

/** Project-level files + files on the project's activities. */
export async function getProjectAttachments(orgId: number, projectId: number, limit = 50) {
  return db
    .select({ attachment: attachments, uploaderName: users.name, itemTitle: workItems.title })
    .from(attachments)
    .leftJoin(users, eq(attachments.uploadedById, users.id))
    .leftJoin(workItems, eq(attachments.workItemId, workItems.id))
    .where(
      and(
        eq(attachments.organizationId, orgId),
        or(
          eq(attachments.projectId, projectId),
          sql`${attachments.workItemId} in (select a.work_item_id from ${activities} a
            where a.project_id = ${projectId})`,
        ),
      ),
    )
    .orderBy(desc(attachments.createdAt))
    .limit(limit);
}

/* ------------------------------------------------------------------ history */

/** AuditLog rows for the project and everything belonging to it. */
export async function getProjectAuditTrail(orgId: number, projectId: number, limit = 120) {
  const [listIds, milestoneIds, riskIds, workItemIds, commentIds] = await Promise.all([
    db.select({ id: projectLists.id }).from(projectLists).where(eq(projectLists.projectId, projectId)),
    db
      .select({ id: projectMilestones.id })
      .from(projectMilestones)
      .where(eq(projectMilestones.projectId, projectId)),
    db.select({ id: projectRisks.id }).from(projectRisks).where(eq(projectRisks.projectId, projectId)),
    db
      .select({ id: activities.workItemId })
      .from(activities)
      .where(eq(activities.projectId, projectId)),
    db
      .select({ id: projectComments.id })
      .from(projectComments)
      .where(eq(projectComments.projectId, projectId)),
  ]);
  const scoped = (entityType: string, ids: number[]) =>
    ids.length > 0
      ? and(eq(auditLogs.entityType, entityType), inArray(auditLogs.entityId, ids))
      : sql`false`;
  return db
    .select({ log: auditLogs, actorName: users.name })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(
      and(
        eq(auditLogs.organizationId, orgId),
        or(
          and(eq(auditLogs.entityType, "project"), eq(auditLogs.entityId, projectId)),
          and(
            inArray(auditLogs.entityType, ["project_member", "project_list", "project_milestone", "project_risk", "project_comment", "work_item_dependency"]),
            sql`(${auditLogs.metadata} ->> 'projectId')::int = ${projectId}`,
          ),
          scoped("project_list", listIds.map((r) => r.id)),
          scoped("project_milestone", milestoneIds.map((r) => r.id)),
          scoped("project_risk", riskIds.map((r) => r.id)),
          scoped("project_comment", commentIds.map((r) => r.id)),
          scoped("work_item", workItemIds.map((r) => r.id)),
        ),
      ),
    )
    .orderBy(desc(auditLogs.createdAt))
    .limit(limit);
}

/* ------------------------------------------------------- Today integration */

/**
 * Per-user project signals for Hoy: upcoming/overdue milestones the user owns,
 * open high risks assigned to them, and at-risk projects they manage.
 * Bounded queries — never loads whole projects.
 */
export async function getUserProjectSignals(orgId: number, userId: number) {
  const horizon = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const [milestones, risks, riskyProjects] = await Promise.all([
    db
      .select({
        id: projectMilestones.id,
        name: projectMilestones.name,
        targetDate: projectMilestones.targetDate,
        projectId: projectMilestones.projectId,
        projectName: projects.name,
      })
      .from(projectMilestones)
      .innerJoin(projects, eq(projectMilestones.projectId, projects.id))
      .where(
        and(
          eq(projectMilestones.organizationId, orgId),
          eq(projectMilestones.ownerId, userId),
          inArray(projectMilestones.status, ["pending", "in_progress", "delayed"]),
          sql`${projectMilestones.targetDate} <= ${horizon}`,
          sql`${projects.status} not in ('completed','cancelled','archived')`,
        ),
      )
      .limit(20),
    db
      .select({
        id: projectRisks.id,
        title: projectRisks.title,
        probability: projectRisks.probability,
        impact: projectRisks.impact,
        projectId: projectRisks.projectId,
        projectName: projects.name,
        createdAt: projectRisks.createdAt,
      })
      .from(projectRisks)
      .innerJoin(projects, eq(projectRisks.projectId, projects.id))
      .where(
        and(
          eq(projectRisks.organizationId, orgId),
          eq(projectRisks.ownerId, userId),
          inArray(projectRisks.status, ["open", "monitoring", "occurred"]),
          sql`${projects.status} not in ('completed','cancelled','archived')`,
        ),
      )
      .limit(20),
    db
      .select({
        id: projects.id,
        name: projects.name,
        folio: projects.folio,
        healthStatus: projects.healthStatus,
        status: projects.status,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(
        and(
          eq(projects.organizationId, orgId),
          eq(projects.projectManagerId, userId),
          or(eq(projects.status, "at_risk"), eq(projects.healthStatus, "at_risk"), eq(projects.healthStatus, "blocked")),
        ),
      )
      .limit(10),
  ]);
  return {
    milestones,
    risks: risks.filter((r) => ["high", "critical"].includes(riskSeverity(r.probability, r.impact))),
    riskyProjects,
  };
}
