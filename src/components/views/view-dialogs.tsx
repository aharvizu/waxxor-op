"use client";

import { useActionState, useState } from "react";
import { AlertCircle } from "lucide-react";
import { FormAlert } from "@/components/form-feedback";
import { buttonClass, buttonSecondaryClass, cx, inputClass } from "@/components/ui";
import type { ActionState } from "@/lib/action-result";
import type { SavedView, ViewScope } from "@/lib/views";
import { renameSharedView, setSharedViewScope, transferSharedViewOwner } from "./actions";
import type { ViewSaveStatus } from "./use-view-config";

const SCOPE_LABEL: Record<ViewScope, string> = {
  system: "Sistema",
  personal: "Personal",
  team: "Equipo",
  organization: "Organización",
};

export { SCOPE_LABEL };

/** "Compartir" — retarget a view's scope. Organización only offered when the caller can manage it. */
export function ShareForm({
  view,
  basePath,
  canOrgScope,
  onClose,
}: {
  view: SavedView;
  basePath: string;
  canOrgScope: boolean;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(setSharedViewScope, null);
  return (
    <form action={(fd) => { formAction(fd); onClose(); }} className="space-y-2 p-1">
      <input type="hidden" name="id" value={view.id} />
      <input type="hidden" name="path" value={basePath} />
      <FormAlert state={state} />
      <p className="text-xs font-medium text-fg">Compartir &quot;{view.name}&quot;</p>
      <div className="flex flex-col gap-1 text-xs text-muted">
        <label className="flex items-center gap-1.5">
          <input type="radio" name="scope" value="personal" defaultChecked={view.scope === "personal"} /> Solo yo (Personal)
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="scope" value="team" defaultChecked={view.scope === "team"} /> Equipo
        </label>
        {canOrgScope ? (
          <label className="flex items-center gap-1.5">
            <input type="radio" name="scope" value="organization" defaultChecked={view.scope === "organization"} /> Toda la organización
          </label>
        ) : null}
      </div>
      <div className="flex justify-end gap-1.5 pt-1">
        <button type="button" onClick={onClose} className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>Cancelar</button>
        <button type="submit" className={cx(buttonClass, "h-7 px-2 text-xs")}>Guardar</button>
      </div>
    </form>
  );
}

/** "Cambiar propietario" — personal/team views only (system/organization have no single owner). */
export function TransferOwnerForm({
  view,
  basePath,
  orgUsers,
  onClose,
}: {
  view: SavedView;
  basePath: string;
  orgUsers: { id: number; name: string }[];
  onClose: () => void;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(transferSharedViewOwner, null);
  return (
    <form action={(fd) => { formAction(fd); onClose(); }} className="space-y-2 p-1">
      <input type="hidden" name="id" value={view.id} />
      <input type="hidden" name="path" value={basePath} />
      <FormAlert state={state} />
      <p className="text-xs font-medium text-fg">Cambiar propietario</p>
      <select name="newOwnerId" defaultValue={view.userId ?? ""} className={cx(inputClass, "h-8 w-full text-xs")}>
        {orgUsers.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>
      <div className="flex justify-end gap-1.5 pt-1">
        <button type="button" onClick={onClose} className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>Cancelar</button>
        <button type="submit" className={cx(buttonClass, "h-7 px-2 text-xs")}>Transferir</button>
      </div>
    </form>
  );
}

/** "Editar Vista" — name + scope in one panel (Renombrar stays the quick inline shortcut). */
export function EditViewForm({
  view,
  basePath,
  canOrgScope,
  onClose,
}: {
  view: SavedView;
  basePath: string;
  canOrgScope: boolean;
  onClose: () => void;
}) {
  const [name, setName] = useState(view.name);
  const [scope, setScope] = useState<ViewScope>(view.scope);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      if (name.trim() && name.trim() !== view.name) {
        const fd = new FormData();
        fd.set("id", String(view.id));
        fd.set("path", basePath);
        fd.set("name", name);
        const result = await renameSharedView(null, fd);
        if (result && !result.ok) throw new Error(result.message ?? "No se pudo renombrar.");
      }
      if (scope !== view.scope) {
        const fd = new FormData();
        fd.set("id", String(view.id));
        fd.set("path", basePath);
        fd.set("scope", scope);
        const result = await setSharedViewScope(null, fd);
        if (result && !result.ok) throw new Error(result.message ?? "No se pudo cambiar el alcance.");
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2 p-1">
      {error ? (
        <p className="flex items-center gap-1 text-xs text-danger">
          <AlertCircle className="size-3.5" /> {error}
        </p>
      ) : null}
      <p className="text-xs font-medium text-fg">Editar vista</p>
      <input value={name} onChange={(e) => setName(e.target.value)} className={cx(inputClass, "h-8 w-full text-xs")} />
      <select value={scope} onChange={(e) => setScope(e.target.value as ViewScope)} className={cx(inputClass, "h-8 w-full text-xs")}>
        <option value="personal">Personal</option>
        <option value="team">Equipo</option>
        {canOrgScope ? <option value="organization">Organización</option> : null}
      </select>
      <div className="flex justify-end gap-1.5 pt-1">
        <button type="button" onClick={onClose} className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>Cancelar</button>
        <button type="button" onClick={handleSave} disabled={busy} className={cx(buttonClass, "h-7 px-2 text-xs disabled:opacity-60")}>
          {busy ? "Guardando…" : "Guardar"}
        </button>
      </div>
    </div>
  );
}

/** "Al abandonar la Vista o cambiar a otra" with pending changes — the
 * Motor's single unsaved-changes prompt, options adapted to the caller's
 * edit permission (system/team-org-without-rights only ever offer "guardar
 * como nueva vista personal", never a direct save — see canEditView). */
export function UnsavedChangesPrompt({
  viewName,
  status,
  canEditDirectly,
  onSave,
  onSaveAsNew,
  onDiscard,
  onCancel,
}: {
  viewName: string;
  status: ViewSaveStatus;
  canEditDirectly: boolean;
  onSave: () => void;
  onSaveAsNew: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-sm rounded-lg border border-edge bg-surface p-4 shadow-overlay">
        <p className="mb-1 text-sm font-medium text-fg">Cambios sin guardar en &quot;{viewName}&quot;</p>
        <p className="mb-4 text-xs text-muted">
          {status === "error" ? "El último intento de guardar falló. " : ""}
          ¿Qué deseas hacer antes de cambiar de vista?
        </p>
        <div className="flex flex-col gap-1.5">
          {canEditDirectly ? (
            <button type="button" onClick={onSave} className={cx(buttonClass, "h-8 text-xs")}>Guardar cambios</button>
          ) : null}
          <button type="button" onClick={onSaveAsNew} className={cx(buttonSecondaryClass, "h-8 text-xs")}>
            Guardar como nueva vista personal
          </button>
          <button type="button" onClick={onDiscard} className="rounded-md px-2 py-1.5 text-xs text-muted hover:bg-subtle hover:text-fg">
            Descartar cambios
          </button>
          <button type="button" onClick={onCancel} className="text-xs text-faint hover:text-muted">Cancelar</button>
        </div>
      </div>
    </div>
  );
}
