"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { Check, ChevronDown, Search } from "lucide-react";
import { cx, inputClass } from "@/components/ui";

export type SelectOption = { value: string; label: string; disabled?: boolean };

/**
 * Drop-in replacement for a native `<select>` that adds a type-to-filter
 * search box once there are more than `searchThreshold` options (5 by
 * default) — the ClickUp-style "open the list, start typing" pattern
 * (2026-07-31). Renders a hidden text input (not `type="hidden"`, so
 * `required` still participates in native form validation) carrying `name`/
 * `value`, so it drops into existing `<form action={serverAction}>` code
 * exactly like the `<select>` it replaces — no server action changes needed.
 *
 * Two usage modes, matching how selects are used across the app:
 *  - Uncontrolled (the common case): `name` + `defaultValue`, read via
 *    `formData.get(name)` on submit — same as a native select.
 *  - Controlled: `value` + `onValueChange`, for selects that drive other UI
 *    state (e.g. conditional fields), same as `<select value onChange>`.
 *
 * `submitOnChange` mirrors the `onChange={(e) => e.currentTarget.form?.requestSubmit()}`
 * inline-quick-action pattern (e.g. activity-controls.tsx's status/assignee
 * selects) — fires after the DOM value actually updates (a plain effect, not
 * inline in the click handler, since requestSubmit() right after setState
 * would still see the pre-update value).
 */
export function SearchableSelect(
  props: {
    options: SelectOption[];
    id?: string;
    "aria-label"?: string;
    "aria-invalid"?: boolean | "true" | "false";
    "aria-describedby"?: string;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    className?: string;
    searchThreshold?: number;
    emptyText?: string;
    submitOnChange?: boolean;
  } & (
    | { name: string; defaultValue?: string; value?: undefined; onValueChange?: undefined }
    | { name?: string; value: string; onValueChange: (value: string) => void; defaultValue?: undefined }
  ),
) {
  const {
    options,
    id,
    "aria-label": ariaLabel,
    "aria-invalid": ariaInvalid,
    "aria-describedby": ariaDescribedby,
    placeholder = "Seleccionar…",
    required,
    disabled,
    className,
    searchThreshold = 5,
    emptyText = "Sin resultados.",
    submitOnChange,
  } = props;
  const isControlled = "onValueChange" in props && props.onValueChange !== undefined;
  const [internalValue, setInternalValue] = useState(
    isControlled ? "" : (props.defaultValue ?? ""),
  );
  const value = isControlled ? props.value! : internalValue;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const mounted = useRef(false);
  const listboxId = useId();

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (submitOnChange) hiddenInputRef.current?.form?.requestSubmit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const selected = options.find((o) => o.value === value);
  const showSearch = options.length > searchThreshold;

  const filtered = useMemo(() => {
    if (!showSearch || !query.trim()) return options;
    const q = query.trim().toLowerCase();
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, showSearch]);

  function commit(next: string) {
    if (isControlled) (props as { onValueChange: (v: string) => void }).onValueChange(next);
    else setInternalValue(next);
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        if (disabled) return;
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <Popover.Trigger asChild>
        <button
          ref={triggerRef}
          type="button"
          role="combobox"
          id={id}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-label={ariaLabel}
          aria-invalid={ariaInvalid}
          aria-describedby={ariaDescribedby}
          className={cx(
            inputClass,
            "flex items-center justify-between gap-2 text-left",
            !selected && "text-faint",
            className,
          )}
        >
          <span className="min-w-0 truncate">{selected ? selected.label : placeholder}</span>
          <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden />
        </button>
      </Popover.Trigger>
      {"name" in props && props.name ? (
        <input
          ref={hiddenInputRef}
          type="text"
          name={props.name}
          value={value}
          readOnly
          required={required}
          tabIndex={-1}
          aria-hidden
          className="sr-only"
        />
      ) : null}
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={8}
          avoidCollisions
          onOpenAutoFocus={(e) => {
            if (showSearch) {
              e.preventDefault();
              searchRef.current?.focus();
            }
          }}
          className="z-[80] w-[var(--radix-popper-anchor-width)] min-w-48 overflow-hidden rounded-lg border border-edge bg-surface shadow-overlay outline-none"
        >
          {showSearch ? (
            <div className="flex items-center gap-2 border-b border-edge px-2.5 py-2">
              <Search className="size-3.5 shrink-0 text-faint" aria-hidden />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar…"
                className="w-full bg-transparent text-sm text-fg outline-none placeholder:text-faint"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filtered.length > 0) {
                    e.preventDefault();
                    commit(filtered[0].value);
                  }
                }}
              />
            </div>
          ) : null}
          <ul id={listboxId} role="listbox" className="max-h-64 overflow-y-auto p-1">
            {filtered.length === 0 ? (
              <li className="px-2.5 py-2 text-sm text-muted">{emptyText}</li>
            ) : (
              filtered.map((o) => (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={o.value === value}
                    disabled={o.disabled}
                    onClick={() => commit(o.value)}
                    className={cx(
                      "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm transition-colors",
                      o.disabled
                        ? "cursor-not-allowed text-faint opacity-50"
                        : "text-fg hover:bg-subtle",
                      o.value === value && !o.disabled && "bg-primary-soft text-primary",
                    )}
                  >
                    <span className="min-w-0 truncate">{o.label}</span>
                    {o.value === value ? <Check className="size-3.5 shrink-0" aria-hidden /> : null}
                  </button>
                </li>
              ))
            )}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
