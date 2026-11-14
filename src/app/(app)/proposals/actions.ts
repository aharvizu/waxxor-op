"use server";

import { and, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { assessments, companies, folioCounters, proposals } from "@/db/schema";
import { type ActionState, businessError, success, unexpectedError } from "@/lib/action-result";
import { recordAudit } from "@/lib/audit";
import { computeTotals } from "@/lib/proposals/calc";
import { buildDocument } from "@/lib/proposals/document";
import { canTransition, composeFolio, effectiveStatus, expiryDate } from "@/lib/proposals/lifecycle";
import type { ProposalInput, ProposalStatus } from "@/lib/proposals/types";
import { issueBlockers, validateProposalInput } from "@/lib/proposals/validation";
import { ORG_TIMEZONE } from "@/lib/reports";
import { requireUser } from "@/lib/session";

const SERIES = "WX";

/** Hoy en la zona de la organización, YYYY-MM-DD — el año del folio y la vigencia salen de aquí. */
function orgToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ORG_TIMEZONE }).format(new Date());
}

function toId(value: FormDataEntryValue | null): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function orgProposal(orgId: number, id: number | null) {
  if (id === null) return null;
  const [row] = await db.select().from(proposals).where(and(eq(proposals.id, id), eq(proposals.organizationId, orgId)));
  return row ?? null;
}

/** Columnas que dependen de la captura. Los totales SIEMPRE se recalculan aquí; lo que mostró el cliente nunca se persiste. */
function columnsFromInput(input: ProposalInput) {
  const totals = computeTotals(input.items, input.ivaBps, input.billingPeriod);
  return {
    companyId: input.companyId,
    clientName: input.clientName,
    preparedBy: input.preparedBy,
    date: input.date,
    validityDays: input.validityDays,
    productKey: input.productKey,
    planKey: input.planKey,
    billingPeriod: input.billingPeriod,
    items: input.items,
    note: input.note,
    ivaBps: input.ivaBps,
    subtotalOneTimeCents: totals.oneTime.subtotalCents,
    ivaOneTimeCents: totals.oneTime.ivaCents,
    totalOneTimeCents: totals.oneTime.totalCents,
    subtotalRecurringCents: totals.recurring.subtotalCents,
    ivaRecurringCents: totals.recurring.ivaCents,
    totalRecurringCents: totals.recurring.totalCents,
    expiresAt: expiryDate(input.date, input.validityDays),
  };
}

function inputFromRow(row: typeof proposals.$inferSelect): ProposalInput {
  return {
    companyId: row.companyId,
    clientName: row.clientName,
    preparedBy: row.preparedBy,
    date: row.date,
    validityDays: row.validityDays,
    productKey: row.productKey,
    planKey: row.planKey,
    billingPeriod: row.billingPeriod,
    items: row.items,
    note: row.note,
    ivaBps: row.ivaBps,
  };
}

/**
 * Crea o edita un borrador. El formulario manda la captura completa como JSON
 * en `payload` (las partidas son una lista anidada, no campos planos).
 * Solo un borrador se puede editar: lo emitido es inmutable.
 */
