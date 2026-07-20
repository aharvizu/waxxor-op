"use server";

import bcrypt from "bcryptjs";
import { and, eq, ne, notInArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db, type DbExecutor } from "@/db";
import {
  apiKeys,
  catalogItems,
  companies,
  organizationSettings,
  organizations,
  projects,
  recurrenceDefinitions,
  reports,
  users,
  workItems,
} from "@/db/schema";
import {
  type ActionState,
  businessError,
  parseForm,
  success,
  unexpectedError,
} from "@/lib/action-result";
import { recordAudit } from "@/lib/audit";
import { isBadgeTone } from "@/lib/catalog-styles";
import { normalizeRole } from "@/lib/roles";
import { requireRole, type SessionUser } from "@/lib/session";
import {
  CATALOG_KINDS,
  LOGO_MAX_CHARS,
  SETTINGS_SCHEMAS,
  type SettingsKey,
  generateApiKey,
  generateInvitationToken,
  isCatalogKind,
  projectTemplateConfigSchema,
} from "@/lib/settings";

/** Business settings: superadmin + administrator. Technical sections: superadmin only. */
const SETTINGS_ROLES = ["superadmin", "administrator"] as const;

class RuleError extends Error {}

function fail(err: unknown): ActionState {
  if (err instanceof RuleError) return businessError(err.message);
  return unexpectedError(err);
}

function refresh() {
  revalidatePath("/settings", "layout");
}

/* ------------------------------------------------------------------ */
/* Organization settings (KV sections)                                 */
/* ------------------------------------------------------------------ */

const settingsKeySchema = z.enum(Object.keys(SETTINGS_SCHEMAS) as [SettingsKey, ...SettingsKey[]]);

/** Reads an optional uploaded logo file into a bounded data URI. */
async function fileToDataUri(file: unknown): Promise<string | null> {
  if (!(file instanceof File) || file.size === 0) return null;
  if (!["image/png", "image/jpeg", "image/svg+xml", "image/webp"].includes(file.type)) {
    throw new RuleError("El logo debe ser PNG, JPEG, SVG o WebP.");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const uri = `data:${file.type};base64,${bytes.toString("base64")}`;
  if (uri.length > LOGO_MAX_CHARS) throw new RuleError("El logo excede el tamaño máximo (~150 KB).");
  return uri;
}

export async function saveOrganizationSetting(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireRole(...SETTINGS_ROLES);
    const keyParsed = settingsKeySchema.safeParse(formData.get("settingKey"));
    if (!keyParsed.success) return businessError("Sección de configuración desconocida.");
    const key = keyParsed.data;

    // Logo uploads arrive as files; merge them into the payload as data URIs.
    const logoFile = formData.get("logoFile");
    const clearLogo = formData.get("clearLogo") === "on";
    formData.delete("logoFile");
    const uploaded = await fileToDataUri(logoFile);

    const existing = await currentSetting(user.organizationId, key);
    if (!clearLogo && !uploaded && existing && typeof existing === "object" && "logo" in existing) {
      // keep the stored logo unless replaced or explicitly cleared
      const kept = (existing as { logo?: string }).logo;
      if (kept) formData.set("logo", kept);
    }
    if (uploaded) formData.set("logo", uploaded);
    if (clearLogo) formData.delete("logo");

    const { data, error } = parseForm(SETTINGS_SCHEMAS[key], formData);
    if (error) return error;

    // Foreign ids inside settings payloads are re-validated within the org.
    if (key === "companies.defaults") {
      const d = data as { defaultAccountOwnerId?: number | null; defaultTechnicianId?: number | null };
      for (const id of [d.defaultAccountOwnerId, d.defaultTechnicianId]) {
        if (id != null) {
          const [u] = await db
            .select({ id: users.id })
            .from(users)
            .where(
              and(eq(users.id, id), eq(users.organizationId, user.organizationId), ne(users.role, "client")),
            );
          if (!u) return businessError("El usuario por defecto no existe en esta organización.");
        }
      }
    }

    await db.transaction(async (tx) => {
      const [before] = await tx
        .select()
        .from(organizationSettings)
        .where(
          and(
            eq(organizationSettings.organizationId, user.organizationId),
            eq(organizationSettings.key, key),
          ),
        );
      await tx
        .insert(organizationSettings)
        .values({
          organizationId: user.organizationId,
          key,
          value: data,
          updatedById: Number(user.id),
        })
        .onConflictDoUpdate({
          target: [organizationSettings.organizationId, organizationSettings.key],
          set: { value: data, updatedById: Number(user.id), updatedAt: new Date() },
        });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "organization_setting",
        entityId: before?.id ?? 0,
        action: before ? "update" : "create",
        field: key,
        oldValue: before ? JSON.stringify(redactLogos(before.value)) : null,
        newValue: JSON.stringify(redactLogos(data)),
        metadata: { event: "setting_saved", key },
      });
    });

    // Display name also updates the org row so the shell shows it everywhere.
    if (key === "organization.profile") {
      const displayName = (data as { displayName?: string }).displayName;
      if (displayName) {
        await db
          .update(organizations)
          .set({ name: displayName, updatedAt: new Date() })
          .where(eq(organizations.id, user.organizationId));
      }
    }

    refresh();
    return success("Configuración guardada.");
  } catch (err) {
    return fail(err);
  }
}

