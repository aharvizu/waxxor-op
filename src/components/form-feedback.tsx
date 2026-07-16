import { CircleAlert, CircleCheck } from "lucide-react";
import { cx } from "@/components/ui";
import type { ActionState } from "@/lib/action-result";

/** Form-level banner for an action result: success, business or unexpected error. */
export function FormAlert({
  state,
  className,
}: {
  state: ActionState;
  className?: string;
}) {
  if (!state) return null;

  if (state.ok) {
    if (!state.message) return null;
    return (
      <div
        role="status"
        className={cx(
          "flex items-start gap-2 rounded-lg border border-success/25 bg-success/5 px-3 py-2.5 text-sm text-success",
          className,
        )}
      >
        <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span>{state.message}</span>
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cx(
        "flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/5 px-3 py-2.5 text-sm text-danger",
        className,
      )}
    >
      <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{state.message}</span>
    </div>
  );
}

/** Inline message under a field. Pass `id` and point the input's aria-describedby at it. */
export function FieldError({
  id,
  errors,
}: {
  id?: string;
  errors?: string[];
}) {
  if (!errors?.length) return null;
  return (
    <p id={id} className="mt-1.5 text-sm text-danger">
      {errors[0]}
    </p>
  );
}
