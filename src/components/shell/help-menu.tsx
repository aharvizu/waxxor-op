"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { HelpCircle } from "lucide-react";
import { cx, iconButtonClass } from "@/components/ui";
import { HELP_MODULE_LABELS, moduleForPath, type HelpModuleKey } from "@/lib/help";

export type TutorialSummary = { slug: string; title: string; module: HelpModuleKey };

/**
 * Contextual help button (spec: "botón de ayuda contextual en pantallas
 * principales" + "recomendaciones de tutorial según la página actual").
 * `tutorials` is the small global catalog, fetched once server-side and
 * threaded down — no extra client fetch needed to recommend by module.
 */
export function HelpMenuButton({ tutorials }: { tutorials: TutorialSummary[] }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const moduleKey = moduleForPath(pathname);
  const recommended = moduleKey ? tutorials.filter((t) => t.module === moduleKey).slice(0, 3) : [];

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Ayuda"
        onClick={() => setOpen((v) => !v)}
        className={iconButtonClass}
      >
        <HelpCircle className="size-4" />
      </button>
      <AnimatePresence>
        {open ? (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -6 }}
              transition={{ duration: 0.12 }}
              className="absolute right-0 z-50 mt-2 w-64 rounded-xl border border-edge bg-surface p-2 shadow-overlay"
            >
              {moduleKey ? (
                <p className="px-2 pt-1 pb-2 text-[11px] font-semibold tracking-wide text-faint uppercase">
                  Para {HELP_MODULE_LABELS[moduleKey]}
                </p>
              ) : null}
              {recommended.length > 0 ? (
                <ul>
                  {recommended.map((t) => (
                    <li key={t.slug}>
                      <Link
                        href={`/help/${t.slug}`}
                        onClick={() => setOpen(false)}
                        className={cx("block rounded-lg px-2 py-2 text-sm text-fg transition-colors hover:bg-subtle")}
                      >
                        {t.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-2 py-2 text-sm text-muted">Sin tutoriales recomendados para esta pantalla.</p>
              )}
              <div className="mt-1 border-t border-edge pt-1">
                <Link
                  href="/help"
                  onClick={() => setOpen(false)}
                  className="block rounded-lg px-2 py-2 text-sm font-medium text-primary transition-colors hover:bg-subtle"
                >
                  Ver todo el Centro de Ayuda →
                </Link>
              </div>
            </motion.div>
          </>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
