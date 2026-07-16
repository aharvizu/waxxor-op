"use client";

import { useActionState } from "react";
import { Archive, ArchiveRestore, CheckCircle2, RotateCcw } from "lucide-react";
import {
  buttonClass,
  buttonSecondaryClass,
  buttonSuccessClass,
  inputClass,
  labelClass,
} from "@/components/ui";
import { FormAlert } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
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

/** Status + assignee card. Disabled while the activity is archived. */
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
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="id" value={activityId} />
      <FormAlert state={state} />
      <div>
        <label htmlFor="status" className={labelClass}>
          Status
        </label>
        <select
          id="status"
          name="status"
          key={status}
          defaultValue={status}
          disabled={archived}
          className={inputClass}
        >
          {ACTIVITY_WORKFLOW_STATUSES.map((s) => (
            <option key={s} value={s}>
              {activityStatusMeta[s]?.label ?? s}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="assigneeId" className={labelClass}>
          Assignee
        </label>
        <select
          id="assigneeId"
          name="assigneeId"
          key={assigneeId ?? "none"}
          defaultValue={assigneeId ?? ""}
          disabled={archived}
          className={inputClass}
        >
          <option value="">Unassigned</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </div>
      <SubmitButton className={archived ? "opacity-50" : undefined}>
        Update
      </SubmitButton>
    </form>
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
