"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { buttonClass, buttonSecondaryClass, Card, EmptyState } from "@/components/ui";

/**
 * Error boundary for anything inside the app shell — a page-level render/data
 * error no longer takes down the whole tab; the sidebar/topbar stay usable so
 * the user can navigate away. Previously there was no error.tsx at any level
 * (UX audit, 2026-07-20) — Next's generic error screen showed instead.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app-error]", error);
  }, [error]);

  return (
    <Card className="p-10">
      <EmptyState
        icon={<AlertTriangle className="size-6" />}
        title="Algo salió mal"
        action={
          <span className="flex gap-2">
            <button type="button" onClick={reset} className={buttonClass}>
              Reintentar
            </button>
            <Link href="/today" className={buttonSecondaryClass}>
              Ir a Hoy
            </Link>
          </span>
        }
      >
        Ocurrió un error inesperado al cargar esta pantalla.
        {error.digest ? ` (ref: ${error.digest})` : ""}
      </EmptyState>
    </Card>
  );
}
