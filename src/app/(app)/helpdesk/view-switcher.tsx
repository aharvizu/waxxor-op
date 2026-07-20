"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Calendar, Copy, LayoutGrid, List, Plus, Star, Table2, Trash2, Users, GanttChartSquare } from "lucide-react";
import { DragList } from "@/components/drag-list";
import { FormAlert } from "@/components/form-feedback";
import { cx, inputClass } from "@/components/ui";
import type { ActionState } from "@/lib/action-result";
import type { SavedView, ViewType } from "@/lib/views";
import {
  createTicketView,
  deleteTicketView,
  duplicateTicketView,
  renameTicketView,
  reorderTicketViews,
  setDefaultTicketView,
  toggleTicketViewFavorite,
  toggleTicketViewShare,
} from "./views-actions";

const VIEW_ICONS: Record<ViewType, typeof List> = {
  list: List,
  table: Table2,
  kanban: LayoutGrid,
  calendar: Calendar,
  timeline: GanttChartSquare,
};

function ViewCreateForm({ onClose }: { onClose: () => void }) {
  const [state, formAction] = useActionState<ActionState, FormData>(createTicketView, null);
  return (
    <form
      action={(fd) => {
        formAction(fd);
        onClose();
      }}
      className="flex items-center gap-2 rounded-lg border border-edge bg-surface p-2 shadow-overlay"
    >
      <FormAlert state={state} />
      <input name="name" required placeholder="Nombre de la vista" className={cx(inputClass, "h-8 w-40 text-xs")} autoFocus />
      <select name="viewType" defaultValue="table" className={cx(inputClass, "h-8 w-auto text-xs")}>
        <option value="list">Lista</option>
        <option value="table">Tabla</option>
        <option value="kanban">Kanban</option>
        <option value="calendar">Calendario</option>
        <option value="timeline">Timeline</option>
      </select>
      <button type="submit" className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-white hover:bg-primary-hover">
        Crear
      </button>
    </form>
  );
}

function ViewTab({ view, active, currentUserId }: { view: SavedView; active: boolean; currentUserId: number }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [, favAction] = useActionState<ActionState, FormData>(toggleTicketViewFavorite, null);
  const [, shareAction] = useActionState<ActionState, FormData>(toggleTicketViewShare, null);
  const [, defaultAction] = useActionState<ActionState, FormData>(setDefaultTicketView, null);
  const [, dupAction] = useActionState<ActionState, FormData>(duplicateTicketView, null);
  const [, deleteAction] = useActionState<ActionState, FormData>(deleteTicketView, null);
  const [renaming, setRenaming] = useState(false);
  const [, renameAction] = useActionState<ActionState, FormData>(renameTicketView, null);

  const Icon = VIEW_ICONS[view.viewType];
  const isOwner = view.userId === currentUserId;

  function selectView() {
    const url = new URL(window.location.href);
    url.searchParams.set("view", String(view.id));
    url.searchParams.delete("quick");
    url.searchParams.delete("filters");
    router.push(`${url.pathname}?${url.searchParams.toString()}`);
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
        <input name="name" defaultValue={view.name} autoFocus className={cx(inputClass, "h-7 w-28 text-xs")} onBlur={(e) => e.currentTarget.form?.requestSubmit()} />
      </form>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={selectView}
        onDoubleClick={() => isOwner && setRenaming(true)}
        aria-current={active ? "page" : undefined}
        className={cx(
          "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors",
          active ? "bg-primary-soft text-primary" : "text-muted hover:bg-subtle hover:text-fg",
        )}
      >
        <Icon className="size-3.5" />
        {view.name}
        {view.isFavorite ? <Star className="size-3 fill-amber-400 text-amber-400" /> : null}
        {view.sharedWithTeam ? <Users className="size-3 text-faint" /> : null}
      </button>
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        className="absolute -right-3 -top-1 hidden size-4 items-center justify-center rounded-full bg-subtle text-[10px] text-faint group-hover:flex"
      >
        ⋯
      </button>
      {menuOpen ? (
        <div className="absolute top-9 left-0 z-20 w-44 space-y-0.5 rounded-lg border border-edge bg-surface p-1.5 text-xs shadow-overlay">
          <form action={favAction}>
            <input type="hidden" name="id" value={view.id} />
            <button type="submit" className="w-full rounded-md px-2 py-1.5 text-left hover:bg-subtle">{view.isFavorite ? "Quitar favorito" : "Marcar favorita"}</button>
          </form>
          {isOwner ? (
            <>
              <button type="button" onClick={() => { setRenaming(true); setMenuOpen(false); }} className="w-full rounded-md px-2 py-1.5 text-left hover:bg-subtle">Renombrar</button>
              <form action={defaultAction}>
                <input type="hidden" name="id" value={view.id} />
                <button type="submit" className="w-full rounded-md px-2 py-1.5 text-left hover:bg-subtle">Definir por defecto</button>
              </form>
              <form action={shareAction}>
                <input type="hidden" name="id" value={view.id} />
                <button type="submit" className="w-full rounded-md px-2 py-1.5 text-left hover:bg-subtle">{view.sharedWithTeam ? "Dejar de compartir" : "Compartir con equipo"}</button>
              </form>
            </>
          ) : null}
          <form action={dupAction}>
            <input type="hidden" name="id" value={view.id} />
            <button type="submit" className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left hover:bg-subtle"><Copy className="size-3" /> Duplicar</button>
          </form>
          {isOwner ? (
            <form action={deleteAction}>
              <input type="hidden" name="id" value={view.id} />
              <button type="submit" className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-danger hover:bg-danger-soft"><Trash2 className="size-3" /> Eliminar</button>
            </form>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function ViewSwitcher({ views, activeViewId, currentUserId }: { views: SavedView[]; activeViewId: number | null; currentUserId: number }) {
  const [creating, setCreating] = useState(false);
  const [, reorderAction] = useActionState<ActionState, FormData>(reorderTicketViews, null);

  function handleReorder(orderedIds: (number | string)[]) {
    const fd = new FormData();
    fd.set("orderedIds", orderedIds.join(","));
    reorderAction(fd);
  }

  return (
    <div className="group mb-4 flex flex-wrap items-center gap-1 rounded-lg border border-edge bg-surface p-1 shadow-card">
      <DragList
        className="flex flex-row flex-wrap gap-1 space-y-0"
        items={views.map((v) => ({ ...v, id: v.id }))}
        onReorder={handleReorder}
        renderItem={(view) => <ViewTab view={view} active={view.id === activeViewId} currentUserId={currentUserId} />}
      />
      {creating ? (
        <ViewCreateForm onClose={() => setCreating(false)} />
      ) : (
        <button type="button" onClick={() => setCreating(true)} className="flex items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-subtle hover:text-fg">
          <Plus className="size-4" /> Vista
        </button>
      )}
    </div>
  );
}
