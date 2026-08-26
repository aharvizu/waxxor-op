"use client";

import { useActionState, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, Copy, Download, Lock, LayoutGrid, List, Plus, Star, Table2, Trash2, UserCog, Users } from "lucide-react";
import { DragList } from "@/components/drag-list";
import { FormAlert } from "@/components/form-feedback";
import { SearchableSelect } from "@/components/searchable-select";
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
 * (consolidated 2026-07-22, menu floated via Radix Popover 2026-07-23),
 * used identically by every module wired to it. Calendar/Timeline are out
 * of scope for creation but keep their icon slot so pre-existing data of
 * those types still renders correctly.
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

/** Up/Down arrow roving focus across the popover's top-level action
 * buttons ("navegación con flechas") — plain buttons and form submit
 * buttons alike; Tab/Shift+Tab and Enter keep their native behavior. */
function handleMenuArrowNav(e: React.KeyboardEvent<HTMLDivElement>) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const root = e.currentTarget;
  const focusables = Array.from(root.querySelectorAll<HTMLButtonElement>("button:not(:disabled)"));
  if (focusables.length === 0) return;
  e.preventDefault();
  const current = focusables.indexOf(document.activeElement as HTMLButtonElement);
  const next = e.key === "ArrowDown" ? (current + 1) % focusables.length : (current - 1 + focusables.length) % focusables.length;
  focusables[next]?.focus();
}

/** Shared visual style for every menu row — disabled rows stay in the DOM
 * (never hidden) with a title/aria reason, per "las opciones no disponibles
 * deberán mostrarse deshabilitadas con una explicación accesible". */
function menuItemClass(disabled: boolean | undefined, danger: boolean | undefined) {
  return cx(
    "flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
    disabled
      ? "cursor-not-allowed text-faint opacity-50"
      : danger
        ? "text-danger hover:bg-danger-soft"
        : "text-fg hover:bg-subtle",
  );
}

/** A plain (type="button") menu row. */
function MenuButton({
  onClick,
  disabled,
  disabledReason,
  danger,
  icon,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
  danger?: boolean;
  icon?: ReactNode;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={disabled ? disabledReason : undefined}
      aria-disabled={disabled}
      className={menuItemClass(disabled, danger)}
    >
      {icon}
      <span className="flex-1">{children}</span>
    </button>
  );
}

/** A form-submit menu row (Favorito/Predeterminada) — must be the form's
 * only interactive element, so it can't be nested inside MenuButton's own
 * <button> (buttons can't nest in valid HTML). */
