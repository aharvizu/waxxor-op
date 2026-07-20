"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { type ActionState, businessError, parseForm, success, unexpectedError } from "@/lib/action-result";
import { requireUser } from "@/lib/session";
import {
  createView,
  deleteView,
  duplicateView,
  renameView,
  reorderViews,
  setDefaultView,
  setViewScope,
  toggleFavoriteView,
  toggleItemFavorite,
  transferViewOwner,
  updateViewConfig,
  CONFIG_MODULES,
  VIEW_SCOPES,
  VIEW_TYPES,
} from "@/lib/views";

/**
 * Shared Views Engine actions (consolidated 2026-07-22). Every mutation
 * here is module-agnostic — `module` and the revalidated `path` both arrive
 * from the form (hidden inputs set by the components in this same
 * directory), so one action set serves every module wired to the engine.
 * RBAC (scope + ownership) is enforced inside src/lib/views.ts, the single
 * source of truth — this layer only authenticates the caller and forwards
 * their role, it never re-derives a permission decision itself.
 */

function fail(err: unknown): ActionState {
  if (err instanceof Error) return businessError(err.message);
  return unexpectedError(err);
}

const moduleSchema = z.enum(CONFIG_MODULES as [string, ...string[]]);
const scopeSchema = z.enum(VIEW_SCOPES as [string, ...string[]]);
const idSchema = z.object({ id: z.coerce.number().int().positive(), path: z.string().trim().min(1) });

const createViewSchema = z.object({
  module: moduleSchema,
  path: z.string().trim().min(1),
  name: z.string().trim().min(1, "Nombre requerido."),
  viewType: z.enum(VIEW_TYPES as [string, ...string[]]),
  scope: scopeSchema.default("personal"),
});

export async function createSharedView(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const { data, error } = parseForm(createViewSchema, formData);
    if (error) return error;
    await createView(user.organizationId, Number(user.id), user.role, {
      module: data.module as (typeof CONFIG_MODULES)[number],
      name: data.name,
      viewType: data.viewType as (typeof VIEW_TYPES)[number],
      scope: data.scope as (typeof VIEW_SCOPES)[number],
    });
    revalidatePath(data.path);
    return success("Vista creada.");
  } catch (err) {
    return fail(err);
  }
}

const duplicateSchema = z.object({
  id: z.coerce.number().int().positive(),
  path: z.string().trim().min(1),
  name: z.string().trim().optional(),
  config: z.string().optional(),
});

/** Powers both "Duplicar" (no name/config override) and every "Guardar como
 * nueva vista personal" exit of the save-state machine (name + live config). */
export async function duplicateSharedView(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const { data, error } = parseForm(duplicateSchema, formData);
    if (error) return error;
    await duplicateView(user.organizationId, Number(user.id), data.id, {
      name: data.name,
      configOverride: data.config ? JSON.parse(data.config) : undefined,
    });
    revalidatePath(data.path);
    return success("Vista creada.");
  } catch (err) {
    return fail(err);
  }
}

const renameSchema = z.object({ id: z.coerce.number().int().positive(), name: z.string().trim().min(1), path: z.string().trim().min(1) });
export async function renameSharedView(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const { data, error } = parseForm(renameSchema, formData);
    if (error) return error;
    await renameView(user.organizationId, Number(user.id), user.role, data.id, data.name);
    revalidatePath(data.path);
    return success("Vista renombrada.");
  } catch (err) {
    return fail(err);
  }
}

const updateConfigSchema = z.object({ id: z.coerce.number().int().positive(), config: z.string(), path: z.string().trim().min(1) });
export async function updateSharedViewConfig(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const { data, error } = parseForm(updateConfigSchema, formData);
    if (error) return error;
    const parsedConfig = JSON.parse(data.config);
    await updateViewConfig(user.organizationId, Number(user.id), user.role, data.id, parsedConfig);
    revalidatePath(data.path);
    return success("Vista guardada.");
  } catch (err) {
    return fail(err);
  }
}

export async function toggleSharedViewFavorite(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const { data, error } = parseForm(idSchema, formData);
    if (error) return error;
    await toggleFavoriteView(user.organizationId, Number(user.id), data.id);
    revalidatePath(data.path);
    return success();
  } catch (err) {
    return fail(err);
  }
}

const shareSchema = z.object({ id: z.coerce.number().int().positive(), scope: scopeSchema, path: z.string().trim().min(1) });
export async function setSharedViewScope(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const { data, error } = parseForm(shareSchema, formData);
    if (error) return error;
    await setViewScope(user.organizationId, Number(user.id), user.role, data.id, data.scope as (typeof VIEW_SCOPES)[number]);
    revalidatePath(data.path);
    return success("Vista compartida.");
  } catch (err) {
    return fail(err);
  }
}

const transferSchema = z.object({ id: z.coerce.number().int().positive(), newOwnerId: z.coerce.number().int().positive(), path: z.string().trim().min(1) });
export async function transferSharedViewOwner(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const { data, error } = parseForm(transferSchema, formData);
    if (error) return error;
    await transferViewOwner(user.organizationId, Number(user.id), user.role, data.id, data.newOwnerId);
    revalidatePath(data.path);
    return success("Propietario actualizado.");
  } catch (err) {
    return fail(err);
  }
}

export async function setDefaultSharedView(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const { data, error } = parseForm(idSchema, formData);
    if (error) return error;
    await setDefaultView(user.organizationId, Number(user.id), data.id);
    revalidatePath(data.path);
    return success();
  } catch (err) {
    return fail(err);
  }
}

const reorderSchema = z.object({ module: moduleSchema, orderedIds: z.string(), path: z.string().trim().min(1) });
export async function reorderSharedViews(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const { data, error } = parseForm(reorderSchema, formData);
    if (error) return error;
    const ids = data.orderedIds.split(",").map(Number).filter((n) => Number.isInteger(n));
    await reorderViews(user.organizationId, Number(user.id), data.module as (typeof CONFIG_MODULES)[number], ids);
    revalidatePath(data.path);
    return success();
  } catch (err) {
    return fail(err);
  }
}

export async function deleteSharedView(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const { data, error } = parseForm(idSchema, formData);
    if (error) return error;
    await deleteView(user.organizationId, Number(user.id), user.role, data.id);
    revalidatePath(data.path);
    return success("Vista eliminada.");
  } catch (err) {
    return fail(err);
  }
}

/* ------------------------------------------------------------- favorites */

const favoriteSchema = z.object({ module: moduleSchema, entityId: z.coerce.number().int().positive(), path: z.string().trim().min(1) });
export async function toggleSharedItemFavorite(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const { data, error } = parseForm(favoriteSchema, formData);
    if (error) return error;
    await toggleItemFavorite(user.organizationId, Number(user.id), data.module as (typeof CONFIG_MODULES)[number], data.entityId);
    revalidatePath(data.path);
    return success();
  } catch (err) {
    return fail(err);
  }
}
