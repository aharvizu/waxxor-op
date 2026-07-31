"use client";

import { useActionState } from "react";
import { Archive, ArchiveRestore, CheckCircle2, RotateCcw } from "lucide-react";
import {
  buttonClass,
  buttonSecondaryClass,
  buttonSuccessClass,
} from "@/components/ui";
import { FormAlert } from "@/components/form-feedback";
import { SearchableSelect } from "@/components/searchable-select";
import type { ActionState } from "@/lib/action-result";
import { ACTIVITY_WORKFLOW_STATUSES } from "@/lib/activities";
import { activityStatusMeta } from "@/lib/labels";
import {
  archiveActivity,
  completeActivity,
  reopenActivity,
  restoreActivity,
  updateActivityWorkflow,
} from "./actions";

type Option = { id: number; name: string };

/**
 * Status + assignee, compact and inline — lives in the top action row next
 * to the other options instead of its own sidebar card, auto-submitting on
 * change (same pattern as the Helpdesk row-action dropdowns) instead of a
 * separate "Update" button (2026-07-28).
 */
export function WorkflowCard({
  activityId,
  status,
  assigneeId,
  users,
  archived,
}: {
  activityId: number;
  status: string;
  assigneeId: number | null;
  users: Option[];
  archived: boolean;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(
    updateActivityWorkflow,
    null,
  );

  return (
    <div>
      <form action={formAction} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="id" value={activityId} />
        <SearchableSelect
          name="status"
          key={status}
          defaultValue={status}
          disabled={archived}
          aria-label="Status"
          submitOnChange
          className="h-9 w-auto disabled:opacity-50"
          options={ACTIVITY_WORKFLOW_STATUSES.map((s) => ({ value: s, label: activityStatusMeta[s]?.label ?? s }))}
        />
        <SearchableSelect
          name="assigneeId"
          key={assigneeId ?? "none"}
          defaultValue={assigneeId ? String(assigneeId) : ""}
          disabled={archived}
          aria-label="Assignee"
          submitOnChange
          className="h-9 w-auto disabled:opacity-50"
          options={[{ value: "", label: "Unassigned" }, ...users.map((u) => ({ value: String(u.id), label: u.name }))]}
        />
      </form>
      {state && !state.ok ? <FormAlert state={state} className="mt-2" /> : null}
    </div>
  );
}

function TransitionButton({
  action,
  activityId,
  className,
  children,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  activityId: number;
  className: string;
  children: React.ReactNode;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="id" value={activityId} />
      {state && !state.ok ? <FormAlert state={state} /> : null}
      <button type="submit" className={className}>
        {children}
      </button>
    </form>
  );
}

/** Complete/Reopen + Archive/Restore quick actions. */
export function TransitionButtons({
  activityId,
  completed,
  archived,
}: {
  activityId: number;
  completed: boolean;
  archived: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {archived ? (
        <TransitionButton
          action={restoreActivity}
          activityId={activityId}
          className={buttonClass}
        >
          <ArchiveRestore /> Restore
        </TransitionButton>
      ) : (
        <>
          {completed ? (
            <TransitionButton
              action={reopenActivity}
              activityId={activityId}
              className={buttonSecondaryClass}
            >
              <RotateCcw /> Reopen
            </TransitionButton>
          ) : (
            <TransitionButton
              action={completeActivity}
              activityId={activityId}
              className={buttonSuccessClass}
            >
              <CheckCircle2 /> Complete
            </TransitionButton>
          )}
          <TransitionButton
            action={archiveActivity}
            activityId={activityId}
            className={buttonSecondaryClass}
          >
            <Archive /> Archive
          </TransitionButton>
        </>
      )}
    </div>
  );
}
