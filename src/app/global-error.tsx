"use client";

import { useEffect } from "react";

/**
 * Catches errors thrown by the root layout itself (rare — most errors are
 * caught by src/app/(app)/error.tsx). Must render its own <html>/<body> since
 * it replaces the root layout entirely when triggered.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-white px-6 font-sans text-slate-900">
        <div className="w-full max-w-md rounded-xl border border-slate-200 p-8 text-center shadow-sm">
          <h1 className="text-lg font-semibold">Algo salió mal</h1>
          <p className="mt-2 text-sm text-slate-600">
            Ocurrió un error inesperado. Intenta recargar la página.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-6 inline-flex h-9 items-center justify-center rounded-lg bg-purple-600 px-3.5 text-sm font-medium text-white hover:bg-purple-700"
          >
            Reintentar
          </button>
        </div>
      </body>
    </html>
  );
}
