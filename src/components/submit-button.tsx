"use client";

import { useFormStatus } from "react-dom";
import { buttonClass, cx } from "./ui";

export function SubmitButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={cx(buttonClass, className)}>
      {pending ? "Saving…" : children}
    </button>
  );
}
