"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { DragList } from "@/components/drag-list";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import { Badge, buttonDangerClass, buttonSecondaryClass, cx, inputClass, labelClass } from "@/components/ui";
import type { ActionState } from "@/lib/action-result";
import {
  createTicketBillingStatusAction,
  createTicketPriorityAction,
  createTicketStatusAction,
  deleteTicketBillingStatusAction,
  deleteTicketPriorityAction,
  deleteTicketStatusAction,
  duplicateTicketBillingStatusAction,
  duplicateTicketPriorityAction,
  duplicateTicketStatusAction,
  reorderTicketBillingStatusesAction,
  reorderTicketPrioritiesAction,
  reorderTicketStatusesAction,
  setDefaultTicketBillingStatusAction,
  setDefaultTicketPriorityAction,
  setDefaultTicketStatusAction,
  toggleTicketBillingStatusAction,
  toggleTicketPriorityAction,
  toggleTicketStatusAction,
  updateTicketBillingStatusAction,
  updateTicketPriorityAction,
  updateTicketStatusAction,
} from "./catalog-actions";

export type TicketCatalogKind = "status" | "priority" | "billing";

export type TicketCatalogRow = {
  id: number;
  name: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  category?: string;
  level?: number;
  sortOrder: number;
  isActive: boolean;
  isDefault: boolean;
  isSystem: boolean;
  usageCount: number;
};

const ACTIONS: Record<
  TicketCatalogKind,
  {
    create: (p: ActionState, f: FormData) => Promise<ActionState>;
    update: (p: ActionState, f: FormData) => Promise<ActionState>;
    toggle: (p: ActionState, f: FormData) => Promise<ActionState>;
    setDefault: (p: ActionState, f: FormData) => Promise<ActionState>;
    duplicate: (p: ActionState, f: FormData) => Promise<ActionState>;
    reorder: (p: ActionState, f: FormData) => Promise<ActionState>;
    remove: (p: ActionState, f: FormData) => Promise<ActionState>;
  }
> = {
  status: {
    create: createTicketStatusAction,
    update: updateTicketStatusAction,
    toggle: toggleTicketStatusAction,
    setDefault: setDefaultTicketStatusAction,
    duplicate: duplicateTicketStatusAction,
    reorder: reorderTicketStatusesAction,
    remove: deleteTicketStatusAction,
  },
  priority: {
    create: createTicketPriorityAction,
    update: updateTicketPriorityAction,
    toggle: toggleTicketPriorityAction,
    setDefault: setDefaultTicketPriorityAction,
    duplicate: duplicateTicketPriorityAction,
    reorder: reorderTicketPrioritiesAction,
    remove: deleteTicketPriorityAction,
  },
  billing: {
    create: createTicketBillingStatusAction,
    update: updateTicketBillingStatusAction,
    toggle: toggleTicketBillingStatusAction,
    setDefault: setDefaultTicketBillingStatusAction,
    duplicate: duplicateTicketBillingStatusAction,
    reorder: reorderTicketBillingStatusesAction,
    remove: deleteTicketBillingStatusAction,
  },
};

/** Category dropdown labels — status and billing each have their own fixed dispatch set (see lib/ticket-catalogs.ts). */
const CATEGORY_LABELS: Record<TicketCatalogKind, Record<string, string> | null> = {
  status: {
    open: "Abierto",
    in_progress: "En progreso",
    waiting: "En espera",
    resolved: "Resuelto",
    closed: "Cerrado",
    cancelled: "Cancelado",
  },
  billing: {
    not_billable: "No cobrable",
    included: "Incluido en contrato",
    pending: "Pendiente",
    approved: "Aprobado",
    billed: "Facturado",
    rejected: "Rechazado",
  },
  priority: null,
};

