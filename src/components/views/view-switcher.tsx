"use client";

import { useActionState, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Copy, Download, Lock, LayoutGrid, List, Plus, Star, Table2, Trash2, UserCog, Users } from "lucide-react";
import { DragList } from "@/components/drag-list";
import { FormAlert } from "@/components/form-feedback";
import { cx, inputClass } from "@/components/ui";
import type { ActionState } from "@/lib/action-result";
import type { ConfigModule, SavedView, ViewType } from "@/lib/views";
import type { Role } from "@/lib/roles";
import { hasRole } from "@/lib/roles";
import {
  createSharedView,
  deleteSharedView,
  duplicateSharedView,
  renameSharedView,
  reorderSharedViews,
  setDefaultSharedView,
  toggleSharedViewFavorite,
} from "./actions";
import { EditViewForm, SCOPE_LABEL, ShareForm, TransferOwnerForm, UnsavedChangesPrompt } from "./view-dialogs";
import { rememberLastView } from "./last-view";
import type { ViewSaveStatus } from "./use-view-config";

/**
 * Shared view-switcher tab bar — the Views Engine's single implementation
 * (consolidated 2026-07-22), used identically by every module wired to it.
 * Calendar/Timeline are out of scope for creation but keep their icon slot
 * so pre-existing data of those types still renders correctly.
 */
const VIEW_ICONS: Partial<Record<ViewType, typeof List>> = {
  list: List,
  table: Table2,
  kanban: LayoutGrid,
};

/** The live, uncommitted config state from the module's useViewConfig() —
 * only passed when the caller renders a config-editing surface alongside
 * this switcher, so tab clicks can intercept navigation while dirty. */
export type PendingChanges = {
  status: ViewSaveStatus;
  canEditDirectly: boolean;
  save: () => void;
  discard: () => void;
  saveAsNewPersonal: (name: string) => void;
};

/** Client-side mirror of lib/views.ts's canEditView — presentational only
 * (hides/disables buttons that would fail server-side anyway); the
 * authoritative check always re-runs inside the server action. */
export function canEditViewClient(view: SavedView, currentUserId: number, role: Role): boolean {
  switch (view.scope) {
    case "system":
      return false;
    case "organization":
      return hasRole(role, ["administrator"]);
    case "team":
      return view.userId === currentUserId || hasRole(role, ["administrator"]);
    case "personal":
      return view.userId === currentUserId;
  }
}

