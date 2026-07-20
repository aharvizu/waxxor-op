"use client";

/**
 * "Conservar la vista seleccionada al regresar al módulo" — writes a small
 * per-module cookie whenever the user switches views, read server-side by
 * getLastViewId() (src/lib/last-view.ts) as a fallback between the explicit
 * ?view= query param and the user's default view.
 */
export function rememberLastView(module: string, viewId: number) {
  const maxAgeSeconds = 60 * 60 * 24 * 180; // ~6 months
  document.cookie = `wx-view-${module}=${viewId}; path=/; max-age=${maxAgeSeconds}; samesite=lax`;
}