function CategoryOrLevelField({ kind, defaultCategory, defaultLevel }: { kind: TicketCatalogKind; defaultCategory?: string; defaultLevel?: number }) {
  if (kind === "priority") {
    return (
      <div className="w-28">
        <label className={labelClass}>Nivel</label>
        <input name="level" type="number" min={0} max={1000} defaultValue={defaultLevel ?? 0} className={inputClass} />
      </div>
    );
  }
  const labels = CATEGORY_LABELS[kind]!;
  return (
    <div className="w-44">
      <label className={labelClass}>Categoría semántica</label>
      <select name="category" defaultValue={defaultCategory ?? Object.keys(labels)[0]} className={inputClass}>
        {Object.entries(labels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
    </div>
  );
}

function CatalogAddForm({ kind, placeholder }: { kind: TicketCatalogKind; placeholder: string }) {
  const [state, formAction] = useActionState<ActionState, FormData>(ACTIONS[kind].create, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={formAction} className="space-y-2 rounded-lg border border-dashed border-edge-strong p-3">
      <FormAlert state={state} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <label className={labelClass}>Nombre</label>
          <input name="name" required placeholder={placeholder} className={inputClass} />
          <FieldError errors={errors.name} />
        </div>
        <div>
          <label className={labelClass}>Color</label>
          <input name="color" type="color" defaultValue="#7c3aed" className="h-9 w-12 cursor-pointer rounded-lg border border-edge bg-surface p-1" />
        </div>
        <div className="w-32">
          <label className={labelClass}>Ícono (opcional)</label>
          <input name="icon" placeholder="ej. Clock" className={inputClass} />
        </div>
        <CategoryOrLevelField kind={kind} />
        <SubmitButton className="h-9">Nuevo</SubmitButton>
      </div>
      <div>
        <label className={labelClass}>Descripción (opcional)</label>
        <input name="description" className={inputClass} />
      </div>
    </form>
  );
}

function EditForm({ kind, row, onDone }: { kind: TicketCatalogKind; row: TicketCatalogRow; onDone: () => void }) {
  const [state, formAction] = useActionState<ActionState, FormData>(ACTIONS[kind].update, null);
  return (
    <form action={formAction} className="mt-2 space-y-2 rounded-lg border border-edge bg-subtle p-3">
      <input type="hidden" name="id" value={row.id} />
      <FormAlert state={state} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-40 flex-1">
          <label className={labelClass}>Nombre</label>
          <input name="name" required defaultValue={row.name} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>Color</label>
          <input name="color" type="color" defaultValue={row.color ?? "#7c3aed"} className="h-9 w-12 cursor-pointer rounded-lg border border-edge bg-surface p-1" />
        </div>
        <div className="w-32">
          <label className={labelClass}>Ícono</label>
          <input name="icon" defaultValue={row.icon ?? ""} placeholder="ej. Clock" className={inputClass} />
        </div>
        <CategoryOrLevelField kind={kind} defaultCategory={row.category} defaultLevel={row.level} />
      </div>
      <div>
        <label className={labelClass}>Descripción</label>
        <input name="description" defaultValue={row.description ?? ""} className={inputClass} />
      </div>
      <div className="flex items-center gap-2">
        <SubmitButton className="h-8">Guardar</SubmitButton>
        <button type="button" onClick={onDone} className={cx(buttonSecondaryClass, "h-8")}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function DeleteDialog({
  kind,
  row,
  candidates,
  onCancel,
}: {
  kind: TicketCatalogKind;
  row: TicketCatalogRow;
  candidates: TicketCatalogRow[];
  onCancel: () => void;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(ACTIONS[kind].remove, null);
  const needsReassign = row.usageCount > 0;
  return (
    <form action={formAction} className="mt-2 space-y-2 rounded-lg border border-danger/30 bg-danger/5 p-3">
      <input type="hidden" name="id" value={row.id} />
      <FormAlert state={state} />
      <p className="text-sm text-fg">
        {needsReassign ? (
          <>
            Este valor está siendo utilizado por <strong>{row.usageCount}</strong> ticket{row.usageCount === 1 ? "" : "s"}.
          </>
        ) : (
          "Este valor no tiene tickets asociados."
        )}
      </p>
      {needsReassign ? (
        <div className="max-w-xs">
          <label className={labelClass}>Reasignar tickets a</label>
          <select name="reassignToId" required defaultValue="" className={inputClass}>
            <option value="" disabled>
              Elegir destino…
            </option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <SubmitButton className={cx(buttonDangerClass, "h-8")}>{needsReassign ? "Reasignar y eliminar" : "Eliminar"}</SubmitButton>
        <button type="button" onClick={onCancel} className={cx(buttonSecondaryClass, "h-8")}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/** Shared menu-row style — mirrors views/view-switcher.tsx's popover menu convention. */
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

function MenuButton({
  onClick,
  disabled,
  disabledReason,
  danger,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  disabledReason?: string;
  danger?: boolean;
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
      {children}
    </button>
  );
}

function MenuSubmitButton({ children }: { children: ReactNode }) {
  return (
    <button type="submit" className={menuItemClass(false, false)}>
      {children}
    </button>
  );
}

function CatalogRow({
  kind,
  row,
  allRows,
}: {
  kind: TicketCatalogKind;
  row: TicketCatalogRow;
  allRows: TicketCatalogRow[];
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState<"menu" | "edit" | "delete">("menu");
  const [toggleState, toggleAction] = useActionState<ActionState, FormData>(ACTIONS[kind].toggle, null);
  const [defaultState, defaultAction] = useActionState<ActionState, FormData>(ACTIONS[kind].setDefault, null);
  const [duplicateState, duplicateAction] = useActionState<ActionState, FormData>(ACTIONS[kind].duplicate, null);
  const categoryLabel = kind !== "priority" && row.category ? CATEGORY_LABELS[kind]?.[row.category] : undefined;
  const reassignCandidates = allRows.filter((r) => r.id !== row.id && r.isActive);

  function closeMenu() {
    setMenuOpen(false);
    setPanel("menu");
  }

  return (
    <li className={cx("rounded-lg border border-edge px-3 py-2.5", !row.isActive && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2">
        {row.color ? (
          <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: row.color }} aria-hidden />
        ) : null}
        <span className="font-medium text-fg">{row.name}</span>
        {kind === "priority" ? <span className="text-xs text-muted">nivel {row.level}</span> : null}
        {categoryLabel ? <Badge tone="slate">{categoryLabel}</Badge> : null}
        <span className="text-xs text-muted">{row.usageCount} ticket{row.usageCount === 1 ? "" : "s"}</span>
        {row.isDefault ? <Badge tone="purple">Predeterminado</Badge> : null}
        {row.isSystem ? <Badge tone="blue">Sistema</Badge> : null}
        {!row.isActive ? <Badge tone="slate">Inactivo</Badge> : null}

        <Popover.Root
          open={menuOpen}
          onOpenChange={(next) => {
            setMenuOpen(next);
            if (!next) setPanel("menu");
          }}
        >
          <Popover.Trigger asChild>
            <button
              ref={triggerRef}
              type="button"
              aria-label={`Más acciones para ${row.name}`}
              className="ml-auto flex size-7 shrink-0 items-center justify-center rounded-md text-muted hover:bg-subtle hover:text-fg"
            >
              ⋯
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              side="bottom"
              align="end"
              sideOffset={6}
              collisionPadding={8}
              avoidCollisions
              onCloseAutoFocus={(e) => {
                e.preventDefault();
                triggerRef.current?.focus();
              }}
              className="z-[70] w-64 rounded-xl border border-edge bg-surface p-1.5 text-xs shadow-overlay outline-none"
            >
              {panel === "edit" ? (
                <EditForm kind={kind} row={row} onDone={closeMenu} />
              ) : panel === "delete" ? (
                <DeleteDialog kind={kind} row={row} candidates={reassignCandidates} onCancel={closeMenu} />
              ) : (
                <div className="space-y-0.5">
                  <MenuButton onClick={() => setPanel("edit")}>Editar</MenuButton>
                  <form action={(fd) => { duplicateAction(fd); closeMenu(); }}>
                    <input type="hidden" name="id" value={row.id} />
                    <MenuSubmitButton>Duplicar</MenuSubmitButton>
                  </form>
                  <form action={(fd) => { toggleAction(fd); closeMenu(); }}>
                    <input type="hidden" name="id" value={row.id} />
                    <MenuSubmitButton>{row.isActive ? "Desactivar" : "Activar"}</MenuSubmitButton>
                  </form>
                  {!row.isDefault ? (
                    <form action={(fd) => { defaultAction(fd); closeMenu(); }}>
                      <input type="hidden" name="id" value={row.id} />
                      <MenuSubmitButton>Definir por defecto</MenuSubmitButton>
                    </form>
                  ) : null}
                  <div className="my-1 border-t border-edge" />
                  <MenuButton
                    onClick={() => setPanel("delete")}
                    disabled={row.isSystem}
                    disabledReason="Los valores del sistema no se pueden eliminar. Puedes desactivarlos."
                    danger
                  >
                    Eliminar
                  </MenuButton>
                </div>
              )}
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
      {row.description ? <p className="mt-1 pl-5 text-xs text-muted">{row.description}</p> : null}
      {toggleState && !toggleState.ok ? <p className="mt-1 text-xs text-danger">{toggleState.message}</p> : null}
      {defaultState && !defaultState.ok ? <p className="mt-1 text-xs text-danger">{defaultState.message}</p> : null}
      {duplicateState && !duplicateState.ok ? <p className="mt-1 text-xs text-danger">{duplicateState.message}</p> : null}
    </li>
  );
}

export function TicketCatalogManager({
  kind,
  items,
  addPlaceholder,
}: {
  kind: TicketCatalogKind;
  items: TicketCatalogRow[];
  addPlaceholder: string;
}) {
  const [query, setQuery] = useState("");
  const [order, setOrder] = useState<number[] | null>(null);
  const [, reorderAction] = useActionState<ActionState, FormData>(ACTIONS[kind].reorder, null);

  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items;
  const rows =
    order != null
      ? [
          ...(order.map((id) => filtered.find((i) => i.id === id)).filter((i): i is TicketCatalogRow => Boolean(i))),
          ...filtered.filter((i) => !order.includes(i.id)),
        ]
      : filtered;

  function handleReorder(orderedIds: (number | string)[]) {
    const ids = orderedIds as number[];
    setOrder(ids);
    const fd = new FormData();
    fd.set("orderedIds", ids.join(","));
    reorderAction(fd);
  }

  return (
    <div className="space-y-3">
      <CatalogAddForm kind={kind} placeholder={addPlaceholder} />
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Buscar…"
        className={cx(inputClass, "h-8 max-w-56 text-sm")}
      />
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{q ? "Sin resultados." : "Sin elementos todavía."}</p>
      ) : (
        <DragList
          items={rows}
          onReorder={handleReorder}
          renderItem={(item) => <CatalogRow kind={kind} row={item} allRows={items} />}
        />
      )}
    </div>
  );
}