function MenuSubmitButton({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <button type="submit" className={menuItemClass(false, false)}>
      {icon}
      <span className="flex-1">{children}</span>
    </button>
  );
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
      className="flex flex-wrap items-center gap-2 rounded-lg border border-edge bg-surface p-2 shadow-overlay"
    >
      <input type="hidden" name="module" value={module} />
      <input type="hidden" name="path" value={basePath} />
      <FormAlert state={state} />
      <input name="name" required placeholder="Nombre de la vista" className={cx(inputClass, "h-8 w-full text-xs sm:w-40")} autoFocus />
      <SearchableSelect
        name="viewType"
        defaultValue="table"
        className="h-8 w-auto text-xs"
        options={[
          { value: "list", label: "Lista" },
          { value: "table", label: "Tabla" },
          { value: "kanban", label: "Kanban" },
        ]}
      />
      <SearchableSelect
        name="scope"
        defaultValue="personal"
        className="h-8 w-auto text-xs"
        options={[
          { value: "personal", label: "Personal" },
          { value: "team", label: "Equipo" },
          ...(canOrgScope ? [{ value: "organization", label: "Organización" }] : []),
        ]}
      />
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
  const triggerRef = useRef<HTMLButtonElement>(null);
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
  const isSystem = view.scope === "system";
  const isShared = view.scope !== "personal";
  const ownerLabel = isSystem ? "Sistema" : view.userId === currentUserId ? "Tú" : orgUsers.find((u) => u.id === view.userId)?.name ?? "—";
  const readOnlyReason = isSystem ? "Vista del Sistema · solo lectura" : "Solo el propietario o un administrador pueden editar esta vista";

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

  function closeMenu() {
    setMenuOpen(false);
    setPanel("none");
    setConfirmingDelete(false);
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

      <Popover.Root
        open={menuOpen}
        onOpenChange={(next) => {
          setMenuOpen(next);
          if (!next) {
            setPanel("none");
            setConfirmingDelete(false);
          }
        }}
      >
        <Popover.Trigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-label={`Más acciones para la vista ${view.name}`}
            className="absolute -right-3 -top-1 flex size-4 items-center justify-center rounded-full bg-subtle text-[10px] text-faint md:hidden md:group-hover:flex md:data-[state=open]:flex"
          >
            ⋯
          </button>
        </Popover.Trigger>

        {/* Portal renders into document.body — escapes the tab bar's
            overflow-x-auto clipping and any stacking context entirely.
            side="bottom" + collisionPadding lets Radix (built on
            Floating UI) flip above / clamp to the viewport automatically. */}
        <Popover.Portal>
          <Popover.Content
            side="bottom"
            align="end"
            sideOffset={6}
            collisionPadding={8}
            avoidCollisions
            onKeyDown={handleMenuArrowNav}
            onCloseAutoFocus={(e) => {
              // Radix restores focus by default; we just make sure it lands
              // back on the ⋯ trigger, not somewhere stale.
              e.preventDefault();
              triggerRef.current?.focus();
            }}
            className="z-[70] w-[290px] max-w-[340px] max-h-[min(28rem,80vh)] overflow-y-auto rounded-xl border border-edge bg-surface p-1.5 text-xs shadow-overlay outline-none"
          >
            {panel === "edit" ? (
              <EditViewForm view={view} basePath={basePath} canOrgScope={canOrgScope} onClose={() => setPanel("none")} />
            ) : panel === "share" ? (
              <ShareForm view={view} basePath={basePath} canOrgScope={canOrgScope} onClose={() => setPanel("none")} />
            ) : panel === "transfer" ? (
              <TransferOwnerForm view={view} basePath={basePath} orgUsers={orgUsers} onClose={() => setPanel("none")} />
            ) : (
              <div className="space-y-0.5">
                {isShared ? (
                  <div className="mb-1 border-b border-edge px-2.5 py-1.5 text-[11px] text-faint">
                    {isSystem ? "Sistema · solo lectura" : `${SCOPE_LABEL[view.scope]} · propietario ${ownerLabel} · ${canEdit ? "editable" : "solo lectura"}`}
                  </div>
                ) : null}

                <form action={favAction}>
                  <input type="hidden" name="id" value={view.id} />
                  <input type="hidden" name="path" value={basePath} />
                  <MenuSubmitButton icon={<Star className={cx("size-3.5", view.isFavorite && "fill-amber-400 text-amber-400")} />}>
                    {view.isFavorite ? "Quitar favorito" : "Marcar favorita"}
                  </MenuSubmitButton>
                </form>

                <form action={defaultAction}>
                  <input type="hidden" name="id" value={view.id} />
                  <input type="hidden" name="path" value={basePath} />
                  <MenuSubmitButton>Definir por defecto</MenuSubmitButton>
                </form>

                <MenuButton onClick={() => setPanel("edit")} disabled={!canEdit} disabledReason={readOnlyReason}>
                  Editar vista
                </MenuButton>
                <MenuButton onClick={() => { setRenaming(true); closeMenu(); }} disabled={!canEdit} disabledReason={readOnlyReason}>
                  Renombrar
                </MenuButton>

                <form action={dupAction}>
                  <input type="hidden" name="id" value={view.id} />
                  <input type="hidden" name="path" value={basePath} />
                  <MenuSubmitButton icon={<Copy className="size-3.5" />}>Duplicar</MenuSubmitButton>
                </form>

                <MenuButton onClick={() => setPanel("share")} disabled={!canEdit || isSystem} disabledReason={readOnlyReason}>
                  Compartir
                </MenuButton>
                <MenuButton
                  onClick={() => setPanel("transfer")}
                  disabled={!canEdit || isSystem || view.scope === "organization"}
                  disabledReason={isSystem || view.scope === "organization" ? "Esta vista no tiene un propietario individual" : readOnlyReason}
                  icon={<UserCog className="size-3.5" />}
                >
                  Cambiar propietario
                </MenuButton>

                <MenuButton onClick={() => { exportViewConfig(view); closeMenu(); }} icon={<Download className="size-3.5" />}>
                  Exportar configuración
                </MenuButton>

                <div className="my-1 border-t border-edge" />

                {confirmingDelete ? (
                  <form
                    action={(fd) => {
                      deleteAction(fd);
                      setConfirmingDelete(false);
                      setMenuOpen(false);
                    }}
                    className="space-y-1.5 rounded-md bg-danger-soft p-2"
                  >
                    <input type="hidden" name="id" value={view.id} />
                    <input type="hidden" name="path" value={basePath} />
                    <p className="px-0.5 text-[11px] text-danger">¿Eliminar &quot;{view.name}&quot;? Esta acción no se puede deshacer.</p>
                    <div className="flex gap-1.5">
                      <button type="button" onClick={() => setConfirmingDelete(false)} className="flex-1 rounded-md px-2 py-1 text-muted hover:bg-subtle">Cancelar</button>
                      <button type="submit" className="flex-1 rounded-md bg-danger px-2 py-1 font-medium text-white hover:bg-danger/90">Eliminar</button>
                    </div>
                  </form>
                ) : (
                  <MenuButton
                    onClick={() => setConfirmingDelete(true)}
                    disabled={!canEdit || isSystem || isLastView}
                    disabledReason={isSystem ? readOnlyReason : isLastView ? "No puedes eliminar la última vista del módulo" : readOnlyReason}
                    danger
                    icon={<Trash2 className="size-3.5" />}
                  >
                    Eliminar
                  </MenuButton>
                )}
              </div>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
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
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [navTarget, setNavTarget] = useState<SavedView | null>(null);
  const [, reorderAction] = useActionState<ActionState, FormData>(reorderSharedViews, null);
  const canOrgScope = hasRole(currentUserRole, ["administrator"]);
  const activeView = views.find((v) => v.id === activeViewId) ?? views[0];
  const ActiveIcon = activeView ? VIEW_ICONS[activeView.viewType] ?? Table2 : Table2;

  // Desktop overflow ("Más"): how many tabs fit in one row is measured
  // against an invisible clone of the same tabs (below) instead of guessed,
  // so it stays correct across icons/badges/locale without hardcoded widths.
  const [visibleCount, setVisibleCount] = useState(views.length);
  const overflowContainerRef = useRef<HTMLDivElement>(null);
  const createMeasureRef = useRef<HTMLButtonElement>(null);
  const moreMeasureRef = useRef<HTMLButtonElement>(null);
  const tabMeasureRefs = useRef<(HTMLDivElement | null)[]>([]);

  useLayoutEffect(() => {
    const container = overflowContainerRef.current;
    if (!container) return;
    const GAP = 4; // Tailwind gap-1

    function recompute() {
      const available = container!.clientWidth;
      const createWidth = (createMeasureRef.current?.offsetWidth ?? 0) + GAP;
      const moreWidth = (moreMeasureRef.current?.offsetWidth ?? 0) + GAP;
      const tabWidths = tabMeasureRefs.current.map((el) => (el?.offsetWidth ?? 0) + GAP);

      const fitCount = (reserved: number) => {
        let used = createWidth + reserved;
        let count = 0;
        for (const w of tabWidths) {
          used += w;
          if (used > available) break;
          count++;
        }
        return count;
      };

      const withoutMore = fitCount(0);
      setVisibleCount(withoutMore >= views.length ? views.length : fitCount(moreWidth));
    }

    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(container);
    return () => observer.disconnect();
  }, [views]);

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
    <div className="mb-4">
      {/* Desktop / tablet: ClickUp-style single row — tabs that fit are
          shown directly; the rest (plus a reorder handle for all of them)
          live behind "Más" instead of wrapping the bar onto several rows. */}
      <div className="relative hidden md:block">
        <div
          ref={overflowContainerRef}
          className="group flex flex-nowrap items-center gap-1 overflow-hidden rounded-lg border border-edge bg-surface p-1 shadow-card"
        >
          {views.slice(0, visibleCount).map((view) => (
            <ViewTab
              key={view.id}
              view={view}
              active={view.id === activeViewId}
              currentUserId={currentUserId}
              currentUserRole={currentUserRole}
              basePath={basePath}
              orgUsers={orgUsers}
              isLastView={views.length <= 1}
              onRequestNavigate={requestNavigate}
            />
          ))}

          {visibleCount < views.length ? (
            <Popover.Root open={moreOpen} onOpenChange={setMoreOpen}>
              <Popover.Trigger asChild>
                <button
                  type="button"
                  className="flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-sm text-muted hover:bg-subtle hover:text-fg"
                >
                  Más
                  <span className="tabular-nums text-faint">{views.length - visibleCount}</span>
                  <ChevronDown className="size-3.5" />
                </button>
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  side="bottom"
                  align="start"
                  sideOffset={6}
                  collisionPadding={8}
                  avoidCollisions
                  className="z-[70] max-h-[min(28rem,70vh)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-edge bg-surface p-1.5 shadow-overlay outline-none"
                >
                  <p className="mb-1 px-2 py-1 text-[11px] font-semibold tracking-wide text-faint uppercase">
                    Todas las vistas — arrastra para reordenar
                  </p>
                  <DragList
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
                        onRequestNavigate={(v) => {
                          setMoreOpen(false);
                          requestNavigate(v);
                        }}
                      />
                    )}
                  />
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          ) : null}

          {creating ? (
            <ViewCreateForm module={module} basePath={basePath} canOrgScope={canOrgScope} onClose={() => setCreating(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-sm text-muted hover:bg-subtle hover:text-fg"
            >
              <Plus className="size-4" /> Vista
            </button>
          )}
        </div>

        {/* Invisible clones used only to measure natural tab/button widths
            for the overflow calc above — out of flow (absolute) and hidden
            from layout/a11y (visibility:hidden), never interactive. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 flex flex-nowrap items-center gap-1 p-1"
          style={{ visibility: "hidden" }}
        >
          <button ref={createMeasureRef} type="button" tabIndex={-1} className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-sm">
            <Plus className="size-4" /> Vista
          </button>
          <button ref={moreMeasureRef} type="button" tabIndex={-1} className="flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1.5 text-sm">
            Más <span className="tabular-nums">{views.length}</span>
            <ChevronDown className="size-3.5" />
          </button>
          {views.map((view, i) => (
            <div key={view.id} ref={(el) => { tabMeasureRefs.current[i] = el; }}>
              <ViewTab
                view={view}
                active={false}
                currentUserId={currentUserId}
                currentUserRole={currentUserRole}
                basePath={basePath}
                orgUsers={orgUsers}
                isLastView={views.length <= 1}
                onRequestNavigate={() => {}}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Mobile: current view as a single compact chip that opens a
          scrollable vertical sheet — the horizontal tab bar above wraps
          onto many rows and eats the whole screen at narrow widths, so
          it's swapped for this instead of just shrinking it. */}
      <Popover.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <div className="flex items-center gap-1.5 md:hidden">
          <Popover.Trigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg border border-edge bg-surface px-3 py-2 text-sm font-medium text-fg shadow-card"
            >
              <ActiveIcon className="size-4 shrink-0 text-muted" />
              <span className="truncate">{activeView?.name ?? "Vistas"}</span>
              {activeView?.isFavorite ? <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" /> : null}
              <span className="ml-auto shrink-0 text-xs tabular-nums text-faint">{views.length}</span>
              <ChevronDown className="size-4 shrink-0 text-faint" />
            </button>
          </Popover.Trigger>
          <button
            type="button"
            onClick={() => {
              setCreating(true);
              setMobileOpen(true);
            }}
            aria-label="Nueva vista"
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-edge bg-surface text-muted shadow-card hover:bg-subtle hover:text-fg"
          >
            <Plus className="size-4" />
          </button>
        </div>

        <Popover.Portal>
          <Popover.Content
            side="bottom"
            align="start"
            sideOffset={6}
            collisionPadding={12}
            avoidCollisions
            className="z-[70] max-h-[min(26rem,70vh)] w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-edge bg-surface p-1.5 shadow-overlay outline-none"
          >
            <DragList
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
                  onRequestNavigate={(v) => {
                    setMobileOpen(false);
                    requestNavigate(v);
                  }}
                />
              )}
            />
            {creating ? (
              <div className="mt-1 border-t border-edge pt-1.5">
                <ViewCreateForm module={module} basePath={basePath} canOrgScope={canOrgScope} onClose={() => setCreating(false)} />
              </div>
            ) : null}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>

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
