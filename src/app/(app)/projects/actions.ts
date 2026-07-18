"use server";

import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db, type DbExecutor } from "@/db";
import {
  catalogItems,
  activities,
  attachments,
  clients,
  milestoneActivities,
  projectComments,
  projectLists,
  projectMembers,
  projectMilestones,
  projectRisks,
  projects,
  users,
  workItemDependencies,
  workItems,
} from "@/db/schema";
import {
  type ActionState,
  businessError,
  parseForm,
  success,
  unexpectedError,
} from "@/lib/action-result";
import { activityTypeSchema } from "@/lib/activities";
import { diffFields, recordAudit } from "@/lib/audit";
import {
  MAX_ATTACHMENT_BYTES,
  deleteAttachmentBlob,
  newStorageKey,
  saveAttachment,
} from "@/lib/attachments";
import {
  OPEN_ACTIVITY_STATUSES,
  milestoneStatusSchema,
  projectHealthSchema,
  projectListStatusSchema,
  projectMemberRoleSchema,
  projectPrioritySchema,
  projectWorkflowStatusSchema,
  riskImpactSchema,
  riskProbabilitySchema,
  riskSeverity,
  riskStatusSchema,
  subactivityBlockReason,
  wouldCreateDependencyCycle,
} from "@/lib/projects";
import { requireRole, requireUser, type SessionUser } from "@/lib/session";
import { getSetting } from "@/lib/settings-data";
import { projectTemplateConfigSchema } from "@/lib/settings";
import { createWorkItem, updateWorkItemFields } from "@/lib/work-items";

/** Roles allowed to manage projects (spec §25); technicians manage activities. */
const MGMT_ROLES = ["superadmin", "administrator", "director", "project_manager"] as const;

class NotFoundError extends Error {}
class RuleError extends Error {}
class ArchivedError extends Error {}

function fail(err: unknown): ActionState {
  if (err instanceof NotFoundError) return businessError("El registro ya no existe.");
  if (err instanceof ArchivedError) {
    return businessError("Este proyecto está archivado — restáuralo antes de modificarlo.");
  }
  if (err instanceof RuleError) return businessError(err.message);
  return unexpectedError(err);
}

function refresh(projectId?: number) {
  revalidatePath("/projects");
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

const idSchema = z.object({ id: z.coerce.number().int().positive() });
const optionalText = z
  .string()
  .optional()
  .transform((v) => (v ?? "").trim() || null);
const optionalId = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number().int().positive().nullable(),
);
const optionalDate = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida.").nullable(),
);
const optionalInt = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
  z.number().int().min(0).nullable(),
);
const optionalMoney = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? null : String(v)),
  z.string().regex(/^\d+(\.\d{1,2})?$/, "Monto inválido.").nullable(),
);

async function loadProject(tx: DbExecutor, user: SessionUser, id: number) {
  const [row] = await tx
    .select()
    .from(projects)
    .where(and(eq(projects.id, id), eq(projects.organizationId, user.organizationId)));
  if (!row) throw new NotFoundError();
  return row;
}

function assertOperational(project: typeof projects.$inferSelect) {
  if (project.status === "archived" || project.archivedAt) throw new ArchivedError();
}

async function orgUserId(tx: DbExecutor, orgId: number, id: number | null) {
  if (id === null) return null;
  const [row] = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, id), eq(users.organizationId, orgId), ne(users.role, "client")));
  return row?.id ?? null;
}

/** Upsert the PM as an active manager member (spec §4: PM must be a participant). */
async function ensureManagerMember(
  tx: DbExecutor,
  user: SessionUser,
  projectId: number,
  managerId: number,
) {
  const [existing] = await tx
    .select()
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, managerId)));
  if (existing) {
    if (existing.role !== "manager" || !existing.isActive) {
      await tx
        .update(projectMembers)
        .set({ role: "manager", isActive: true, removedAt: null })
        .where(eq(projectMembers.id, existing.id));
    }
    return existing.id;
  }
  const [created] = await tx
    .insert(projectMembers)
    .values({
      organizationId: user.organizationId,
      projectId,
      userId: managerId,
      role: "manager",
    })
    .returning({ id: projectMembers.id });
  await recordAudit(tx, {
    organizationId: user.organizationId,
    userId: Number(user.id),
    entityType: "project_member",
    entityId: created.id,
    action: "create",
    metadata: { projectId, memberUserId: managerId, role: "manager" },
  });
  return created.id;
}

/* ==================================================================== project */

const projectCoreSchema = z.object({
  name: z.string("Nombre requerido.").trim().min(1, "Nombre requerido."),
  description: optionalText,
  clientId: optionalId,
  projectManagerId: z.coerce
    .number("Project Manager requerido.")
    .int()
    .positive("Project Manager requerido."),
  priority: projectPrioritySchema.default("normal"),
  startDate: optionalDate,
  targetDate: optionalDate,
  estimatedMinutes: optionalInt,
  budgetAmount: optionalMoney,
  billingType: optionalText,
});

