"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { cx } from "@/components/ui";

/**
 * Lightweight dropdown/popover primitive: click-outside + Escape to close,
 * spring-pop entrance, closes on item click unless `closeOnClick` is false.
 */
export function Dropdown({
  button,
  buttonClassName,
  buttonLabel,
  align = "end",
  panelClassName,
  closeOnClick = true,
  children,
}: {
  button: ReactNode;
  buttonClassName?: string;
  buttonLabel?: string;
  align?: "start" | "end";
  panelClassName?: string;
  closeOnClick?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={buttonLabel}
        onClick={() => setOpen((o) => !o)}
        className={buttonClassName}
      >
        {button}
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            id={panelId}
            role="menu"
            initial={{ opacity: 0, scale: 0.96, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -2 }}
            transition={{ duration: 0.13, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => {
              if (closeOnClick) setOpen(false);
            }}
            className={cx(
              "absolute z-50 mt-2 w-56 origin-top rounded-xl border border-edge bg-surface p-1.5 shadow-overlay",
              align === "end" ? "right-0" : "left-0",
              panelClassName,
            )}
          >
            {children}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export const menuItemClass =
  "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm font-medium text-fg transition-colors duration-100 hover:bg-subtle focus-visible:bg-subtle focus-visible:outline-none [&>svg]:size-4 [&>svg]:shrink-0 [&>svg]:text-muted";

export function MenuSeparator() {
  return <div className="my-1.5 h-px bg-edge" role="separator" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2.5 pt-1.5 pb-1 text-[11px] font-semibold tracking-wider text-faint uppercase">
      {children}
    </div>
  );
}
