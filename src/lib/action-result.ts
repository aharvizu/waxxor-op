import { z } from "zod";

/**
 * Shared result type for server actions driven by useActionState.
 * See docs/architecture/action-validation.md for the full convention.
 */
export type ActionResult =
  | { ok: true; message?: string }
  | {
      ok: false;
      kind: "validation" | "business" | "unexpected";
      message: string;
      /** Per-field messages keyed by input name. Present on validation errors. */
      fieldErrors?: Record<string, string[]>;
      /** Submitted values so the form can repopulate after a failed action. */
      values?: Record<string, string>;
    };

/** useActionState initial state: no action has run yet. */
export type ActionState = ActionResult | null;

export function success(message?: string): ActionResult {
  return { ok: true, message };
}

/** A rule violation the user can understand and act on (e.g. "already exists"). */
export function businessError(message: string): ActionResult {
  return { ok: false, kind: "business", message };
}

/** Logs the real error server-side; the user gets a generic, safe message. */
export function unexpectedError(error: unknown): ActionResult {
  console.error("Unexpected server action error:", error);
  return {
    ok: false,
    kind: "unexpected",
    message: "Something went wrong. Please try again.",
  };
}

/** Echo back what the user typed, skipping Next's internal $ACTION_* entries. */
function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$")) values[key] = value;
  }
  return values;
}

/**
 * Validates a FormData payload against a Zod schema.
 * Returns either the typed data or a ready-to-return validation ActionResult
 * carrying field errors and the submitted values.
 */
export function parseForm<Schema extends z.ZodType>(
  schema: Schema,
  formData: FormData,
):
  | { data: z.output<Schema>; error: null }
  | { data: null; error: ActionResult } {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (parsed.success) return { data: parsed.data, error: null };
  return {
    data: null,
    error: {
      ok: false,
      kind: "validation",
      message: "Please fix the highlighted fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<
        string,
        string[]
      >,
      values: formValues(formData),
    },
  };
}