export async function createProject(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole(...MGMT_ROLES);
  const { data, error } = parseForm(
    projectCoreSchema.extend({ initialListName: optionalText, templateId: optionalId }),
    formData,
  );
  if (error) return error;
  const memberIds = formData
    .getAll("memberIds")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n > 0);

  const orgDefaults = await getSetting(user.organizationId, "projects.defaults");

  let projectId = 0;
  try {
    projectId = await db.transaction(async (tx) => {
      const managerId = await orgUserId(tx, user.organizationId, data.projectManagerId);
      if (!managerId) {
        throw new RuleError("El Project Manager debe ser un usuario interno de la organización.");
      }
      if (data.clientId !== null) {
        const [client] = await tx
          .select({ id: clients.id })
          .from(clients)
          .where(and(eq(clients.id, data.clientId), eq(clients.organizationId, user.organizationId)));
        if (!client) throw new RuleError("El cliente no existe en esta organización.");
      }

      const [project] = await tx
        .insert(projects)
        .values({
          organizationId: user.organizationId,
          folio: sql`'PRJ-' || lpad(nextval('project_folio_seq')::text, 6, '0')`,
          name: data.name,
          description: data.description,
          clientId: data.clientId,
          status: "planning",
          healthStatus: orgDefaults.defaultHealth,
          priority: data.priority,
          projectManagerId: managerId,
          startDate: data.startDate,
          targetDate: data.targetDate,
          estimatedMinutes: data.estimatedMinutes,
          budgetAmount: data.budgetAmount,
          billingType: data.billingType,
          createdById: Number(user.id),
        })
        .returning({ id: projects.id, folio: projects.folio });

      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "project",
        entityId: project.id,
        action: "create",
        metadata: { values: { ...data, folio: project.folio } },
      });

      await ensureManagerMember(tx, user, project.id, managerId);
      for (const memberId of memberIds) {
        if (memberId === managerId) continue;
        const validId = await orgUserId(tx, user.organizationId, memberId);
        if (!validId) continue;
        const [member] = await tx
          .insert(projectMembers)
          .values({
            organizationId: user.organizationId,
            projectId: project.id,
            userId: validId,
          })
          .onConflictDoNothing()
          .returning({ id: projectMembers.id });
        if (member) {
          await recordAudit(tx, {
            organizationId: user.organizationId,
            userId: Number(user.id),
            entityType: "project_member",
            entityId: member.id,
            action: "create",
            metadata: { projectId: project.id, memberUserId: validId, role: "contributor" },
          });
        }
      }

      // spec §14: never create a project without an operational list.
      // A template (Settings → Proyectos) creates its lists; otherwise one initial list.
      let listNames = [data.initialListName ?? "General"];
      if (data.templateId !== null) {
        const [template] = await tx
          .select()
          .from(catalogItems)
          .where(
            and(
              eq(catalogItems.id, data.templateId),
              eq(catalogItems.organizationId, user.organizationId),
              eq(catalogItems.kind, "project_template"),
              eq(catalogItems.isActive, true),
            ),
          );
        if (!template) throw new RuleError("La plantilla de proyecto no existe o está archivada.");
        const config = projectTemplateConfigSchema.safeParse(template.config);
        if (!config.success) throw new RuleError("La plantilla de proyecto no tiene listas válidas.");
        listNames = config.data.lists;
      }
      for (const [position, listName] of listNames.entries()) {
        const [list] = await tx
          .insert(projectLists)
          .values({
            organizationId: user.organizationId,
            projectId: project.id,
            name: listName,
            position,
            createdById: Number(user.id),
          })
          .returning({ id: projectLists.id });
        await recordAudit(tx, {
          organizationId: user.organizationId,
          userId: Number(user.id),
          entityType: "project_list",
          entityId: list.id,
          action: "create",
          metadata: { projectId: project.id, name: listName, templateId: data.templateId },
        });
      }
      return project.id;
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/projects");
  redirect(`/projects/${projectId}`);
}

const PROJECT_AUDITED = [
  "name", "description", "clientId", "priority", "projectManagerId", "ownerId",
  "startDate", "targetDate", "estimatedMinutes", "budgetAmount", "billingType",
] as const;

