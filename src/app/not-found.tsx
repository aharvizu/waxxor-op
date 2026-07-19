import Link from "next/link";
import { FileQuestion } from "lucide-react";
import { buttonClass } from "@/components/ui";

/**
 * Global 404 for truly unmatched URLs (typos, dead links) — rendered without
 * assuming a session exists. In-app 404s (notFound() called from a page
 * inside the shell) use src/app/(app)/not-found.tsx instead, which keeps the
 * sidebar/topbar visible. Previously there was no custom 404 at any level
 * (UX audit, 2026-07-20) — Next's generic unstyled page showed instead.
 */
export default function GlobalNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <div className="w-full max-w-md rounded-xl border border-edge bg-surface p-8 text-center shadow-card">
        <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-xl border border-edge bg-subtle text-muted">
          <FileQuestion className="size-5" />
        </div>
        <h1 className="text-lg font-semibold text-fg">Página no encontrada</h1>
        <p className="mt-2 text-sm text-muted">
          La dirección no existe o fue movida. Verifica la URL o vuelve al inicio.
        </p>
        <Link href="/today" className={`${buttonClass} mt-6 inline-flex`}>
          Ir a Hoy
        </Link>
      </div>
    </main>
  );
}