async function currentSetting(orgId: number, key: SettingsKey): Promise<unknown> {
  const [row] = await db
    .select({ value: organizationSettings.value })
    .from(organizationSettings)
    .where(and(eq(organizationSettings.organizationId, orgId), eq(organizationSettings.key, key)));
  return row?.value ?? null;
}

/** Data-URI logos are huge; audit their presence, not their bytes. */
function redactLogos(value: unknown): unknown {
  if (value && typeof value === "object" && "logo" in value) {
    const v = value as Record<string, unknown>;
    return { ...v, logo: v.logo ? "[imagen]" : null };
  }
  return value;
}

/* ------------------------------------------------------------------ */
/* Catalogs                                                            */
/* ------------------------------------------------------------------ */

const catalogItemSchema = z.object({
  kind: z.string().refine(isCatalogKind, "Catálogo desconocido."),
  name: z.string().trim().min(1, "Nombre requerido.").max(120),
  parentId: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().int().positive().nullable(),
  ),
  // Hex for freeform catalogs (ticket_category etc.); one of the 7 Badge
  // tone names for *_style kinds (see src/lib/catalog-styles.ts) — same
  // column, different meaning per kind, both validated here.
  color: z.preprocess(
    (v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v),
    z
      .string()
      .refine((v) => /^#[0-9a-fA-F]{6}$/.test(v) || isBadgeTone(v), "Color inválido.")
      .nullable(),
  ),
  description: z.preprocess(
    (v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v),
    z.string().trim().max(300).nullable(),
  ),
  templateLists: z.string().optional(),
  // *_style kinds only: lucide icon name + a custom display label (the
  // enum's raw value stays in `name`, unchanged — see EnumStyleManager).
  icon: z.string().trim().max(60).optional(),
  styleLabel: z.string().trim().max(120).optional(),
});

const STYLE_KINDS = ["ticket_status_style", "ticket_priority_style", "ticket_billing_status_style"];

function parseTemplateConfig(
  kind: string,
  templateLists: string | undefined,
  style?: { icon?: string; styleLabel?: string },
) {
  if (STYLE_KINDS.includes(kind)) {
    if (!style?.icon && !style?.styleLabel) return null;
    return { icon: style.icon || undefined, label: style.styleLabel || undefined };
  }
  if (kind !== "project_template") return null;
  const lists = (templateLists ?? "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  const parsed = projectTemplateConfigSchema.safeParse({ lists });
  if (!parsed.success) throw new RuleError("La plantilla necesita al menos una lista (una por línea).");
  return parsed.data;
}

async function loadCatalogItem(tx: DbExecutor, user: SessionUser, id: number) {
  const [row] = await tx
    .select()
    .from(catalogItems)
    .where(and(eq(catalogItems.id, id), eq(catalogItems.organizationId, user.organizationId)));
  if (!row) throw new RuleError("El elemento ya no existe.");
  return row;
}

export async function createCatalogItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireRole(...SETTINGS_ROLES);
    const { data, error } = parseForm(catalogItemSchema, formData);
    if (error) return error;
    const kindMeta = CATALOG_KINDS[data.kind as keyof typeof CATALOG_KINDS];
    if (data.parentId && !kindMeta.hasChildren) {
      return businessError("Este catálogo no admite subelementos.");
    }
    const config = parseTemplateConfig(data.kind, data.templateLists, { icon: data.icon, styleLabel: data.styleLabel });

    await db.transaction(async (tx) => {
      if (data.parentId) {
        const parent = await loadCatalogItem(tx, user, data.parentId);
        if (parent.kind !== data.kind || parent.parentId !== null) {
          throw new RuleError("Elemento padre inválido.");
        }
      }
      const [max] = await tx
        .select({ max: sql<number>`coalesce(max(${catalogItems.sortOrder}), 0)` })
        .from(catalogItems)
        .where(
          and(
            eq(catalogItems.organizationId, user.organizationId),
            eq(catalogItems.kind, data.kind),
          ),
        );
      const [created] = await tx
        .insert(catalogItems)
        .values({
          organizationId: user.organizationId,
          kind: data.kind,
          name: data.name,
          parentId: data.parentId,
          color: data.color,
          description: data.description,
          config,
          sortOrder: Number(max?.max ?? 0) + 1,
          createdById: Number(user.id),
        })
        .returning({ id: catalogItems.id });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "catalog_item",
        entityId: created.id,
        action: "create",
        metadata: { values: { kind: data.kind, name: data.name, parentId: data.parentId, config } },
      });
    });
    refresh();
    return success("Elemento agregado.");
  } catch (err) {
    if (err instanceof Error && err.message.includes("catalog_items_unique_idx")) {
      return businessError("Ya existe un elemento con ese nombre en este catálogo.");
    }
    return fail(err);
  }
}

