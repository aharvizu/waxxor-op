"use client";

import { useActionState, useState } from "react";
import type { ActionState } from "@/lib/action-result";
import { savedViewConfigSchema, type SavedView, type SavedViewConfig } from "@/lib/views";
import { duplicateSharedView, updateSharedViewConfig } from "./actions";

/** Parses (never a raw cast) so a view saved before a config field existed
 * (e.g. `kanban`/`quick`, added after some rows were already created) gets
 * that field's default instead of `undefined` — reading `config.kanban.x`
 * on a legacy row without it used to crash the whole page render. */
function readConfig(view: SavedView): SavedViewConfig {
  return savedViewConfigSchema.parse(view.config);
}

/**
 * The Views Engine's save-state machine — belongs to the Motor, never to a
 * module (see lib/views.ts header). Every module renders this exact set of
 * states through the exact same ViewToolbar/ViewSwitcher components:
 *
 *   clean --(edit)--> dirty --(save)--> saving --(ok)-----> clean
 *                       ^                  |--(fails)--> error
 *                       |                  |
 *                       +---(discard)------+--(retry)--> saving
 *
 * Independent of view type (list/table/kanban/calendar/timeline/…) — it
 * only ever looks at `config`, a plain JSON blob, never at how a module
 * renders it.
 */
export type ViewSaveStatus = "clean" | "dirty" | "saving" | "error";

export function useViewConfig(view: SavedView, basePath: string) {
  const initial = readConfig(view);
  const [baseline, setBaseline] = useState<SavedViewConfig>(initial);
  const [config, setConfig] = useState<SavedViewConfig>(initial);
  const [prevViewId, setPrevViewId] = useState(view.id);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateSharedViewConfig, null);
  const [prevState, setPrevState] = useState(state);
  const [, saveAsAction, savingAsNew] = useActionState<ActionState, FormData>(duplicateSharedView, null);

  // A different view was selected — resync local state so switching tabs
  // never carries over another view's pending edits. Adjusted during
  // render, not in an effect, to avoid a stale-frame flash.
  if (view.id !== prevViewId) {
    setPrevViewId(view.id);
    const next = readConfig(view);
    setBaseline(next);
    setConfig(next);
    setErrorMessage(null);
  }

  // Observe the save action's settled result exactly once per resolution.
  // On success the just-submitted config becomes the new baseline
  // immediately — waiting for the server prop to refresh via revalidation
  // would otherwise leave the UI reporting "dirty" for a beat after a
  // successful save.
  if (state !== prevState) {
    setPrevState(state);
    if (state && !state.ok) setErrorMessage(state.message || "No se pudo guardar.");
    else if (state && state.ok) {
      setErrorMessage(null);
      setBaseline(config);
    }
  }

  const hasChanges = JSON.stringify(config) !== JSON.stringify(baseline);
  const status: ViewSaveStatus = pending || savingAsNew ? "saving" : errorMessage ? "error" : hasChanges ? "dirty" : "clean";

  function save() {
    if (status === "saving") return; // one in-flight request at a time
    setErrorMessage(null);
    const fd = new FormData();
    fd.set("id", String(view.id));
    fd.set("path", basePath);
    fd.set("config", JSON.stringify(config));
    formAction(fd);
  }

  function discard() {
    setConfig(baseline);
    setErrorMessage(null);
  }

  /** "Guardar como nueva vista personal" — the escape hatch for System/Team/
   * Organization views and for editors without write access. Always lands
   * as a brand-new personal view; never touches the source row. */
  function saveAsNewPersonal(name: string) {
    if (status === "saving") return;
    const fd = new FormData();
    fd.set("id", String(view.id));
    fd.set("path", basePath);
    fd.set("name", name);
    fd.set("config", JSON.stringify(config));
    saveAsAction(fd);
    setConfig(baseline);
    setErrorMessage(null);
  }

  return { config, setConfig, status, errorMessage, save, retry: save, discard, saveAsNewPersonal };
}