export async function saveProposal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const orgId = user.organizationId;
  const id = toId(formData.get("id"));
  const assessmentId = toId(formData.get("assessmentId"));

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get("payload") ?? ""));
  } catch {
    return businessError("No se pudo leer la propuesta. Recarga la página e inténtalo de nuevo.");
  }
  const result = validateProposalInput(raw);
  if (!result.ok) return businessError(result.errors.join(" "));
  const input = result.data;

  let savedId: number;
  try {
    savedId = await db.transaction(async (tx) => {
      if (input.companyId !== null) {
        const [company] = await tx
          .select({ id: companies.id })
          .from(companies)
          .where(and(eq(companies.id, input.companyId), eq(companies.organizationId, orgId)));
        if (!company) throw new BusinessRuleError("La empresa seleccionada no existe.");
      }
      const columns = columnsFromInput(input);

      if (id === null) {
        let linkedAssessment: number | null = null;
        if (assessmentId !== null) {
          const [a] = await tx
            .select({ id: assessments.id })
            .from(assessments)
            .where(and(eq(assessments.id, assessmentId), eq(assessments.organizationId, orgId)));
          linkedAssessment = a?.id ?? null;
        }
        const [created] = await tx
          .insert(proposals)
          .values({ ...columns, organizationId: orgId, series: SERIES, assessmentId: linkedAssessment, createdById: Number(user.id) })
          .returning({ id: proposals.id });
        await recordAudit(tx, {
          organizationId: orgId,
          userId: Number(user.id),
          entityType: "proposal",
          entityId: created.id,
          action: "create",
          metadata: { clientName: input.clientName, productKey: input.productKey, planKey: input.planKey },
        });
        return created.id;
      }

      const [existing] = await tx
        .select({ id: proposals.id, status: proposals.status })
        .from(proposals)
        .where(and(eq(proposals.id, id), eq(proposals.organizationId, orgId)));
      if (!existing) throw new BusinessRuleError("La propuesta no existe.");
      if (existing.status !== "draft") {
        throw new BusinessRuleError("Solo un borrador se puede editar. Para corregir una propuesta emitida, cancélala y clónala.");
      }
      await tx.update(proposals).set({ ...columns, updatedAt: new Date() }).where(eq(proposals.id, id));
      await recordAudit(tx, {
        organizationId: orgId,
        userId: Number(user.id),
        entityType: "proposal",
        entityId: id,
        action: "update",
        field: "draft",
        metadata: { totalOneTimeCents: columns.totalOneTimeCents, totalRecurringCents: columns.totalRecurringCents },
      });
      return id;
    });
  } catch (err) {
    if (err instanceof BusinessRuleError) return businessError(err.message);
    return unexpectedError(err);
  }

  revalidatePath("/proposals");
  redirect(`/proposals/${savedId}`);
}

class BusinessRuleError extends Error {}

/**
 * Emite: asigna folio, congela el snapshot y pasa a `issued`, todo en UNA
 * transacción (spec §5.3). El consecutivo sale de un INSERT … ON CONFLICT DO
 * UPDATE que Postgres serializa sobre la fila del contador: dos personas
 * emitiendo a la vez reciben folios distintos y consecutivos, y si algo falla
 * el ROLLBACK devuelve el número — no quedan huecos.
 *
 * La verificación de que el documento cabe en una hoja ocurre en el navegador
 * (la vista previa mide y bloquea este botón); el servidor no tiene Chromium
 * — el PDF es la impresión del navegador, igual que en Reportes. `fits` viaja
 * en el formulario y aquí solo se rechaza si la vista previa reportó desborde.
 */
export async function issueProposal(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const orgId = user.organizationId;
  const id = toId(formData.get("id"));
  if (formData.get("fits") !== "yes") {
    return businessError("El documento no cabe en una hoja. Acorta descripciones o reduce partidas antes de emitir.");
  }

  let folio: string;
  try {
    folio = await db.transaction(async (tx) => {
      // FOR UPDATE: un doble clic no emite dos veces la misma propuesta.
      const [row] = await tx
        .select()
        .from(proposals)
        .where(and(eq(proposals.id, id ?? 0), eq(proposals.organizationId, orgId)))
        .for("update");
      if (!row) throw new BusinessRuleError("La propuesta no existe.");
      if (row.status !== "draft") throw new BusinessRuleError("Esta propuesta ya fue emitida.");

      // Se revalida lo guardado: el catálogo pudo cambiar desde que se capturó.
      const check = validateProposalInput(inputFromRow(row));
      if (!check.ok) throw new BusinessRuleError(check.errors.join(" "));
      const blockers = issueBlockers(check.data);
      if (blockers.length > 0) throw new BusinessRuleError(blockers.join(" "));

      const today = orgToday();
      const year = Number(today.slice(0, 4));
      const [counter] = await tx
        .insert(folioCounters)
        .values({ organizationId: orgId, series: row.series, year, last: 1 })
        .onConflictDoUpdate({
          target: [folioCounters.organizationId, folioCounters.series, folioCounters.year],
          set: { last: sql`${folioCounters.last} + 1`, updatedAt: new Date() },
        })
        .returning({ last: folioCounters.last });
      const newFolio = composeFolio(row.series, year, counter.last);
      const issuedAt = new Date();

      const input = check.data;
      const snapshot = buildDocument(input, { folio: newFolio, issuedAt: issuedAt.toISOString() });

      await tx
        .update(proposals)
        .set({
          ...columnsFromInput(input),
          status: "issued",
          folio: newFolio,
          folioYear: year,
          sequence: counter.last,
          snapshot,
          issuedAt,
          updatedAt: issuedAt,
        })
        .where(eq(proposals.id, row.id));
      await recordAudit(tx, {
        organizationId: orgId,
        userId: Number(user.id),
        entityType: "proposal",
        entityId: row.id,
        action: "update",
        field: "status",
        oldValue: "draft",
        newValue: "issued",
        metadata: { folio: newFolio },
      });
      return newFolio;
    });
  } catch (err) {
    if (err instanceof BusinessRuleError) return businessError(err.message);
    return unexpectedError(err);
  }

  revalidatePath("/proposals");
  revalidatePath(`/proposals/${id}`);
  return success(`Propuesta emitida con folio ${folio}.`);
}

