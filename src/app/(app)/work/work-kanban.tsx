"use client";

import { useRouter } from "next/navigation";
import { CalendarClock } from "lucide-react";
import { KanbanBoard, type KanbanColumn } from "@/components/views/kanban-board";
import { Badge, cx } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { getLabels } from "@/lib/labels";
import { useLocale } from "@/components/locale-provider";
import { t } from "@/lib/i18n";
import { ACTIVITY_STATUS_CATEGORY, ACTIVITY_WORKFLOW_STATUSES } from "@/lib/activities";
import type { TicketStatusCategoryValue } from "@/lib/ticket-catalogs";
import { updateActivityWorkflow } from "../activities/actions";
import { changeTicketStatus } from "../helpdesk/actions";
import { TypeMark, type WorkRow } from "./work-views";

/** Shape TicketRowActions and this board both consume — the org catalog trimmed to what they need. */
export type WorkKanbanStatusOption = { id: number; name: string; category: TicketStatusCategoryValue; isActive: boolean };

/**
 * The combined board, grouped by the **shared semantic category** rather than
 * by status. Grouping by status would mean ~16 lanes (the org's 11 ticket
 * statuses plus the 7 activity ones); the six categories are the one
 * vocabulary both types answer to — see ACTIVITY_STATUS_CATEGORY and
 * `ticket_statuses.category`.
 *
 * Dragging reuses each type's already-validated setter (changeTicketStatus /
 * updateActivityWorkflow) and **invents no transition rules**. A category can
 * hold several statuses for a type — "En espera" covers both Waiting customer
 * and Waiting third party — and guessing which one the person meant would
 * silently rewrite a ticket's SLA story. So a drop only lands when the target
 * category resolves to exactly one status for that row's type; otherwise it is
 * refused with the options named, the same way Recurrentes' board refuses a
 * transition it cannot express. Trimming the status catalog to what the team
 * actually uses is what makes more of the board draggable.
 */
export function WorkKanban({
  rows,
  categories,
  ticketStatuses,
  peekHref,
}: {
  rows: WorkRow[];
  /** Ordered shared categories (TICKET_STATUS_CATEGORIES) — passed in so lane order never depends on object key order. */
  categories: string[];
  ticketStatuses: WorkKanbanStatusOption[];
  /** A card opens the quick view, not the detail page — same as the table's folio and title. */
  peekHref: (row: WorkRow) => string;
}) {
  const router = useRouter();
  const locale = useLocale();
  const { ticketPriorityMeta, workCategoryMeta } = getLabels(locale);
  const todayStr = new Date().toISOString().slice(0, 10);

  const columns: KanbanColumn<WorkRow>[] = categories.map((key) => ({
    key,
    label: workCategoryMeta[key]?.label ?? key,
    tone: workCategoryMeta[key]?.tone ?? "slate",
    items: rows.filter((r) => r.category === key),
  }));

  function refuse(names: string[], categoryKey: string) {
    const stage = workCategoryMeta[categoryKey]?.label ?? categoryKey;
    if (names.length === 0) {
      return {
        ok: false,
        message: t(
          `No hay un estatus de esa etapa ("${stage}") para este tipo de trabajo.`,
          `There is no status in that stage ("${stage}") for this kind of work.`,
          locale,
        ),
      };
    }
    return {
      ok: false,
      message: t(
        `"${stage}" tiene varios estatus (${names.join(", ")}) — ábrelo para elegir cuál.`,
        `"${stage}" holds several statuses (${names.join(", ")}) — open it to pick one.`,
        locale,
      ),
    };
  }

  async function onMove(itemId: number, _from: string, toKey: string) {
    const row = rows.find((r) => r.id === itemId);
    if (!row) return { ok: false, message: t("Ese trabajo ya no está en la lista.", "That work is no longer listed.", locale) };

    const fd = new FormData();
    fd.set("id", String(row.entityId));

    if (row.type === "ticket") {
      const candidates = ticketStatuses.filter((s) => s.isActive && s.category === toKey);
      if (candidates.length !== 1) return refuse(candidates.map((c) => c.name), toKey);
      fd.set("statusId", String(candidates[0].id));
      const result = await changeTicketStatus(null, fd);
      return { ok: result?.ok ?? false, message: result && !result.ok ? result.message : undefined };
    }

    // `archived` is excluded by ACTIVITY_WORKFLOW_STATUSES — it is reached
    // through archive/restore, never by setting a status.
    const candidates = ACTIVITY_WORKFLOW_STATUSES.filter((s) => ACTIVITY_STATUS_CATEGORY[s] === toKey);
    if (candidates.length !== 1) {
      const { activityStatusMeta } = getLabels(locale);
      return refuse(
        candidates.map((c) => activityStatusMeta[c]?.label ?? c),
        toKey,
      );
    }
    fd.set("status", candidates[0]);
    // Always resend the assignee so a drag never silently unassigns the activity.
    if (row.assigneeId) fd.set("assigneeId", String(row.assigneeId));
    const result = await updateActivityWorkflow(null, fd);
    return { ok: result?.ok ?? false, message: result && !result.ok ? result.message : undefined };
  }

  return (
    <KanbanBoard
      columns={columns}
      onMove={onMove}
      emptyLabel={t("Sin trabajo", "No work", locale)}
      renderCard={(r) => (
        <div
          role="link"
          tabIndex={0}
          onClick={() => router.push(peekHref(r))}
          onKeyDown={(e) => {
            if (e.key === "Enter") router.push(peekHref(r));
          }}
          // Same card surface as the Tickets and Activities boards —
          // KanbanBoard only spaces the cards, the surface belongs to
          // renderCard, and without it these were loose text with no visible
          // edge between one item and the next (reported 2026-11-08).
          className="cursor-pointer rounded-lg border border-edge bg-surface p-3 text-sm shadow-card transition-colors hover:border-edge-strong"
        >
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <TypeMark row={r} locale={locale} />
            <Badge tone={ticketPriorityMeta[r.priority]?.tone ?? "slate"}>
              {ticketPriorityMeta[r.priority]?.label ?? r.priority}
            </Badge>
          </div>
          {/* Clamped: a long title must not stretch the card out of the lane. */}
          <p className="mb-2 line-clamp-2 font-medium text-fg">{r.title}</p>
          <p className="mb-2 truncate text-xs text-muted">
            {r.companyName ?? t("Interno", "Internal", locale)}
          </p>
          <div className="flex items-center justify-between gap-2 text-xs">
            {r.dueDate ? (
              <span
                className={cx(
                  "inline-flex items-center gap-1 tabular-nums",
                  r.dueDate < todayStr && r.category !== "closed" && r.category !== "cancelled"
                    ? "font-medium text-danger"
                    : "text-muted",
                )}
              >
                <CalendarClock aria-hidden className="size-3.5 shrink-0" />
                {fmtDate(r.dueDate)}
              </span>
            ) : (
              <span />
            )}
            <span className="shrink-0 truncate text-muted">
              {r.assigneeName ?? t("Sin asignar", "Unassigned", locale)}
            </span>
          </div>
        </div>
      )}
    />
  );
}