export async function updateProject(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole(...MGMT_ROLES);
  const { data, error } = parseForm(
    projectCoreSchema.extend(idSchema.shape).extend({ ownerId: optionalId }),
    formData,
  );
  if (error) return error;

  try {
    await db.transaction(async (tx) => {
      const before = await loadProject(tx, user, data.id);
      assertOperational(before);
      const managerId = await orgUserId(tx, user.organizationId, data.projectManagerId);
      if (!managerId) {
        throw new RuleError("El Project Manager debe ser un usuario interno de la organización.");
      }
      if (data.clientId !== null) {
        const [client] = await tx
          .select({ id: clients.id })
          .from(clients)
          .where(and(eq(clients.id, data.clientId), eq(clients.organizationId, user.organizationId)));
        if (!client) throw new RuleError("El cliente no existe en esta organización.");
      }
      const patch = {
        ...data,
        id: undefined,
        projectManagerId: managerId,
        ownerId: await orgUserId(tx, user.organizationId, data.ownerId),
      };
      const changes = diffFields(
        { organizationId: user.organizationId, userId: Number(user.id), entityType: "project", entityId: before.id },
        before,
        patch,
        PROJECT_AUDITED,
      );
      if (changes.length === 0) return;
      await tx
        .update(projects)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(projects.id, before.id));
      await recordAudit(tx, changes);
      if (managerId !== before.projectManagerId) {
        await ensureManagerMember(tx, user, before.id, managerId);
      }
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.id);
  return success("Proyecto actualizado.");
}

export async function setProjectStatus(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole(...MGMT_ROLES);
  const { data, error } = parseForm(
    idSchema.extend({ status: projectWorkflowStatusSchema }),
    formData,
  );
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const before = await loadProject(tx, user, data.id);
      assertOperational(before);
      if (data.status === "active" && !before.projectManagerId) {
        throw new RuleError("Un proyecto activo requiere Project Manager.");
      }
      if (before.status === data.status) return;
      await tx
        .update(projects)
        .set({ status: data.status, completedAt: null, updatedAt: new Date() })
        .where(eq(projects.id, before.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "project",
        entityId: before.id,
        action: "update",
        field: "status",
        oldValue: before.status,
        newValue: data.status,
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.id);
  return success("Estado actualizado.");
}

export async function setProjectHealth(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole(...MGMT_ROLES);
  const { data, error } = parseForm(
    idSchema.extend({ healthStatus: projectHealthSchema }),
    formData,
  );
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const before = await loadProject(tx, user, data.id);
      assertOperational(before);
      if (before.healthStatus === data.healthStatus) return;
      await tx
        .update(projects)
        .set({ healthStatus: data.healthStatus, updatedAt: new Date() })
        .where(eq(projects.id, before.id));
      // manual change is always recorded as such (spec §12)
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "project",
        entityId: before.id,
        action: "update",
        field: "healthStatus",
        oldValue: before.healthStatus,
        newValue: data.healthStatus,
        metadata: { event: "health_set_manually" },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.id);
  return success("Salud del proyecto actualizada.");
}

export async function completeProject(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole(...MGMT_ROLES);
  const { data, error } = parseForm(
    idSchema.extend({
      force: z.preprocess((v) => v === "on" || v === "true", z.boolean()).default(false),
      forceReason: optionalText,
    }),
    formData,
  );
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const before = await loadProject(tx, user, data.id);
      assertOperational(before);
      if (before.status === "completed") throw new RuleError("El proyecto ya está completado.");
      const [pending] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(activities)
        .innerJoin(workItems, eq(activities.workItemId, workItems.id))
        .where(
          and(
            eq(activities.projectId, before.id),
            isNull(activities.convertedAt),
            inArray(workItems.status, [...OPEN_ACTIVITY_STATUSES]),
          ),
        );
      if (pending.n > 0 && !data.force) {
        throw new RuleError(
          `Hay ${pending.n} actividad(es) pendiente(s). Complétalas o usa la excepción explícita con motivo.`,
        );
      }
      if (pending.n > 0 && data.force && !data.forceReason) {
        throw new RuleError("La excepción requiere un motivo.");
      }
      await tx
        .update(projects)
        .set({
          status: "completed",
          healthStatus: "completed",
          completedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(projects.id, before.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "project",
        entityId: before.id,
        action: "update",
        field: "status",
        oldValue: before.status,
        newValue: "completed",
        metadata:
          pending.n > 0
            ? {
                event: "completed_with_exception",
                pendingActivities: pending.n,
                reason: data.forceReason,
              }
            : { event: "completed" },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.id);
  return success("Proyecto completado.");
}

export async function archiveProject(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole(...MGMT_ROLES);
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const before = await loadProject(tx, user, data.id);
      if (before.status === "archived") return;
      await tx
        .update(projects)
        .set({ status: "archived", archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(projects.id, before.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "project",
        entityId: before.id,
        action: "update",
        field: "status",
        oldValue: before.status,
        newValue: "archived",
        metadata: { event: "archived" },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.id);
  return success("Proyecto archivado.");
}

export async function restoreProject(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole(...MGMT_ROLES);
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const before = await loadProject(tx, user, data.id);
      if (before.status !== "archived") throw new RuleError("El proyecto no está archivado.");
      const restored = before.completedAt ? "completed" : "planning";
      await tx
        .update(projects)
        .set({ status: restored, archivedAt: null, updatedAt: new Date() })
        .where(eq(projects.id, before.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "project",
        entityId: before.id,
        action: "update",
        field: "status",
        oldValue: "archived",
        newValue: restored,
        metadata: { event: "restored" },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.id);
  return success("Proyecto restaurado.");
}

/** SuperAdmin-only permanent deletion; blocked while the project has activities. */
export async function deleteProject(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const me = await requireRole("superadmin");
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const project = await loadProject(tx, me, data.id);
      const [work] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(activities)
        .where(eq(activities.projectId, project.id));
      if (work.n > 0) {
        throw new RuleError("Este proyecto tiene actividades — archívalo en lugar de eliminarlo.");
      }
      // lists/members/milestones/risks/comments cascade with the project row
      await tx.delete(projects).where(eq(projects.id, project.id));
      await recordAudit(tx, {
        organizationId: me.organizationId,
        userId: Number(me.id),
        entityType: "project",
        entityId: project.id,
        action: "delete",
        metadata: { values: { folio: project.folio, name: project.name, status: project.status } },
      });
    });
  } catch (err) {
    return fail(err);
  }
  revalidatePath("/projects");
  return success("Proyecto eliminado permanentemente.");
}

/* ==================================================================== members */

export async function addProjectMember(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole(...MGMT_ROLES);
  const { data, error } = parseForm(
    z.object({
      projectId: z.coerce.number().int().positive(),
      userId: z.coerce.number().int().positive("Selecciona un usuario."),
      role: projectMemberRoleSchema.default("contributor"),
    }),
    formData,
  );
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const project = await loadProject(tx, user, data.projectId);
      assertOperational(project);
      const validId = await orgUserId(tx, user.organizationId, data.userId);
      if (!validId) throw new RuleError("El usuario debe ser interno y de esta organización.");
      const [existing] = await tx
        .select()
        .from(projectMembers)
        .where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, validId)));
      if (existing) {
        if (existing.isActive) throw new RuleError("Ya es participante del proyecto.");
        await tx
          .update(projectMembers)
          .set({ isActive: true, removedAt: null, role: data.role })
          .where(eq(projectMembers.id, existing.id));
        await recordAudit(tx, {
          organizationId: user.organizationId,
          userId: Number(user.id),
          entityType: "project_member",
          entityId: existing.id,
          action: "update",
          field: "isActive",
          oldValue: "false",
          newValue: "true",
          metadata: { projectId: project.id, memberUserId: validId, event: "member_restored" },
        });
        return;
      }
      const [member] = await tx
        .insert(projectMembers)
        .values({
          organizationId: user.organizationId,
          projectId: project.id,
          userId: validId,
          role: data.role,
        })
        .returning({ id: projectMembers.id });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "project_member",
        entityId: member.id,
        action: "create",
        metadata: { projectId: project.id, memberUserId: validId, role: data.role },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.projectId);
  return success("Participante agregado.");
}

