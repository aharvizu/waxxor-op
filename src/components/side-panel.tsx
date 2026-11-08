import type { ReactNode } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { cx } from "@/components/ui";

/**
 * Right-hand quick-view panel over a dimmed backdrop, closed by a URL (no
 * client state), so it works from a server component and stays bookmarkable
 * and back-button friendly — the panel's open state lives in the query string.
 *
 * Deliberately hook-free for that reason: `closeHref` is a plain link, both on
 * the backdrop and on the ✕. Pressing Escape is not wired yet (it would force
 * this into a client component); `/today` has the same limitation in its own
 * inline version, which this component is meant to replace as the single
 * implementation the next time that page is touched.
 */
export function SidePanel({
  closeHref,
  label,
  eyebrow,
  title,
  children,
  footer,
  width = "md",
}: {
  /** Where the ✕ and the backdrop navigate — usually the current URL minus the panel param. */
  closeHref: string;
  /** Accessible name for the dialog. */
  label: string;
  /** Small muted line above the title (type, folio…). */
  eyebrow?: ReactNode;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: "md" | "lg";
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="dialog" aria-modal="true" aria-label={label}>
      <Link href={closeHref} className="flex-1" aria-label="Cerrar" />
      <div
        className={cx(
          "h-full w-full overflow-y-auto border-l border-edge bg-surface p-6 shadow-xl",
          width === "lg" ? "max-w-lg" : "max-w-md",
        )}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {eyebrow ? <div className="text-xs text-faint">{eyebrow}</div> : null}
            <h2 className="text-lg font-semibold text-fg">{title}</h2>
          </div>
          <Link
            href={closeHref}
            aria-label="Cerrar"
            className="rounded-md p-1 text-faint transition-colors hover:bg-subtle hover:text-fg"
          >
            <X aria-hidden className="size-4" />
          </Link>
        </div>
        {children}
        {footer ? <div className="mt-5 space-y-3 border-t border-edge pt-4">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Label/value row for a SidePanel's definition list. */
export function PanelRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="text-right text-fg">{value}</dd>
    </div>
  );
}
