import type { ReactNode } from "react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Class combiner: clsx + tailwind-merge, shadcn-style. */
export function cx(...classes: ClassValue[]) {
  return twMerge(clsx(classes));
}

/* ---------------------------------------------------------------- Buttons */

const buttonBase =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium whitespace-nowrap transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] [&>svg]:size-4 [&>svg]:shrink-0";

export const buttonClass = cx(
  buttonBase,
  "bg-primary text-white shadow-card hover:bg-primary-hover",
);

export const buttonSecondaryClass = cx(
  buttonBase,
  "border border-edge bg-surface text-fg shadow-card hover:bg-subtle hover:border-edge-strong",
);

export const buttonGhostClass = cx(
  buttonBase,
  "text-muted hover:bg-subtle hover:text-fg",
);

export const buttonOutlineClass = cx(
  buttonBase,
  "border border-primary/30 bg-transparent text-primary hover:bg-primary-soft",
);

export const buttonDangerClass = cx(
  buttonBase,
  "border border-danger/25 bg-danger/5 text-danger hover:bg-danger/10",
);

export const buttonSuccessClass = cx(
  buttonBase,
  "bg-success text-white shadow-card hover:opacity-90",
);

export const iconButtonClass = cx(
  buttonBase,
  "h-9 w-9 p-0 text-muted hover:bg-subtle hover:text-fg",
);

/* ----------------------------------------------------------------- Inputs */

export const inputClass =
  "block h-9 w-full rounded-lg border border-edge bg-surface px-3 text-sm text-fg shadow-card transition-colors duration-150 placeholder:text-faint hover:border-edge-strong focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 [&:is(textarea)]:h-auto [&:is(textarea)]:py-2 [&:is(select)]:pr-8";

export const labelClass = "mb-1.5 block text-sm font-medium text-fg";

/* ------------------------------------------------------------------ Cards */

export function Card({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "rounded-xl border border-edge bg-surface shadow-card transition-shadow duration-200",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-wrap items-center justify-between gap-3 border-b border-edge px-5 py-4",
        className,
      )}
    >
      <div>
        <h2 className="text-sm font-semibold text-fg">{title}</h2>
        {description ? (
          <p className="mt-0.5 text-sm text-muted">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------ Page header */

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-sm text-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

/* ----------------------------------------------------------------- Badges */

export type BadgeTone =
  | "slate"
  | "blue"
  | "amber"
  | "green"
  | "red"
  | "violet"
  | "purple";

const badgeTones: Record<BadgeTone, string> = {
  slate:
    "bg-slate-50 text-slate-700 ring-slate-600/10 dark:bg-slate-400/10 dark:text-slate-300 dark:ring-slate-400/20",
  blue: "bg-blue-50 text-blue-700 ring-blue-600/10 dark:bg-blue-400/10 dark:text-blue-300 dark:ring-blue-400/20",
  amber:
    "bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-400/10 dark:text-amber-300 dark:ring-amber-400/20",
  green:
    "bg-emerald-50 text-emerald-700 ring-emerald-600/10 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20",
  red: "bg-red-50 text-red-700 ring-red-600/10 dark:bg-red-400/10 dark:text-red-300 dark:ring-red-400/20",
  violet:
    "bg-violet-50 text-violet-700 ring-violet-600/10 dark:bg-violet-400/10 dark:text-violet-300 dark:ring-violet-400/20",
  purple:
    "bg-purple-50 text-purple-700 ring-purple-600/10 dark:bg-purple-400/10 dark:text-purple-300 dark:ring-purple-400/20",
};

export function Badge({
  tone = "slate",
  children,
  className,
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
        badgeTones[tone],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-current opacity-60" />
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------- Avatar */

const avatarTints = [
  "bg-purple-100 text-purple-700 dark:bg-purple-400/15 dark:text-purple-300",
  "bg-sky-100 text-sky-700 dark:bg-sky-400/15 dark:text-sky-300",
  "bg-emerald-100 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300",
  "bg-amber-100 text-amber-700 dark:bg-amber-400/15 dark:text-amber-300",
  "bg-rose-100 text-rose-700 dark:bg-rose-400/15 dark:text-rose-300",
  "bg-indigo-100 text-indigo-700 dark:bg-indigo-400/15 dark:text-indigo-300",
];

export function Avatar({
  name,
  size = "sm",
  square = false,
  className,
}: {
  name: string;
  size?: "xs" | "sm" | "md";
  square?: boolean;
  className?: string;
}) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  const tint = avatarTints[Math.abs(hash) % avatarTints.length];
  const sizes = {
    xs: "size-6 text-[10px]",
    sm: "size-8 text-xs",
    md: "size-10 text-sm",
  };
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center justify-center font-semibold select-none",
        square ? "rounded-lg" : "rounded-full",
        sizes[size],
        tint,
        className,
      )}
    >
      {initials || "?"}
    </span>
  );
}