export async function removeProjectMember(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole(...MGMT_ROLES);
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  let projectId = 0;
  try {
    await db.transaction(async (tx) => {
      const [member] = await tx
        .select()
        .from(projectMembers)
        .where(
          and(eq(projectMembers.id, data.id), eq(projectMembers.organizationId, user.organizationId)),
        );
      if (!member || !member.isActive) throw new NotFoundError();
      const project = await loadProject(tx, user, member.projectId);
      assertOperational(project);
      if (project.projectManagerId === member.userId) {
        throw new RuleError("El Project Manager no puede quitarse — asigna otro PM primero.");
      }
      projectId = project.id;
      await tx
        .update(projectMembers)
        .set({ isActive: false, removedAt: new Date() })
        .where(eq(projectMembers.id, member.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "project_member",
        entityId: member.id,
        action: "update",
        field: "isActive",
        oldValue: "true",
        newValue: "false",
        metadata: { projectId: project.id, memberUserId: member.userId, event: "member_removed" },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(projectId);
  return success("Participante retirado.");
}

/* ====================================================================== lists */

const listSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  name: z.string("Nombre requerido.").trim().min(1, "Nombre requerido."),
  description: optionalText,
  startDate: optionalDate,
  targetDate: optionalDate,
});

async function loadList(tx: DbExecutor, user: SessionUser, id: number) {
  const [row] = await tx
    .select()
    .from(projectLists)
    .where(and(eq(projectLists.id, id), eq(projectLists.organizationId, user.organizationId)));
  if (!row) throw new NotFoundError();
  return row;
}

export async function createProjectList(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(listSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const project = await loadProject(tx, user, data.projectId);
      assertOperational(project);
      const [{ maxPos }] = await tx
        .select({ maxPos: sql<number>`coalesce(max(${projectLists.position}), -1)::int` })
        .from(projectLists)
        .where(eq(projectLists.projectId, project.id));
      const [list] = await tx
        .insert(projectLists)
        .values({
          organizationId: user.organizationId,
          projectId: project.id,
          name: data.name,
          description: data.description,
          startDate: data.startDate,
          targetDate: data.targetDate,
          position: maxPos + 1,
          createdById: Number(user.id),
        })
        .returning({ id: projectLists.id });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "project_list",
        entityId: list.id,
        action: "create",
        metadata: { projectId: project.id, name: data.name },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.projectId);
  return success("Lista creada.");
}

const LIST_AUDITED = ["name", "description", "startDate", "targetDate", "status"] as const;

export async function updateProjectList(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(
    listSchema.extend(idSchema.shape).extend({ status: projectListStatusSchema }),
    formData,
  );
  if (error) return error;
  let projectId = 0;
  try {
    await db.transaction(async (tx) => {
      const before = await loadList(tx, user, data.id);
      const project = await loadProject(tx, user, before.projectId);
      assertOperational(project);
      projectId = project.id;
      const patch = { ...data, id: undefined, projectId: undefined };
      const changes = diffFields(
        { organizationId: user.organizationId, userId: Number(user.id), entityType: "project_list", entityId: before.id },
        before,
        patch,
        LIST_AUDITED,
      );
      if (changes.length === 0) return;
      await tx
        .update(projectLists)
        .set({
          ...patch,
          archivedAt: data.status === "archived" ? (before.archivedAt ?? new Date()) : null,
          updatedAt: new Date(),
        })
        .where(eq(projectLists.id, before.id));
      await recordAudit(
        tx,
        changes.map((c) => ({ ...c, metadata: { projectId: before.projectId } })),
      );
    });
  } catch (err) {
    return fail(err);
  }
  refresh(projectId);
  return success("Lista actualizada.");
}

/** Swap positions with the neighbour above/below (stable non-drag reorder). */
export async function moveProjectList(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(
    idSchema.extend({ direction: z.enum(["up", "down"]) }),
    formData,
  );
  if (error) return error;
  let projectId = 0;
  try {
    await db.transaction(async (tx) => {
      const list = await loadList(tx, user, data.id);
      const project = await loadProject(tx, user, list.projectId);
      assertOperational(project);
      projectId = project.id;
      const siblings = await tx
        .select({ id: projectLists.id, position: projectLists.position })
        .from(projectLists)
        .where(eq(projectLists.projectId, list.projectId))
        .orderBy(asc(projectLists.position), asc(projectLists.id));
      const index = siblings.findIndex((s) => s.id === list.id);
      const target = data.direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= siblings.length) return;
      // normalize positions to indexes first so swaps are always well-defined
      for (let i = 0; i < siblings.length; i++) {
        if (siblings[i].position !== i) {
          await tx
            .update(projectLists)
            .set({ position: i })
            .where(eq(projectLists.id, siblings[i].id));
        }
      }
      await tx.update(projectLists).set({ position: target }).where(eq(projectLists.id, list.id));
      await tx
        .update(projectLists)
        .set({ position: index })
        .where(eq(projectLists.id, siblings[target].id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "project_list",
        entityId: list.id,
        action: "update",
        field: "position",
        oldValue: String(index),
        newValue: String(target),
        metadata: { projectId: project.id, event: "list_reordered" },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(projectId);
  return success("Lista reordenada.");
}

/* ======================================================== project activities */

const projectActivitySchema = z.object({
  projectId: z.coerce.number().int().positive(),
  listId: z.coerce.number("Selecciona una lista.").int().positive("Selecciona una lista."),
  parentActivityId: optionalId,
  title: z.string("Título requerido.").trim().min(1, "Título requerido."),
  description: optionalText,
  activityType: activityTypeSchema.default("general"),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  assigneeId: optionalId,
  startDate: optionalDate,
  dueDate: optionalDate,
  estimatedMinutes: optionalInt,
});

async function loadProjectActivity(tx: DbExecutor, user: SessionUser, activityId: number) {
  const [row] = await tx
    .select({ activity: activities, item: workItems })
    .from(activities)
    .innerJoin(workItems, eq(activities.workItemId, workItems.id))
    .where(and(eq(activities.id, activityId), eq(activities.organizationId, user.organizationId)));
  if (!row) throw new NotFoundError();
  return row;
}

function subactivityErrorText(
  reason: NonNullable<ReturnType<typeof subactivityBlockReason>>,
): string {
  switch (reason) {
    case "self":
      return "Una actividad no puede colgar de sí misma.";
    case "parent_not_in_project":
      return "La actividad padre no pertenece a un proyecto.";
    case "parent_is_subactivity":
      return "Máximo dos niveles: una subactividad no puede tener subactividades.";
    case "parent_inactive":
      return "La actividad padre está archivada o convertida.";
    case "child_has_children":
      return "Esta actividad tiene subactividades — no puede volverse subactividad.";
  }
}

export async function createProjectActivity(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(projectActivitySchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const project = await loadProject(tx, user, data.projectId);
      assertOperational(project);
      const list = await loadList(tx, user, data.listId);
      if (list.projectId !== project.id) throw new RuleError("La lista pertenece a otro proyecto.");
      if (list.status === "archived") {
        throw new RuleError("La lista está archivada — restáurala o usa otra.");
      }

      if (data.parentActivityId !== null) {
        const parent = await loadProjectActivity(tx, user, data.parentActivityId);
        const blocked = subactivityBlockReason({
          parentId: parent.activity.id,
          childId: null,
          parentProjectId: parent.activity.projectId,
          parentListId: parent.activity.projectListId,
          parentParentActivityId: parent.activity.parentActivityId,
          parentConverted: parent.activity.convertedAt !== null,
          parentArchived: parent.activity.archivedAt !== null,
          childHasChildren: false,
        });
        if (blocked) throw new RuleError(subactivityErrorText(blocked));
        if (parent.activity.projectId !== project.id || parent.activity.projectListId !== list.id) {
          throw new RuleError(
            "La subactividad debe estar en el mismo proyecto y lista que su actividad padre.",
          );
        }
      }

      const assigneeId = await orgUserId(tx, user.organizationId, data.assigneeId);
      // spec §6: with a client project, activities are consistently associated to that client
      const item = await createWorkItem(tx, user, {
        type: "activity",
        title: data.title,
        description: data.description,
        status: "pending",
        priority: data.priority,
        clientId: project.clientId,
        assigneeId,
        startDate: data.startDate,
        dueDate: data.dueDate,
        estimatedMinutes: data.estimatedMinutes,
      });
      const [activity] = await tx
        .insert(activities)
        .values({
          organizationId: user.organizationId,
          workItemId: item.id,
          activityType: data.activityType,
          projectId: project.id,
          projectListId: list.id,
          parentActivityId: data.parentActivityId,
        })
        .returning({ id: activities.id });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "activity",
        entityId: activity.id,
        action: "create",
        metadata: {
          workItemId: item.id,
          projectId: project.id,
          projectListId: list.id,
          parentActivityId: data.parentActivityId,
          activityType: data.activityType,
        },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.projectId);
  return success("Actividad creada.");
}

export async function moveActivityToList(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(
    idSchema.extend({ listId: z.coerce.number().int().positive() }),
    formData,
  );
  if (error) return error;
  let projectId = 0;
  try {
    await db.transaction(async (tx) => {
      const { activity } = await loadProjectActivity(tx, user, data.id);
      if (!activity.projectId) throw new RuleError("La actividad no pertenece a un proyecto.");
      if (activity.parentActivityId) {
        throw new RuleError("Mueve la actividad padre — las subactividades siguen a su padre.");
      }
      const project = await loadProject(tx, user, activity.projectId);
      assertOperational(project);
      projectId = project.id;
      const list = await loadList(tx, user, data.listId);
      if (list.projectId !== project.id) throw new RuleError("La lista pertenece a otro proyecto.");
      if (list.id === activity.projectListId) return;
      // move the activity AND its subactivities in one transaction
      await tx
        .update(activities)
        .set({ projectListId: list.id })
        .where(
          and(
            eq(activities.projectId, project.id),
            sql`(${activities.id} = ${activity.id} or ${activities.parentActivityId} = ${activity.id})`,
          ),
        );
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "activity",
        entityId: activity.id,
        action: "update",
        field: "projectListId",
        oldValue: String(activity.projectListId),
        newValue: String(list.id),
        metadata: { projectId: project.id, event: "moved_to_list", listName: list.name },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(projectId);
  return success("Actividad movida de lista.");
}

/** Set or clear the parent (hierarchy change) — max depth 2, no cycles, audited. */
export async function setActivityParent(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(idSchema.extend({ parentActivityId: optionalId }), formData);
  if (error) return error;
  let projectId = 0;
  try {
    await db.transaction(async (tx) => {
      const { activity } = await loadProjectActivity(tx, user, data.id);
      if (!activity.projectId) throw new RuleError("La actividad no pertenece a un proyecto.");
      const project = await loadProject(tx, user, activity.projectId);
      assertOperational(project);
      projectId = project.id;
      let newListId = activity.projectListId;
      if (data.parentActivityId !== null) {
        const parent = await loadProjectActivity(tx, user, data.parentActivityId);
        const [childCount] = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(activities)
          .where(eq(activities.parentActivityId, activity.id));
        const blocked = subactivityBlockReason({
          parentId: parent.activity.id,
          childId: activity.id,
          parentProjectId: parent.activity.projectId,
          parentListId: parent.activity.projectListId,
          parentParentActivityId: parent.activity.parentActivityId,
          parentConverted: parent.activity.convertedAt !== null,
          parentArchived: parent.activity.archivedAt !== null,
          childHasChildren: childCount.n > 0,
        });
        if (blocked) throw new RuleError(subactivityErrorText(blocked));
        if (parent.activity.projectId !== project.id) {
          throw new RuleError("La actividad padre pertenece a otro proyecto.");
        }
        newListId = parent.activity.projectListId; // subactivity always lives in its parent's list
      }
      await tx
        .update(activities)
        .set({ parentActivityId: data.parentActivityId, projectListId: newListId })
        .where(eq(activities.id, activity.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "activity",
        entityId: activity.id,
        action: "update",
        field: "parentActivityId",
        oldValue: activity.parentActivityId === null ? null : String(activity.parentActivityId),
        newValue: data.parentActivityId === null ? null : String(data.parentActivityId),
        metadata: { projectId: project.id, event: "hierarchy_changed" },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(projectId);
  return success("Jerarquía actualizada.");
}

/**
 * Complete a project activity. With OPEN blockers it requires explicit
 * confirmation (spec §10: warn, don't technically prevent).
 */
export async function completeProjectActivity(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(
    idSchema.extend({
      confirmBlocked: z
        .preprocess((v) => v === "on" || v === "true", z.boolean())
        .default(false),
    }),
    formData,
  );
  if (error) return error;
  let projectId = 0;
  try {
    await db.transaction(async (tx) => {
      const { activity, item } = await loadProjectActivity(tx, user, data.id);
      if (activity.convertedAt) throw new RuleError("La actividad fue convertida en ticket.");
      if (activity.archivedAt) throw new RuleError("Restaura la actividad antes de completarla.");
      projectId = activity.projectId ?? 0;
      const [openBlockers] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(workItemDependencies)
        .innerJoin(workItems, eq(workItems.id, workItemDependencies.blockerWorkItemId))
        .where(
          and(
            eq(workItemDependencies.blockedWorkItemId, item.id),
            inArray(workItems.status, [...OPEN_ACTIVITY_STATUSES]),
          ),
        );
      if (openBlockers.n > 0 && !data.confirmBlocked) {
        throw new RuleError(
          `Esta actividad está bloqueada por ${openBlockers.n} dependencia(s) abierta(s) — confirma para completarla de todas formas.`,
        );
      }
      await updateWorkItemFields(tx, user, item.id, {
        status: "completed",
        completedAt: new Date(),
      });
      if (openBlockers.n > 0) {
        await recordAudit(tx, {
          organizationId: user.organizationId,
          userId: Number(user.id),
          entityType: "work_item",
          entityId: item.id,
          action: "update",
          metadata: { event: "completed_while_blocked", openBlockers: openBlockers.n, projectId },
        });
      }
    });
  } catch (err) {
    return fail(err);
  }
  refresh(projectId || undefined);
  return success("Actividad completada.");
}

/* =============================================================== dependencies */

export async function addDependency(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(
    z.object({
      blockedActivityId: z.coerce.number().int().positive(),
      blockerActivityId: z.coerce
        .number("Selecciona la actividad que bloquea.")
        .int()
        .positive("Selecciona la actividad que bloquea."),
    }),
    formData,
  );
  if (error) return error;
  let projectId = 0;
  try {
    await db.transaction(async (tx) => {
      const blocked = await loadProjectActivity(tx, user, data.blockedActivityId);
      const blocker = await loadProjectActivity(tx, user, data.blockerActivityId);
      projectId = blocked.activity.projectId ?? 0;
      if (blocked.item.id === blocker.item.id) {
        throw new RuleError("Una actividad no puede depender de sí misma.");
      }
      const edges = await tx
        .select({
          from: workItemDependencies.blockerWorkItemId,
          to: workItemDependencies.blockedWorkItemId,
        })
        .from(workItemDependencies)
        .where(eq(workItemDependencies.organizationId, user.organizationId));
      if (
        wouldCreateDependencyCycle(
          edges.map((e) => [e.from, e.to] as [number, number]),
          blocker.item.id,
          blocked.item.id,
        )
      ) {
        throw new RuleError("Esa dependencia crearía un ciclo.");
      }
      const [dep] = await tx
        .insert(workItemDependencies)
        .values({
          organizationId: user.organizationId,
          blockerWorkItemId: blocker.item.id,
          blockedWorkItemId: blocked.item.id,
          createdById: Number(user.id),
        })
        .onConflictDoNothing()
        .returning({ id: workItemDependencies.id });
      if (!dep) throw new RuleError("Esa dependencia ya existe.");
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "work_item_dependency",
        entityId: dep.id,
        action: "create",
        metadata: {
          projectId,
          blockerWorkItemId: blocker.item.id,
          blockedWorkItemId: blocked.item.id,
          blockerTitle: blocker.item.title,
          blockedTitle: blocked.item.title,
        },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(projectId || undefined);
  return success("Dependencia agregada.");
}

export async function removeDependency(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const [dep] = await tx
        .select()
        .from(workItemDependencies)
        .where(
          and(
            eq(workItemDependencies.id, data.id),
            eq(workItemDependencies.organizationId, user.organizationId),
          ),
        );
      if (!dep) throw new NotFoundError();
      await tx.delete(workItemDependencies).where(eq(workItemDependencies.id, dep.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "work_item_dependency",
        entityId: dep.id,
        action: "delete",
        metadata: {
          blockerWorkItemId: dep.blockerWorkItemId,
          blockedWorkItemId: dep.blockedWorkItemId,
        },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh();
  return success("Dependencia eliminada.");
}

/* ================================================================= milestones */

const milestoneSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  name: z.string("Nombre requerido.").trim().min(1, "Nombre requerido."),
  description: optionalText,
  targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha objetivo requerida."),
  ownerId: optionalId,
});

async function loadMilestone(tx: DbExecutor, user: SessionUser, id: number) {
  const [row] = await tx
    .select()
    .from(projectMilestones)
    .where(
      and(eq(projectMilestones.id, id), eq(projectMilestones.organizationId, user.organizationId)),
    );
  if (!row) throw new NotFoundError();
  return row;
}

export async function createMilestone(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole(...MGMT_ROLES);
  const { data, error } = parseForm(milestoneSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const project = await loadProject(tx, user, data.projectId);
      assertOperational(project);
      const [milestone] = await tx
        .insert(projectMilestones)
        .values({
          organizationId: user.organizationId,
          projectId: project.id,
          name: data.name,
          description: data.description,
          targetDate: data.targetDate,
          ownerId: await orgUserId(tx, user.organizationId, data.ownerId),
        })
        .returning({ id: projectMilestones.id });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "project_milestone",
        entityId: milestone.id,
        action: "create",
        metadata: { projectId: project.id, name: data.name, targetDate: data.targetDate },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.projectId);
  return success("Hito creado.");
}

const MILESTONE_AUDITED = ["name", "description", "targetDate", "ownerId", "status"] as const;

export async function updateMilestone(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole(...MGMT_ROLES);
  const { data, error } = parseForm(
    milestoneSchema.extend(idSchema.shape).extend({ status: milestoneStatusSchema }),
    formData,
  );
  if (error) return error;
  let projectId = 0;
  try {
    await db.transaction(async (tx) => {
      const before = await loadMilestone(tx, user, data.id);
      const project = await loadProject(tx, user, before.projectId);
      assertOperational(project);
      projectId = project.id;
      const patch = {
        ...data,
        id: undefined,
        projectId: undefined,
        ownerId: await orgUserId(tx, user.organizationId, data.ownerId),
      };
      const changes = diffFields(
        {
          organizationId: user.organizationId,
          userId: Number(user.id),
          entityType: "project_milestone",
          entityId: before.id,
        },
        before,
        patch,
        MILESTONE_AUDITED,
      );
      if (changes.length === 0) return;
      await tx
        .update(projectMilestones)
        .set({
          ...patch,
          completedAt: data.status === "completed" ? (before.completedAt ?? new Date()) : null,
          updatedAt: new Date(),
        })
        .where(eq(projectMilestones.id, before.id));
      await recordAudit(
        tx,
        changes.map((c) => ({ ...c, metadata: { projectId: before.projectId } })),
      );
    });
  } catch (err) {
    return fail(err);
  }
  refresh(projectId);
  return success("Hito actualizado.");
}

export async function toggleMilestoneComplete(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole(...MGMT_ROLES);
  const { data, error } = parseForm(idSchema, formData);
  if (error) return error;
  let projectId = 0;
  try {
    await db.transaction(async (tx) => {
      const before = await loadMilestone(tx, user, data.id);
      const project = await loadProject(tx, user, before.projectId);
      assertOperational(project);
      projectId = project.id;
      const completing = before.status !== "completed";
      await tx
        .update(projectMilestones)
        .set({
          status: completing ? "completed" : "pending",
          completedAt: completing ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(projectMilestones.id, before.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "project_milestone",
        entityId: before.id,
        action: "update",
        field: "status",
        oldValue: before.status,
        newValue: completing ? "completed" : "pending",
        metadata: { projectId, event: completing ? "milestone_completed" : "milestone_reopened" },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(projectId);
  return success("Hito actualizado.");
}

export async function linkMilestoneActivity(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole(...MGMT_ROLES);
  const { data, error } = parseForm(
    z.object({
      milestoneId: z.coerce.number().int().positive(),
      activityId: z.coerce.number().int().positive("Selecciona una actividad."),
      unlink: z.preprocess((v) => v === "on" || v === "true", z.boolean()).default(false),
    }),
    formData,
  );
  if (error) return error;
  let projectId = 0;
  try {
    await db.transaction(async (tx) => {
      const milestone = await loadMilestone(tx, user, data.milestoneId);
      const project = await loadProject(tx, user, milestone.projectId);
      assertOperational(project);
      projectId = project.id;
      const { activity } = await loadProjectActivity(tx, user, data.activityId);
      if (activity.projectId !== milestone.projectId) {
        throw new RuleError("La actividad pertenece a otro proyecto.");
      }
      if (data.unlink) {
        await tx
          .delete(milestoneActivities)
          .where(
            and(
              eq(milestoneActivities.milestoneId, milestone.id),
              eq(milestoneActivities.activityId, activity.id),
            ),
          );
      } else {
        const [link] = await tx
          .insert(milestoneActivities)
          .values({
            organizationId: user.organizationId,
            milestoneId: milestone.id,
            activityId: activity.id,
          })
          .onConflictDoNothing()
          .returning({ id: milestoneActivities.id });
        if (!link) throw new RuleError("Esa actividad ya está vinculada al hito.");
      }
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "project_milestone",
        entityId: milestone.id,
        action: "update",
        metadata: {
          projectId,
          event: data.unlink ? "activity_unlinked" : "activity_linked",
          activityId: activity.id,
        },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(projectId);
  return success(data.unlink ? "Actividad desvinculada del hito." : "Actividad vinculada al hito.");
}

/* ====================================================================== risks */

const riskSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  title: z.string("Título requerido.").trim().min(1, "Título requerido."),
  description: optionalText,
  probability: riskProbabilitySchema.default("medium"),
  impact: riskImpactSchema.default("medium"),
  ownerId: optionalId,
  mitigationPlan: optionalText,
  dueDate: optionalDate,
});

/** Any internal role can report a risk (spec §25 technician: "reportar riesgos"). */
export async function createRisk(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(riskSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const project = await loadProject(tx, user, data.projectId);
      assertOperational(project);
      const [risk] = await tx
        .insert(projectRisks)
        .values({
          organizationId: user.organizationId,
          projectId: project.id,
          title: data.title,
          description: data.description,
          probability: data.probability,
          impact: data.impact,
          ownerId: await orgUserId(tx, user.organizationId, data.ownerId),
          mitigationPlan: data.mitigationPlan,
          dueDate: data.dueDate,
          createdById: Number(user.id),
        })
        .returning({ id: projectRisks.id });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "project_risk",
        entityId: risk.id,
        action: "create",
        metadata: {
          projectId: project.id,
          title: data.title,
          severity: riskSeverity(data.probability, data.impact),
        },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.projectId);
  return success("Riesgo registrado.");
}

const RISK_AUDITED = [
  "title", "description", "probability", "impact", "status", "ownerId", "mitigationPlan", "dueDate",
] as const;

export async function updateRisk(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireRole(...MGMT_ROLES);
  const { data, error } = parseForm(
    riskSchema.extend(idSchema.shape).extend({ status: riskStatusSchema }),
    formData,
  );
  if (error) return error;
  let projectId = 0;
  try {
    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(projectRisks)
        .where(and(eq(projectRisks.id, data.id), eq(projectRisks.organizationId, user.organizationId)));
      if (!before) throw new NotFoundError();
      const project = await loadProject(tx, user, before.projectId);
      assertOperational(project);
      projectId = project.id;
      const patch = {
        ...data,
        id: undefined,
        projectId: undefined,
        ownerId: await orgUserId(tx, user.organizationId, data.ownerId),
      };
      const changes = diffFields(
        {
          organizationId: user.organizationId,
          userId: Number(user.id),
          entityType: "project_risk",
          entityId: before.id,
        },
        before,
        patch,
        RISK_AUDITED,
      );
      if (changes.length === 0) return;
      const closing = ["mitigated", "closed"].includes(data.status);
      await tx
        .update(projectRisks)
        .set({
          ...patch,
          resolvedAt: closing ? (before.resolvedAt ?? new Date()) : null,
          updatedAt: new Date(),
        })
        .where(eq(projectRisks.id, before.id));
      await recordAudit(
        tx,
        changes.map((c) => ({ ...c, metadata: { projectId: before.projectId } })),
      );
    });
  } catch (err) {
    return fail(err);
  }
  refresh(projectId);
  return success("Riesgo actualizado.");
}

/* ================================================================== comments */

const commentSchema = z.object({
  projectId: z.coerce.number().int().positive(),
  body: z.string("Escribe el comentario.").trim().min(1, "Escribe el comentario."),
});

export async function addProjectComment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(commentSchema, formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const project = await loadProject(tx, user, data.projectId);
      assertOperational(project);
      const [comment] = await tx
        .insert(projectComments)
        .values({
          organizationId: user.organizationId,
          projectId: project.id,
          authorId: Number(user.id),
          body: data.body,
        })
        .returning({ id: projectComments.id });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "project_comment",
        entityId: comment.id,
        action: "create",
        metadata: { projectId: project.id },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.projectId);
  return success("Comentario agregado.");
}

export async function editOwnProjectComment(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const { data, error } = parseForm(commentSchema.extend(idSchema.shape), formData);
  if (error) return error;
  try {
    await db.transaction(async (tx) => {
      const [comment] = await tx
        .select()
        .from(projectComments)
        .where(
          and(eq(projectComments.id, data.id), eq(projectComments.organizationId, user.organizationId)),
        );
      if (!comment) throw new NotFoundError();
      if (comment.authorId !== Number(user.id)) {
        throw new RuleError("Solo el autor puede editar su comentario.");
      }
      await tx
        .update(projectComments)
        .set({ body: data.body, editedAt: new Date() })
        .where(eq(projectComments.id, comment.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "project_comment",
        entityId: comment.id,
        action: "update",
        field: "body",
        oldValue: comment.body,
        newValue: data.body,
        metadata: { projectId: comment.projectId, event: "comment_edited" },
      });
    });
  } catch (err) {
    return fail(err);
  }
  refresh(data.projectId);
  return success("Comentario actualizado.");
}

/* ===================================================================== files */

export async function uploadProjectFile(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await requireUser();
  const parsed = idSchema.safeParse({ id: formData.get("projectId") });
  const file = formData.get("file");
  if (!parsed.success || !(file instanceof File) || file.size === 0) {
    return {
      ok: false,
      kind: "validation",
      message: "Selecciona un archivo.",
      fieldErrors: { file: ["Selecciona un archivo."] },
    };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return businessError("Archivos mayores a 15 MB no están soportados todavía.");
  }
  const storageKey = newStorageKey();
  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await db.transaction(async (tx) => {
      const project = await loadProject(tx, user, parsed.data.id);
      assertOperational(project);
      const [attachment] = await tx
        .insert(attachments)
        .values({
          organizationId: user.organizationId,
          projectId: project.id,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          size: file.size,
          storageKey,
          uploadedById: Number(user.id),
        })
        .returning({ id: attachments.id });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "attachment",
        entityId: attachment.id,
        action: "create",
        metadata: { projectId: project.id, filename: file.name, size: file.size },
      });
      // write the blob last: if it fails, metadata and audit roll back with it
      await saveAttachment(storageKey, buffer);
    });
  } catch (err) {
    await deleteAttachmentBlob(storageKey);
    return fail(err);
  }
  refresh(parsed.data.id);
  return success("Archivo adjuntado.");
}
