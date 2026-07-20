"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { itemFavorites, tickets } from "@/db/schema";
import { type ActionState, businessError, parseForm, success, unexpectedError } from "@/lib/action-result";
import { requireUser } from "@/lib/session";
import {
  createView,
  deleteView,
  duplicateView,
  renameView,
  reorderViews,
  setDefaultView,
  toggleFavoriteView,
  toggleShareView,
  updateViewConfig,
  VIEW_TYPES,
} from "@/lib/views";

function fail(err: unknown): ActionState {
  if (err instanceof Error) return businessError(err.message);
  return unexpectedError(err);
}

function refresh() {
  revalidatePath("/helpdesk");
}

const MODULE = "tickets" as const;

const createViewSchema = z.object({
  name: z.string().trim().min(1, "Nombre requerido."),
  viewType: z.enum(VIEW_TYPES as [string, ...string[]]),
});

export async function createTicketView(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const { data, error } = parseForm(createViewSchema, formData);
    if (error) return error;
    await createView(user.organizationId, Number(user.id), {
      module: MODULE,
      name: data.name,
      viewType: data.viewType as (typeof VIEW_TYPES)[number],
    });
    refresh();
    return success("Vista creada.");
  } catch (err) {
    return fail(err);
  }
}

const idSchema = z.object({ id: z.coerce.number().int().positive() });

export async function duplicateTicketView(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const { data, error } = parseForm(idSchema, formData);
    if (error) return error;
    await duplicateView(user.organizationId, Number(user.id), data.id);
    refresh();
    return success("Vista duplicada.");
  } catch (err) {
    return fail(err);
  }
}

const renameSchema = z.object({ id: z.coerce.number().int().positive(), name: z.string().trim().min(1) });
export async function renameTicketView(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const { data, error } = parseForm(renameSchema, formData);
    if (error) return error;
    await renameView(user.organizationId, Number(user.id), data.id, data.name);
    refresh();
    return success("Vista renombrada.");
  } catch (err) {
    return fail(err);
  }
}

const updateConfigSchema = z.object({ id: z.coerce.number().int().positive(), config: z.string() });
export async function updateTicketViewConfig(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const { data, error } = parseForm(updateConfigSchema, formData);
    if (error) return error;
    const parsedConfig = JSON.parse(data.config);
    await updateViewConfig(user.organizationId, Number(user.id), data.id, parsedConfig);
    refresh();
    return success();
  } catch (err) {
    return fail(err);
  }
}

export async function toggleTicketViewFavorite(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const { data, error } = parseForm(idSchema, formData);
    if (error) return error;
    await toggleFavoriteView(user.organizationId, Number(user.id), data.id);
    refresh();
    return success();
  } catch (err) {
    return fail(err);
  }
}

export async function toggleTicketViewShare(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const { data, error } = parseForm(idSchema, formData);
    if (error) return error;
    await toggleShareView(user.organizationId, Number(user.id), data.id);
    refresh();
    return success();
  } catch (err) {
    return fail(err);
  }
}

export async function setDefaultTicketView(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const { data, error } = parseForm(idSchema, formData);
    if (error) return error;
    await setDefaultView(user.organizationId, Number(user.id), data.id);
    refresh();
    return success();
  } catch (err) {
    return fail(err);
  }
}

const reorderSchema = z.object({ orderedIds: z.string() });
export async function reorderTicketViews(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const { data, error } = parseForm(reorderSchema, formData);
    if (error) return error;
    const ids = data.orderedIds.split(",").map(Number).filter((n) => Number.isInteger(n));
    await reorderViews(user.organizationId, Number(user.id), MODULE, ids);
    refresh();
    return success();
  } catch (err) {
    return fail(err);
  }
}

export async function deleteTicketView(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const { data, error } = parseForm(idSchema, formData);
    if (error) return error;
    await deleteView(user.organizationId, Number(user.id), data.id);
    refresh();
    return success("Vista eliminada.");
  } catch (err) {
    return fail(err);
  }
}

/* ------------------------------------------------------------- favorites */

export async function toggleTicketFavorite(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const user = await requireUser();
    const { data, error } = parseForm(idSchema, formData);
    if (error) return error;
    const [ticket] = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(and(eq(tickets.id, data.id), eq(tickets.organizationId, user.organizationId)));
    if (!ticket) return businessError("El ticket ya no existe.");

    const [existing] = await db
      .select()
      .from(itemFavorites)
      .where(and(eq(itemFavorites.userId, Number(user.id)), eq(itemFavorites.module, MODULE), eq(itemFavorites.entityId, data.id)));
    if (existing) {
      await db.delete(itemFavorites).where(eq(itemFavorites.id, existing.id));
    } else {
      await db.insert(itemFavorites).values({
        organizationId: user.organizationId,
        userId: Number(user.id),
        module: MODULE,
        entityId: data.id,
      });
    }
    refresh();
    return success();
  } catch (err) {
    return fail(err);
  }
}