const catalogUpdateSchema = catalogItemSchema.omit({ kind: true, parentId: true }).extend({
  id: z.coerce.number().int().positive(),
});

export async function updateCatalogItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireRole(...SETTINGS_ROLES);
    const { data, error } = parseForm(catalogUpdateSchema, formData);
    if (error) return error;

    await db.transaction(async (tx) => {
      const before = await loadCatalogItem(tx, user, data.id);
      const config = parseTemplateConfig(before.kind, data.templateLists, { icon: data.icon, styleLabel: data.styleLabel }) ?? before.config;
      await tx
        .update(catalogItems)
        .set({
          name: data.name,
          color: data.color,
          description: data.description,
          config,
          updatedAt: new Date(),
        })
        .where(eq(catalogItems.id, data.id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "catalog_item",
        entityId: data.id,
        action: "update",
        field: "name",
        oldValue: before.name,
        newValue: data.name,
        metadata: { event: "catalog_item_updated", kind: before.kind },
      });
    });
    refresh();
    return success("Elemento actualizado.");
  } catch (err) {
    if (err instanceof Error && err.message.includes("catalog_items_unique_idx")) {
      return businessError("Ya existe un elemento con ese nombre en este catálogo.");
    }
    return fail(err);
  }
}

export async function toggleCatalogItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireRole(...SETTINGS_ROLES);
    const id = z.coerce.number().int().positive().parse(formData.get("id"));
    await db.transaction(async (tx) => {
      const before = await loadCatalogItem(tx, user, id);
      const next = !before.isActive;
      await tx
        .update(catalogItems)
        .set({ isActive: next, updatedAt: new Date() })
        .where(eq(catalogItems.id, id));
      if (before.parentId === null && !next) {
        // archiving a category archives its subcategories with it
        await tx
          .update(catalogItems)
          .set({ isActive: false, updatedAt: new Date() })
          .where(
            and(
              eq(catalogItems.organizationId, user.organizationId),
              eq(catalogItems.parentId, id),
            ),
          );
      }
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "catalog_item",
        entityId: id,
        action: "update",
        field: "isActive",
        oldValue: String(before.isActive),
        newValue: String(next),
        metadata: { event: next ? "catalog_item_restored" : "catalog_item_archived", kind: before.kind },
      });
    });
    refresh();
    return success();
  } catch (err) {
    return fail(err);
  }
}

export async function deleteCatalogItem(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireRole("superadmin");
    const id = z.coerce.number().int().positive().parse(formData.get("id"));
    await db.transaction(async (tx) => {
      const before = await loadCatalogItem(tx, user, id);
      const [child] = await tx
        .select({ id: catalogItems.id })
        .from(catalogItems)
        .where(and(eq(catalogItems.organizationId, user.organizationId), eq(catalogItems.parentId, id)));
      if (child) throw new RuleError("Archiva o elimina primero sus subelementos.");
      await tx.delete(catalogItems).where(eq(catalogItems.id, id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "catalog_item",
        entityId: id,
        action: "delete",
        metadata: { values: { kind: before.kind, name: before.name, parentId: before.parentId } },
      });
    });
    refresh();
    return success("Elemento eliminado.");
  } catch (err) {
    return fail(err);
  }
}

/* ------------------------------------------------------------------ */
/* API keys (preparation)                                              */
/* ------------------------------------------------------------------ */