function exportViewConfig(view: SavedView) {
  const blob = new Blob([JSON.stringify({ name: view.name, viewType: view.viewType, config: view.config }, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${view.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "vista"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function ViewCreateForm({
  module,
  basePath,
  canOrgScope,
  onClose,
}: {
  module: ConfigModule;
  basePath: string;
  canOrgScope: boolean;
  onClose: () => void;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(createSharedView, null);
  return (
    <form
      action={(fd) => {
        formAction(fd);
        onClose();
      }}
      className="flex items-center gap-2 rounded-lg border border-edge bg-surface p-2 shadow-overlay"
    >
      <input type="hidden" name="module" value={module} />
      <input type="hidden" name="path" value={basePath} />
      <FormAlert state={state} />
      <input name="name" required placeholder="Nombre de la vista" className={cx(inputClass, "h-8 w-40 text-xs")} autoFocus />
      <select name="viewType" defaultValue="table" className={cx(inputClass, "h-8 w-auto text-xs")}>
        <option value="list">Lista</option>
        <option value="table">Tabla</option>
        <option value="kanban">Kanban</option>
      </select>
      <select name="scope" defaultValue="personal" className={cx(inputClass, "h-8 w-auto text-xs")}>
        <option value="personal">Personal</option>
        <option value="team">Equipo</option>
        {canOrgScope ? <option value="organization">Organización</option> : null}
      </select>
      <button type="submit" className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-hover">
        Crear
      </button>
    </form>
  );
}

function ViewTab({
  view,
  active,
  currentUserId,
  currentUserRole,
  basePath,
  orgUsers,
  isLastView,
  onRequestNavigate,
}: {
  view: SavedView;
  active: boolean;
  currentUserId: number;
  currentUserRole: Role;
  basePath: string;
  orgUsers: { id: number; name: string }[];
  isLastView: boolean;
  onRequestNavigate: (view: SavedView) => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<"none" | "edit" | "share" | "transfer">("none");
  const [renaming, setRenaming] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [, favAction] = useActionState<ActionState, FormData>(toggleSharedViewFavorite, null);
  const [, defaultAction] = useActionState<ActionState, FormData>(setDefaultSharedView, null);
  const [, dupAction] = useActionState<ActionState, FormData>(duplicateSharedView, null);
  const [deleteState, deleteAction] = useActionState<ActionState, FormData>(deleteSharedView, null);
  const [, renameAction] = useActionState<ActionState, FormData>(renameSharedView, null);

  const Icon = VIEW_ICONS[view.viewType] ?? Table2;
  const canEdit = canEditViewClient(view, currentUserId, currentUserRole);
  const canOrgScope = hasRole(currentUserRole, ["administrator"]);
  const isShared = view.scope !== "personal";
  const ownerLabel = view.scope === "system" ? "Sistema" : view.userId === currentUserId ? "Tú" : orgUsers.find((u) => u.id === view.userId)?.name ?? "—";

  // Deleting the active view: drop ?view= so the server falls back to the
  // user's default/first view — "cambiar automáticamente a la Vista
  // predeterminada" — done as a render-time reaction to the settled delete,
  // not an effect (no stale-frame flash).
  const [prevDeleteState, setPrevDeleteState] = useState(deleteState);
  if (deleteState !== prevDeleteState) {
    setPrevDeleteState(deleteState);
    if (deleteState?.ok && active) router.replace(pathname);
  }

  function selectView() {
    onRequestNavigate(view);
  }

  if (renaming) {
    return (
      <form
        action={(fd) => {
          renameAction(fd);
          setRenaming(false);
        }}
        className="flex items-center gap-1"
      >
        <input type="hidden" name="id" value={view.id} />
        <input type="hidden" name="path" value={basePath} />
        <input name="name" defaultValue={view.name} autoFocus className={cx(inputClass, "h-7 w-28 text-xs")} onBlur={(e) => e.currentTarget.form?.requestSubmit()} />
      </form>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={selectView}
        onDoubleClick={() => canEdit && setRenaming(true)}
        aria-current={active ? "page" : undefined}
        title={isShared ? `${SCOPE_LABEL[view.scope]} · propietario: ${ownerLabel}${canEdit ? "" : " · solo lectura"}` : undefined}
        className={cx(
          "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
          active ? "bg-primary-soft text-primary" : "text-muted hover:bg-subtle hover:text-fg",
        )}
      >
        <Icon className="size-3.5" />
        {view.name}
        {view.isFavorite ? <Star className="size-3 fill-amber-400 text-amber-400" /> : null}
        {isShared ? <Users className="size-3 text-faint" /> : null}
        {isShared && !canEdit ? <Lock className="size-3 text-faint" /> : null}
      </button>
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        className="absolute -right-3 -top-1 hidden size-4 items-center justify-center rounded-full bg-subtle text-[10px] text-faint group-hover:flex"
      >
        ⋯
      </button>
      {panel === "edit" ? (
        <div className="absolute top-9 left-0 z-30">
          <EditViewForm view={view} basePath={basePath} canOrgScope={canOrgScope} onClose={() => setPanel("none")} />
        </div>
      ) : panel === "share" ? (
        <div className="absolute top-9 left-0 z-30">
          <ShareForm view={view} basePath={basePath} canOrgScope={canOrgScope} onClose={() => setPanel("none")} />
        </div>
      ) : panel === "transfer" ? (
        <div className="absolute top-9 left-0 z-30">
          <TransferOwnerForm view={view} basePath={basePath} orgUsers={orgUsers} onClose={() => setPanel("none")} />
        </div>
      ) : null}
      {menuOpen ? (
        <div className="absolute top-9 left-0 z-20 w-52 space-y-0.5 rounded-lg border border-edge bg-surface p-1.5 text-xs shadow-overlay">
          {isShared ? (
            <div className="border-b border-edge px-2 py-1.5 text-[11px] text-faint">
              {SCOPE_LABEL[view.scope]} · propietario {ownerLabel} · {canEdit ? "editable" : "solo lectura"}
            </div>
          ) : null}
          <form action={favAction}>
            <input type="hidden" name="id" value={view.id} />
            <input type="hidden" name="path" value={basePath} />
            <button type="submit" className="w-full rounded-md px-2 py-1.5 text-left hover:bg-subtle">{view.isFavorite ? "Quitar favorito" : "Marcar favorita"}</button>
          </form>
          <form action={defaultAction}>
            <input type="hidden" name="id" value={view.id} />
            <input type="hidden" name="path" value={basePath} />
            <button type="submit" className="w-full rounded-md px-2 py-1.5 text-left hover:bg-subtle">Definir por defecto</button>
          </form>
          {canEdit ? (
            <button type="button" onClick={() => { setPanel("edit"); setMenuOpen(false); }} className="w-full rounded-md px-2 py-1.5 text-left hover:bg-subtle">Editar vista</button>
          ) : null}
          {canEdit ? (
            <button type="button" onClick={() => { setRenaming(true); setMenuOpen(false); }} className="w-full rounded-md px-2 py-1.5 text-left hover:bg-subtle">Renombrar</button>
          ) : null}
          <form action={dupAction}>
            <input type="hidden" name="id" value={view.id} />
            <input type="hidden" name="path" value={basePath} />
            <button type="submit" className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-subtle"><Copy className="size-3" /> Duplicar</button>
          </form>
          {canEdit && view.scope !== "system" ? (
            <button type="button" onClick={() => { setPanel("share"); setMenuOpen(false); }} className="w-full rounded-md px-2 py-1.5 text-left hover:bg-subtle">Compartir</button>
          ) : null}
          {canEdit && (view.scope === "personal" || view.scope === "team") ? (
            <button type="button" onClick={() => { setPanel("transfer"); setMenuOpen(false); }} className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-subtle">
              <UserCog className="size-3" /> Cambiar propietario
            </button>
          ) : null}
          <button type="button" onClick={() => { exportViewConfig(view); setMenuOpen(false); }} className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-subtle">
            <Download className="size-3" /> Exportar configuración
          </button>
          {canEdit && view.scope !== "system" ? (
            confirmingDelete ? (
              <form
                action={(fd) => {
                  deleteAction(fd);
                  setConfirmingDelete(false);
                  setMenuOpen(false);
                }}
                className="space-y-1 rounded-md bg-danger-soft p-1.5"
              >
                <input type="hidden" name="id" value={view.id} />
                <input type="hidden" name="path" value={basePath} />
                <p className="px-1 text-[11px] text-danger">¿Eliminar &quot;{view.name}&quot;?</p>
                <div className="flex gap-1">
                  <button type="button" onClick={() => setConfirmingDelete(false)} className="flex-1 rounded px-1.5 py-1 text-muted hover:bg-subtle">Cancelar</button>
                  <button type="submit" className="flex-1 rounded bg-danger px-1.5 py-1 text-white">Eliminar</button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => (isLastView ? null : setConfirmingDelete(true))}
                disabled={isLastView}
                title={isLastView ? "No puedes eliminar la última vista del módulo." : undefined}
                className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-danger hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Trash2 className="size-3" /> Eliminar
              </button>
            )
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ViewSwitcher({
  views,
  activeViewId,
  currentUserId,
  currentUserRole,
  module,
  basePath,
  orgUsers = [],
  pendingChanges,
}: {
  views: SavedView[];
  activeViewId: number | null;
  currentUserId: number;
  currentUserRole: Role;
  module: ConfigModule;
  basePath: string;
  orgUsers?: { id: number; name: string }[];
  pendingChanges?: PendingChanges;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [navTarget, setNavTarget] = useState<SavedView | null>(null);
  const [, reorderAction] = useActionState<ActionState, FormData>(reorderSharedViews, null);
  const canOrgScope = hasRole(currentUserRole, ["administrator"]);

  function goTo(view: SavedView) {
    rememberLastView(module, view.id);
    const url = new URL(window.location.href);
    url.searchParams.set("view", String(view.id));
    url.searchParams.delete("quick");
    url.searchParams.delete("filters");
    router.push(`${url.pathname}?${url.searchParams.toString()}`);
  }

  function requestNavigate(view: SavedView) {
    if (view.id === activeViewId) return;
    if (pendingChanges && pendingChanges.status !== "clean") {
      setNavTarget(view);
      return;
    }
    goTo(view);
  }

  function handleReorder(orderedIds: (number | string)[]) {
    const fd = new FormData();
    fd.set("module", module);
    fd.set("path", basePath);
    fd.set("orderedIds", orderedIds.join(","));
    reorderAction(fd);
  }

  return (
    <div className="group mb-4 flex flex-wrap items-center gap-1 overflow-x-auto rounded-lg border border-edge bg-surface p-1 shadow-card">
      <DragList
        className="flex flex-row flex-wrap gap-1 space-y-0"
        items={views.map((v) => ({ ...v, id: v.id }))}
        onReorder={handleReorder}
        renderItem={(view) => (
          <ViewTab
            view={view}
            active={view.id === activeViewId}
            currentUserId={currentUserId}
            currentUserRole={currentUserRole}
            basePath={basePath}
            orgUsers={orgUsers}
            isLastView={views.length <= 1}
            onRequestNavigate={requestNavigate}
          />
        )}
      />
      {creating ? (
        <ViewCreateForm module={module} basePath={basePath} canOrgScope={canOrgScope} onClose={() => setCreating(false)} />
      ) : (
        <button type="button" onClick={() => setCreating(true)} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-subtle hover:text-fg">
          <Plus className="size-4" /> Vista
        </button>
      )}

      {navTarget && pendingChanges ? (
        <UnsavedChangesPrompt
          viewName={views.find((v) => v.id === activeViewId)?.name ?? ""}
          status={pendingChanges.status}
          canEditDirectly={pendingChanges.canEditDirectly}
          onSave={() => { pendingChanges.save(); goTo(navTarget); setNavTarget(null); }}
          onSaveAsNew={() => { pendingChanges.saveAsNewPersonal(`${navTarget.name} (mía)`); goTo(navTarget); setNavTarget(null); }}
          onDiscard={() => { pendingChanges.discard(); goTo(navTarget); setNavTarget(null); }}
          onCancel={() => setNavTarget(null)}
        />
      ) : null}
    </div>
  );
}
