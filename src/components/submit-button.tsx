"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
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
