"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { buttonClass, cx } from "./ui";

export function SubmitButton({
  children,
  className,
  pending: pendingProp,
}: {
  children: React.ReactNode;
  className?: string;
  /** Override for forms that don't submit via the native `action` prop (e.g. React Hook Form forms, which call the Server Action from `onSubmit` instead) — `useFormStatus()` only tracks real form actions, so those pass their own `useActionState` pending flag here. */
  pending?: boolean;
}) {
  const { pending: formStatusPending } = useFormStatus();
  const pending = pendingProp ?? formStatusPending;
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={cx(buttonClass, className)}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : null}
      {children}
    </button>
  );
}