/* ----------------------------------------------------------------- Tables */

/**
 * Always wraps itself in a horizontal-scroll container — about half the call
 * sites used to remember this individually and half didn't, which broke wide
 * tables on narrow screens (UX audit, 2026-07-20). Fixing it once here beats
 * fixing it at every call site.
 */
export function Table({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className={cx("w-full text-sm", className)}>{children}</table>
    </div>
  );
}

/**
 * NOT sticky — on purpose. It used to be (`sticky top-16`), but per the CSS
 * spec, a wrapper with `overflow-x: auto` and no explicit `overflow-y`
 * computes `overflow-y` to `auto` too (you cannot override this back to
 * `visible`; the browser recomputes it regardless of what's declared).
 * That silently turned Table's horizontal-scroll wrapper into this
 * element's sticky containing block instead of the page viewport, so it
 * never actually tracked scroll — it just sat at a permanent `top: 4rem`
 * offset *inside that wrapper*, which is exactly what overlapped the first
 * row by 64px. A table wide enough to need horizontal scroll can't have a
 * page-sticky <thead> without restructuring the scroll container itself
 * (out of scope for a header/row overlap fix) — a static header that's
 * always correctly positioned beats a "sticky" one that was silently
 * broken.
 */
export function THead({ children }: { children: ReactNode }) {
  return <thead className="bg-subtle shadow-sm print:static">{children}</thead>;
}

export function Th({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return (
    <th
      className={cx(
        "border-b border-edge-strong px-5 py-3 text-left text-[11px] font-semibold tracking-wider text-muted uppercase first:rounded-tl-xl last:rounded-tr-xl",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  return <td className={cx("px-5 py-3.5 text-sm", className)}>{children}</td>;
}

/* ------------------------------------------------------------ Empty state */

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title?: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-edge-strong bg-surface px-8 py-14 text-center">
      {icon ? (
        <div className="mb-4 flex size-12 items-center justify-center rounded-xl border border-edge bg-subtle text-muted shadow-card [&>svg]:size-5">
          {icon}
        </div>
      ) : null}
      {title ? <h3 className="mb-1 text-sm font-semibold text-fg">{title}</h3> : null}
      <p className="max-w-sm text-sm text-muted">{children}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------- Stat card */

export function StatCard({
  icon,
  label,
  value,
  hint,
  footer,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
  footer?: ReactNode;
}) {
  return (
    <Card className="group relative p-5 hover:shadow-card-hover">
      <div className="flex items-start justify-between gap-3">
        <div className="flex size-10 items-center justify-center rounded-lg border border-edge bg-subtle text-muted transition-colors duration-200 group-hover:border-primary/25 group-hover:bg-primary-soft group-hover:text-primary [&>svg]:size-5">
          {icon}
        </div>
        {hint ? (
          <span
            title={hint}
            className="cursor-default text-faint transition-colors group-hover:text-muted"
          >
            <svg viewBox="0 0 16 16" fill="none" className="size-4" aria-hidden>
              <circle cx="8" cy="8" r="6.25" stroke="currentColor" strokeWidth="1.5" />
              <path
                d="M8 7.2v3.05M8 5.4v.05"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
            <span className="sr-only">{hint}</span>
          </span>
        ) : null}
      </div>
      <div className="mt-4 text-[13px] font-medium text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-tight">{value}</div>
      {footer ? <div className="mt-2 text-xs text-faint">{footer}</div> : null}
    </Card>
  );
}

/* --------------------------------------------------------------- Progress */

export function Progress({
  value,
  tone = "primary",
  className,
}: {
  /** 0–100 */
  value: number;
  tone?: "primary" | "success" | "warning" | "danger";
  className?: string;
}) {
  // The unfilled track is a lighter step of the same hue so the state reads
  // across the whole bar, not just the filled part.
  const tones = {
    primary: "bg-primary",
    success: "bg-success",
    warning: "bg-warning",
    danger: "bg-danger",
  };
  const tracks = {
    primary: "bg-primary/15",
    success: "bg-success/15",
    warning: "bg-warning/15",
    danger: "bg-danger/15",
  };
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(clamped)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cx(
        "h-1.5 w-full overflow-hidden rounded-full",
        tracks[tone],
        className,
      )}
    >
      <div
        className={cx("h-full rounded-full transition-[width] duration-500", tones[tone])}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}

/* --------------------------------------------------------------- Skeleton */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-lg bg-inset", className)} />;
}
