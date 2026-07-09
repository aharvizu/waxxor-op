"use client";

import { useActionState, useState } from "react";
import { AlertCircle, Eye, EyeOff, Lock, Mail } from "lucide-react";
import { authenticate } from "./actions";
import { cx, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export function LoginForm() {
  const [error, formAction] = useActionState(authenticate, undefined);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className={labelClass}>
          Email
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className={cx(inputClass, "pl-9")}
            placeholder="you@waxxor.com"
          />
        </div>
      </div>
      <div>
        <label htmlFor="password" className={labelClass}>
          Password
        </label>
        <div className="relative">
          <Lock className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className={cx(inputClass, "px-9")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute top-1/2 right-2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-faint transition-colors hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      {error ? (
        <p
          role="alert"
          className="flex items-center gap-2.5 rounded-lg border border-danger/25 bg-danger/5 px-3 py-2.5 text-sm text-danger"
        >
          <AlertCircle className="size-4 shrink-0" />
          {error}
        </p>
      ) : null}
      <SubmitButton className="w-full">Sign in</SubmitButton>
    </form>
  );
}
