# Server Action Validation & Result Convention

> Status: adopted 2026-07-15. Reference implementation: the **Clients** module.
> Resolves TD-06 (no validation) and TD-07 (silent failures) from `docs/decisions/technical-debt.md` for every module that migrates.

## The contract

Every form-driven server action:

1. Is called through `useActionState`, so its signature is `(prev: ActionState, formData: FormData) => Promise<ActionState>`.
2. Validates its input **on the server** with a Zod schema via `parseForm` — never with blind casts (`as TicketStatus`) or hand-rolled `String(...)` parsing.
3. Returns an `ActionResult` (from `src/lib/action-result.ts`):

```ts
type ActionResult =
  | { ok: true; message?: string }                     // success
  | { ok: false; kind: "validation";                   // bad input
      message: string;
      fieldErrors: Record<string, string[]>;           // keyed by input name
      values: Record<string, string> }                 // echo of what was typed
  | { ok: false; kind: "business"; message: string }   // rule violation, user-actionable
  | { ok: false; kind: "unexpected"; message: string };// logged server-side, generic msg
```

`ActionState = ActionResult | null` — `null` is the initial state before any submit.

### The four outcomes

| Outcome | Producer | User sees |
|---|---|---|
| Success | `success("Client added.")` | Green banner (or a redirect, which skips the banner) |
| Validation error | `parseForm(schema, formData)` when Zod fails | Red banner + inline message under each offending field; typed values are preserved |
| Business error | `businessError("This client no longer exists.")` | Red banner with the specific, actionable message |
| Unexpected error | `unexpectedError(err)` in the `catch` around DB work | Red banner with a generic message; the real error goes to the server log, never to the client |

## Action skeleton

```ts
export async function createThing(_prev: ActionState, formData: FormData): Promise<ActionState> {
  await requireUser();                                  // 1. authn/authz first
  const { data, error } = parseForm(thingSchema, formData);
  if (error) return error;                              // 2. validation

  try {
    await db.insert(things).values(data);               // 3. DB work inside try
  } catch (err) {
    return unexpectedError(err);                        // 4. unexpected
  }
  revalidatePath("/things");
  return success("Thing added.");                       // 5. success…
  // …or redirect("/things") — call it OUTSIDE the try/catch: redirect() throws
  // internally and a catch would swallow the navigation.
}
```

Schema conventions (see `clients/actions.ts`):

- `optionalText` — trims and turns `""` into `null`, matching nullable text columns.
- Enum fields: `z.enum(table.column.enumValues)` instead of `as` casts.
- Hidden numeric ids: `z.coerce.number().int().positive()`.
- Zod error messages are written for end users — they render verbatim in the form.

## Form skeleton (client component)

```tsx
const [state, formAction] = useActionState<ActionState, FormData>(action, null);
const failed = state && !state.ok ? state : null;
```

- `<FormAlert state={state} />` at the top renders the banner for every non-validation outcome (and the validation summary).
- `<FieldError id="name-error" errors={failed?.fieldErrors?.name} />` under each input; set `aria-invalid` and `aria-describedby` on the input when it has errors.
- Repopulate inputs with `failed?.values?.[name] ?? saved ?? ""` — React 19 resets uncontrolled forms after each action, so without this the user's input would be lost on a failed submit.
- Native attributes (`required`, `type="email"`) stay as progressive enhancement; the server schema remains the source of truth.

Shared pieces:

| File | Exports |
|---|---|
| `src/lib/action-result.ts` | `ActionResult`, `ActionState`, `success`, `businessError`, `unexpectedError`, `parseForm` |
| `src/components/form-feedback.tsx` | `FormAlert`, `FieldError` |

## Reference implementation

`src/app/(app)/clients/` — `actions.ts` (schema + both actions), `client-form.tsx` (one form component for create and edit), used by `page.tsx` and `[id]/page.tsx`. Note the business-error example: updating a client that was deleted in the meantime returns `businessError` instead of silently succeeding.

## Migration status

| Module | Status |
|---|---|
| Clients | ✅ migrated (reference) |
| Helpdesk (create/update/comment) | ⏳ pending |
| Projects (+tasks) | ⏳ pending |
| Quotes (+items) | ⏳ pending — pending OQ-17 (module's future) first |
| Reports (+templates) | ⏳ pending |
| KPIs (+entries) | ⏳ pending |
| Users | ⏳ pending — replaces the `?error=` query-param pattern |
| Login | ⏳ pending — already uses `useActionState`, but with a bare string state |

Rule for new code: **any new module starts on this convention**; migration of existing modules happens when a feature touches them (never as a standalone refactor — CLAUDE.md).