const STATUS_VERBS: Partial<Record<ProposalStatus, string>> = {
  accepted: "marcada como aceptada",
  rejected: "marcada como rechazada",
  cancelled: "cancelada",
};

/** Aceptar, rechazar o cancelar, validando el ciclo de vida. Un folio cancelado conserva su número y no se reutiliza. */
export async function changeProposalStatus(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser();
  const orgId = user.organizationId;
  const row = await orgProposal(orgId, toId(formData.get("id")));
  if (!row) return businessError("La propuesta no existe.");
  const to = String(formData.get("status")) as ProposalStatus;
  const from = effectiveStatus(row.status, row.expiresAt, orgToday());
  if (!STATUS_VERBS[to] || !canTransition(from, to)) {
    return businessError("Ese cambio de estado no está permitido para esta propuesta.");
  }
  try {
    await db.transaction(async (tx) => {
      await tx.update(proposals).set({ status: to, updatedAt: new Date() }).where(eq(proposals.id, row.id));
      await recordAudit(tx, {
        organizationId: orgId,
        userId: Number(user.id),
        entityType: "proposal",
        entityId: row.id,
        action: "update",
        field: "status",
        oldValue: from,
        newValue: to,
        metadata: { folio: row.folio },
      });
    });
  } catch (err) {
    return unexpectedError(err);
  }
  revalidatePath("/proposals");
  revalidatePath(`/proposals/${row.id}`);
  return success(`Propuesta ${STATUS_VERBS[to]}.`);
}

/**
 * Nuevo borrador a partir de una propuesta existente. Es la vía para corregir
 * algo ya emitido: se cancela la original y el clon tomará otro folio. El clon
 * recuerda de dónde viene (`replacesProposalId`) para mostrar "Sustituye a…".
 */
export async function cloneProposal(formData: FormData): Promise<void> {
  const user = await requireUser();
  const orgId = user.organizationId;
  const row = await orgProposal(orgId, toId(formData.get("id")));
  if (!row) return;
  const input: ProposalInput = { ...inputFromRow(row), date: orgToday() };
  const newId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(proposals)
      .values({
        ...columnsFromInput(input),
        organizationId: orgId,
        series: row.series,
        replacesProposalId: row.id,
        assessmentId: row.assessmentId,
        createdById: Number(user.id),
      })
      .returning({ id: proposals.id });
    await recordAudit(tx, {
      organizationId: orgId,
      userId: Number(user.id),
      entityType: "proposal",
      entityId: created.id,
      action: "create",
      metadata: { clonedFrom: row.id, clonedFromFolio: row.folio },
    });
    return created.id;
  });
  revalidatePath("/proposals");
  redirect(`/proposals/${newId}/edit`);
}

/** Solo un borrador se borra: nunca tuvo folio. Lo emitido se cancela, no se elimina. */
export async function deleteDraftProposal(formData: FormData): Promise<void> {
  const user = await requireUser();
  const orgId = user.organizationId;
  const row = await orgProposal(orgId, toId(formData.get("id")));
  if (!row || row.status !== "draft") return;
  await db.transaction(async (tx) => {
    await tx.delete(proposals).where(eq(proposals.id, row.id));
    await recordAudit(tx, {
      organizationId: orgId,
      userId: Number(user.id),
      entityType: "proposal",
      entityId: row.id,
      action: "delete",
      metadata: { clientName: row.clientName, productKey: row.productKey },
    });
  });
  revalidatePath("/proposals");
  redirect("/proposals");
}