export async function createApiKey(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireRole("superadmin");
    const name = z.string().trim().min(1, "Nombre requerido.").max(120).parse(formData.get("name"));
    const { token, prefix, tokenHash } = generateApiKey();
    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(apiKeys)
        .values({
          organizationId: user.organizationId,
          name,
          prefix,
          tokenHash,
          createdById: Number(user.id),
        })
        .returning({ id: apiKeys.id });
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "api_key",
        entityId: created.id,
        action: "create",
        metadata: { values: { name, prefix } }, // never the token or its hash
      });
    });
    refresh();
    // Shown exactly once — only the hash is stored.
    return success(`Clave creada. Cópiala ahora, no volverá a mostrarse: ${token}`);
  } catch (err) {
    return fail(err);
  }
}

export async function revokeApiKey(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const user = await requireRole("superadmin");
    const id = z.coerce.number().int().positive().parse(formData.get("id"));
    await db.transaction(async (tx) => {
      const [key] = await tx
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.id, id), eq(apiKeys.organizationId, user.organizationId)));
      if (!key) throw new RuleError("La clave ya no existe.");
      if (key.revokedAt) throw new RuleError("La clave ya estaba revocada.");
      await tx.update(apiKeys).set({ revokedAt: new Date() }).where(eq(apiKeys.id, id));
      await recordAudit(tx, {
        organizationId: user.organizationId,
        userId: Number(user.id),
        entityType: "api_key",
        entityId: id,
        action: "update",
        field: "revokedAt",
        oldValue: null,
        newValue: new Date().toISOString(),
        metadata: { event: "api_key_revoked", name: key.name },
      });
    });
    refresh();
    return success("Clave revocada.");
  } catch (err) {
    return fail(err);
  }
}

/* ------------------------------------------------------------------ */
/* Users: invitations, activation, reassignment                        */
/* ------------------------------------------------------------------ */

const inviteSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido.").max(150),
  email: z.string().trim().toLowerCase().email("Email inválido."),
  role: z.string(),
  title: z.preprocess(
    (v) => (v === undefined || (typeof v === "string" && v.trim() === "") ? null : v),
    z.string().trim().max(150).nullable(),
  ),
});

export async function inviteUser(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const me = await requireRole("superadmin");
    const { data, error } = parseForm(inviteSchema, formData);
    if (error) return error;
    const role = normalizeRole(data.role);

    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, data.email));
    if (existing) return businessError("Ese email ya está en uso.");

    const token = generateInvitationToken();
    // Unusable random hash until the invite is accepted — the account cannot sign in.
    const placeholderHash = await bcrypt.hash(generateInvitationToken(), 12);

    await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(users)
        .values({
          organizationId: me.organizationId,
          name: data.name,
          email: data.email,
          role,
          title: data.title,
          passwordHash: placeholderHash,
          invitationToken: token,
          invitedAt: new Date(),
        })
        .returning({ id: users.id });
      await recordAudit(tx, {
        organizationId: me.organizationId,
        userId: Number(me.id),
        entityType: "user",
        entityId: created.id,
        action: "create",
        metadata: { event: "user_invited", values: { name: data.name, email: data.email, role } },
      });
    });
    refresh();
    return success("Invitación creada. Comparte el enlace desde la tabla de usuarios.");
  } catch (err) {
    return fail(err);
  }
}

export async function regenerateInvitation(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  try {
    const me = await requireRole("superadmin");
    const id = z.coerce.number().int().positive().parse(formData.get("id"));
    await db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(users)
        .where(and(eq(users.id, id), eq(users.organizationId, me.organizationId)));
      if (!target) throw new RuleError("El usuario ya no existe.");
      if (!target.invitationToken) throw new RuleError("Este usuario ya aceptó su invitación.");
      await tx
        .update(users)
        .set({ invitationToken: generateInvitationToken(), invitedAt: new Date() })
        .where(eq(users.id, id));
      await recordAudit(tx, {
        organizationId: me.organizationId,
        userId: Number(me.id),
        entityType: "user",
        entityId: id,
        action: "update",
        metadata: { event: "invitation_regenerated" },
      });
    });
    refresh();
    return success("Enlace de invitación regenerado.");
  } catch (err) {
    return fail(err);
  }
}

/** Work-item statuses that count as open for reassignment purposes. */
const CLOSED_STATUSES = ["resolved", "closed", "completed", "cancelled", "archived"] as const;
const FINAL_PROJECT_STATUSES = ["completed", "cancelled", "archived"] as const;
const FINAL_REPORT_STATUSES = ["sent", "archived"] as const;

const activationSchema = z.object({
  id: z.coerce.number().int().positive(),
  activate: z.enum(["true", "false"]),
  reassignToId: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? null : Number(v)),
    z.number().int().positive().nullable(),
  ),
});

export async function setUserActive(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const me = await requireRole("superadmin");
    const { data, error } = parseForm(activationSchema, formData);
    if (error) return error;
    const activate = data.activate === "true";
    if (String(data.id) === me.id && !activate) {
      return businessError("No puedes desactivar tu propia cuenta.");
    }

    await db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(users)
        .where(and(eq(users.id, data.id), eq(users.organizationId, me.organizationId)));
      if (!target) throw new RuleError("El usuario ya no existe.");
      if (target.isActive === activate) throw new RuleError("El usuario ya está en ese estado.");

      let reassigned: Record<string, number> | null = null;
      if (!activate && data.reassignToId) {
        if (data.reassignToId === data.id) throw new RuleError("No puedes reasignar al mismo usuario.");
        const [dest] = await tx
          .select({ id: users.id, isActive: users.isActive, role: users.role })
          .from(users)
          .where(and(eq(users.id, data.reassignToId), eq(users.organizationId, me.organizationId)));
        if (!dest || !dest.isActive || dest.role === "client") {
          throw new RuleError("El destinatario de la reasignación debe ser un usuario interno activo.");
        }
        reassigned = await reassignOpenWork(tx, me.organizationId, data.id, data.reassignToId);
      }

      await tx.update(users).set({ isActive: activate }).where(eq(users.id, data.id));
      await recordAudit(tx, {
        organizationId: me.organizationId,
        userId: Number(me.id),
        entityType: "user",
        entityId: data.id,
        action: "update",
        field: "isActive",
        oldValue: String(target.isActive),
        newValue: String(activate),
        metadata: {
          event: activate ? "user_activated" : "user_deactivated",
          ...(reassigned ? { reassignedToUserId: data.reassignToId, reassigned } : {}),
        },
      });
    });
    refresh();
    return success(activate ? "Usuario activado." : "Usuario desactivado.");
  } catch (err) {
    return fail(err);
  }
}

/**
 * Moves the deactivated user's open responsibilities to another internal user.
 * Returns per-domain counts for the audit event.
 */
async function reassignOpenWork(
  tx: DbExecutor,
  orgId: number,
  fromId: number,
  toId: number,
): Promise<Record<string, number>> {
  const openItems = await tx
    .update(workItems)
    .set({ assigneeId: toId, updatedAt: new Date() })
    .where(
      and(
        eq(workItems.organizationId, orgId),
        eq(workItems.assigneeId, fromId),
        notInArray(workItems.status, [...CLOSED_STATUSES]),
      ),
    )
    .returning({ id: workItems.id });

  const pmProjects = await tx
    .update(projects)
    .set({ projectManagerId: toId, updatedAt: new Date() })
    .where(
      and(
        eq(projects.organizationId, orgId),
        eq(projects.projectManagerId, fromId),
        notInArray(projects.status, [...FINAL_PROJECT_STATUSES]),
      ),
    )
    .returning({ id: projects.id });

  const recDefs = await tx
    .update(recurrenceDefinitions)
    .set({ assigneeId: toId, updatedAt: new Date() })
    .where(
      and(
        eq(recurrenceDefinitions.organizationId, orgId),
        eq(recurrenceDefinitions.assigneeId, fromId),
        ne(recurrenceDefinitions.status, "archived"),
      ),
    )
    .returning({ id: recurrenceDefinitions.id });

  const openReports = await tx
    .update(reports)
    .set({ responsibleUserId: toId, updatedAt: new Date() })
    .where(
      and(
        eq(reports.organizationId, orgId),
        eq(reports.responsibleUserId, fromId),
        notInArray(reports.status, [...FINAL_REPORT_STATUSES]),
      ),
    )
    .returning({ id: reports.id });

  const ownerClients = await tx
    .update(companies)
    .set({ accountOwnerId: toId, updatedAt: new Date() })
    .where(and(eq(companies.organizationId, orgId), eq(companies.accountOwnerId, fromId)))
    .returning({ id: companies.id });

  const techClients = await tx
    .update(companies)
    .set({ defaultTechnicianId: toId, updatedAt: new Date() })
    .where(and(eq(companies.organizationId, orgId), eq(companies.defaultTechnicianId, fromId)))
    .returning({ id: companies.id });

  return {
    workItems: openItems.length,
    projects: pmProjects.length,
    recurrences: recDefs.length,
    reports: openReports.length,
    clientsAccountOwner: ownerClients.length,
    clientsDefaultTechnician: techClients.length,
  };
}
