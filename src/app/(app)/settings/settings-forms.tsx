"use client";

import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { Modal } from "@/components/modal";
import { SearchableSelect } from "@/components/searchable-select";
import { SubmitButton } from "@/components/submit-button";
import {
  Badge,
  buttonClass,
  buttonDangerClass,
  buttonSecondaryClass,
  cx,
  inputClass,
  labelClass,
} from "@/components/ui";
import type { ActionState } from "@/lib/action-result";
import type { CatalogItemRow } from "@/lib/settings-data";
import { useLocale } from "@/components/locale-provider";
import { t } from "@/lib/i18n";
import { MenuButton, MenuSubmitButton } from "./tickets/catalog-manager";
import {
  createApiKey,
  createCatalogItem,
  deleteCatalogItem,
  inviteUser,
  regenerateInvitation,
  revokeApiKey,
  saveOrganizationSetting,
  setUserActive,
  toggleCatalogItem,
  updateCatalogItem,
} from "./actions";

/* ------------------------------------------------------------------ */
/* Generic KV-section form                                             */
/* ------------------------------------------------------------------ */

export function SettingSectionForm({
  settingKey,
  children,
  submitLabel,
}: {
  settingKey: string;
  children: ReactNode;
  submitLabel?: string;
}) {
  const locale = useLocale();
  const [state, formAction] = useActionState<ActionState, FormData>(saveOrganizationSetting, null);
  return (
    <form action={formAction} className="space-y-4">
      <FormAlert state={state} />
      <input type="hidden" name="settingKey" value={settingKey} />
      {children}
      <SubmitButton>{submitLabel ?? t("Guardar cambios", "Save changes", locale)}</SubmitButton>
    </form>
  );
}

/** Exposes field errors from the surrounding SettingSectionForm state — kept simple:
 * section schemas mostly validate formats, so the FormAlert carries the message. */

/* ------------------------------------------------------------------ */
/* Catalog manager                                                     */
/* ------------------------------------------------------------------ */

function CatalogAddForm({
  kind,
  parentId,
  placeholder,
  withColor,
  withTemplateLists,
}: {
  kind: string;
  parentId?: number;
  placeholder: string;
  withColor?: boolean;
  withTemplateLists?: boolean;
}) {
  const locale = useLocale();
  const [state, formAction] = useActionState<ActionState, FormData>(createCatalogItem, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={formAction} className="space-y-2">
      <FormAlert state={state} />
      <input type="hidden" name="kind" value={kind} />
      {parentId ? <input type="hidden" name="parentId" value={parentId} /> : null}
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-40 flex-1">
          <input name="name" required placeholder={placeholder} className={inputClass} />
          <FieldError errors={errors.name} />
        </div>
        {withColor ? (
          <input
            name="color"
            type="color"
            defaultValue="#7c3aed"
            title="Color"
            className="h-9 w-12 cursor-pointer rounded-lg border border-edge bg-surface p-1"
          />
        ) : null}
        <SubmitButton className="h-9">{t("Agregar", "Add", locale)}</SubmitButton>
      </div>
      {withTemplateLists ? (
        <div>
          <label className={labelClass}>
            {t("Listas de la plantilla (una por línea)", "Template lists (one per line)", locale)}
          </label>
          <textarea
            name="templateLists"
            rows={3}
            placeholder={t("Planeación\nEjecución\nCierre", "Planning\nExecution\nClosing", locale)}
            className={inputClass}
          />
          <FieldError errors={errors.templateLists} />
        </div>
      ) : null}
    </form>
  );
}


/**
 * Full manager for one catalog kind: add form, active/archived rows, optional
 * subcategory tree (one level, mirrors ticket category → subcategory).
 * Rows are single-line with a "⋯" popover for edit/archive/delete (same
 * compact pattern as TicketCatalogManager's CatalogRow, settings/tickets/
 * catalog-manager.tsx) — a long catalog like Tipos de trabajo (17+ items)
 * used to render 17 permanently-open edit forms at once; this shows one
 * line per item until you actually need to change something (2026-07-31).
 */
export function CatalogManager({
  kind,
  items,
  hasChildren,
  childLabel,
  canDelete,
  withColor,
  withTemplateLists,
  addPlaceholder,
}: {
  kind: string;
  items: CatalogItemRow[];
  hasChildren: boolean;
  childLabel: string | null;
  canDelete: boolean;
  withColor?: boolean;
  withTemplateLists?: boolean;
  addPlaceholder: string;
}) {
  const locale = useLocale();
  const roots = items.filter((i) => i.parentId === null);
  const childrenOf = (id: number) => items.filter((i) => i.parentId === id);

  return (
    <div className="space-y-3">
      <CatalogAddForm
        kind={kind}
        placeholder={addPlaceholder}
        withColor={withColor}
        withTemplateLists={withTemplateLists}
      />
      {roots.length === 0 ? (
        <p className="text-sm text-muted">{t("Sin elementos todavía.", "No items yet.", locale)}</p>
      ) : (
        <ul className="divide-y divide-edge rounded-lg border border-edge">
          {roots.map((item) => (
            <CatalogRow
              key={item.id}
              item={item}
              childItems={hasChildren ? childrenOf(item.id) : []}
              hasChildren={hasChildren}
              childLabel={childLabel}
              canDelete={canDelete}
              kind={kind}
              withColor={withColor}
              withTemplateLists={withTemplateLists}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CatalogEditForm({
  item,
  withColor,
  withTemplateLists,
  onDone,
}: {
  item: CatalogItemRow;
  withColor?: boolean;
  withTemplateLists?: boolean;
  onDone: () => void;
}) {
  const locale = useLocale();
  const [state, formAction] = useActionState<ActionState, FormData>(updateCatalogItem, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const config = (item.config ?? null) as { lists?: string[] } | null;
  return (
    <form action={formAction} className="space-y-2 p-1">
      <input type="hidden" name="id" value={item.id} />
      <FormAlert state={state} />
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <label className={labelClass}>{t("Nombre", "Name", locale)}</label>
          <input name="name" defaultValue={item.name} required className={inputClass} />
          <FieldError errors={errors.name} />
        </div>
        {withColor ? (
          <input
            name="color"
            type="color"
            defaultValue={item.color ?? "#7c3aed"}
            title="Color"
            className="h-9 w-12 shrink-0 cursor-pointer rounded-lg border border-edge bg-surface p-1"
          />
        ) : null}
      </div>
      {withTemplateLists ? (
        <div>
          <label className={labelClass}>
            {t("Listas de la plantilla (una por línea)", "Template lists (one per line)", locale)}
          </label>
          <textarea
            name="templateLists"
            rows={3}
            defaultValue={config?.lists?.join("\n") ?? ""}
            className={inputClass}
          />
          <FieldError errors={errors.templateLists} />
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <SubmitButton className="h-8">{t("Guardar", "Save", locale)}</SubmitButton>
        <button type="button" onClick={onDone} className={cx(buttonSecondaryClass, "h-8")}>
          {t("Cancelar", "Cancel", locale)}
        </button>
      </div>
    </form>
  );
}

function CatalogRowMenu({
  item,
  canDelete,
  withColor,
  withTemplateLists,
}: {
  item: CatalogItemRow;
  canDelete: boolean;
  withColor?: boolean;
  withTemplateLists?: boolean;
}) {
  const locale = useLocale();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [toggleState, toggleAction] = useActionState<ActionState, FormData>(toggleCatalogItem, null);
  const [deleteState, deleteAction] = useActionState<ActionState, FormData>(deleteCatalogItem, null);

  function closeMenu() {
    setMenuOpen(false);
    setEditing(false);
  }

  return (
    <>
      <Popover.Root
        open={menuOpen}
        onOpenChange={(next) => {
          setMenuOpen(next);
          if (!next) setEditing(false);
        }}
      >
        <Popover.Trigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-label={t(`Más acciones para ${item.name}`, `More actions for ${item.name}`, locale)}
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
            {editing ? (
              <CatalogEditForm item={item} withColor={withColor} withTemplateLists={withTemplateLists} onDone={closeMenu} />
            ) : (
              <div className="space-y-0.5">
                <MenuButton onClick={() => setEditing(true)}>{t("Editar", "Edit", locale)}</MenuButton>
                <form action={(fd) => { toggleAction(fd); closeMenu(); }}>
                  <input type="hidden" name="id" value={item.id} />
                  <MenuSubmitButton>
                    {item.isActive ? t("Archivar", "Archive", locale) : t("Restaurar", "Restore", locale)}
                  </MenuSubmitButton>
                </form>
                {canDelete ? (
                  <>
                    <div className="my-1 border-t border-edge" />
                    <form action={(fd) => { deleteAction(fd); closeMenu(); }}>
                      <input type="hidden" name="id" value={item.id} />
                      <MenuSubmitButton danger>{t("Eliminar", "Delete", locale)}</MenuSubmitButton>
                    </form>
                  </>
                ) : null}
              </div>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {toggleState && !toggleState.ok ? <p className="mt-1 text-xs text-danger">{toggleState.message}</p> : null}
      {deleteState && !deleteState.ok ? <p className="mt-1 text-xs text-danger">{deleteState.message}</p> : null}
    </>
  );
}

function CatalogRow({
  item,
  childItems,
  hasChildren,
  childLabel,
  canDelete,
  kind,
  withColor,
  withTemplateLists,
}: {
  item: CatalogItemRow;
  childItems: CatalogItemRow[];
  hasChildren: boolean;
  childLabel: string | null;
  canDelete: boolean;
  kind: string;
  withColor?: boolean;
  withTemplateLists?: boolean;
}) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const config = (item.config ?? null) as { lists?: string[] } | null;

  return (
    <li className={cx("px-3 py-2", !item.isActive && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2">
        {hasChildren ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="text-muted hover:text-fg"
            title={
              open
                ? t("Contraer", "Collapse", locale)
                : `${childLabel ?? t("Subelementos", "Subitems", locale)} (${childItems.length})`
            }
          >
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        ) : null}
        {withColor && item.color ? (
          <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: item.color }} aria-hidden />
        ) : null}
        <span className="min-w-0 truncate font-medium text-fg">{item.name}</span>
        {!item.isActive ? <Badge tone="slate">{t("Archivado", "Archived", locale)}</Badge> : null}
        {hasChildren && childItems.length > 0 ? (
          <span className="text-xs text-muted">
            {childItems.length} {childLabel?.toLowerCase() ?? t("subelementos", "subitems", locale)}
          </span>
        ) : null}
        <CatalogRowMenu item={item} canDelete={canDelete} withColor={withColor} withTemplateLists={withTemplateLists} />
      </div>
      {config?.lists ? (
        <p className="mt-1 pl-6 text-xs text-muted">
          {t("Listas", "Lists", locale)}: {config.lists.join(" · ")}
        </p>
      ) : null}
      {hasChildren && open ? (
        <div className="mt-2 space-y-1 border-l border-edge pl-6">
          {childItems.map((child) => (
            <div key={child.id} className={cx("flex flex-wrap items-center gap-2 py-1", !child.isActive && "opacity-60")}>
              <span className="min-w-0 truncate font-medium text-fg">{child.name}</span>
              {!child.isActive ? <Badge tone="slate">{t("Archivado", "Archived", locale)}</Badge> : null}
              <CatalogRowMenu item={child} canDelete={canDelete} />
            </div>
          ))}
          <CatalogAddForm
            kind={kind}
            parentId={item.id}
            placeholder={t(
              `Nueva ${childLabel?.toLowerCase().replace(/s$/, "") ?? "subcategoría"}…`,
              `New ${childLabel?.toLowerCase().replace(/s$/, "") ?? "subcategory"}…`,
              locale,
            )}
          />
        </div>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

export function InviteUserForm({
  roles,
  onSuccess,
}: {
  roles: { value: string; label: string }[];
  onSuccess?: () => void;
}) {
  const locale = useLocale();
  const [state, formAction] = useActionState<ActionState, FormData>(inviteUser, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const id = useId();

  useEffect(() => {
    if (state?.ok) onSuccess?.();
  }, [state, onSuccess]);
  return (
    <form action={formAction} className="space-y-3">
      <FormAlert state={state} />
      <div>
        <label htmlFor={`${id}-name`} className={labelClass}>{t("Nombre", "Name", locale)}</label>
        <input id={`${id}-name`} name="name" required className={inputClass} />
        <FieldError errors={errors.name} />
      </div>
      <div>
        <label htmlFor={`${id}-email`} className={labelClass}>Email</label>
        <input id={`${id}-email`} name="email" type="email" required className={inputClass} />
        <FieldError errors={errors.email} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label htmlFor={`${id}-role`} className={labelClass}>{t("Rol", "Role", locale)}</label>
          <SearchableSelect
            id={`${id}-role`}
            name="role"
            defaultValue="technician"
            options={roles.map((r) => ({ value: r.value, label: r.label }))}
          />
        </div>
        <div>
          <label htmlFor={`${id}-title`} className={labelClass}>
            {t("Puesto (opcional)", "Title (optional)", locale)}
          </label>
          <input id={`${id}-title`} name="title" className={inputClass} />
        </div>
      </div>
      <SubmitButton>{t("Crear invitación", "Create invitation", locale)}</SubmitButton>
      <p className="text-xs text-muted">
        {t(
          "Watson no envía correos: comparte el enlace de invitación que aparecerá en la tabla.",
          "Watson doesn't send emails: share the invitation link that will appear in the table.",
          locale,
        )}
      </p>
    </form>
  );
}

/** Trigger + modal for the Usuarios header — the activation link appears in the table below, not in the form, so the modal can safely close on success. */
export function NewUserButton({ roles }: { roles: { value: string; label: string }[] }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={buttonClass}>
        <Plus className="size-4" />
        {t("Invitar usuario", "Invite user", locale)}
      </button>
      <Modal
        open={open}
        onOpenChange={setOpen}
        title={t("Invitar usuario", "Invite user", locale)}
        description={t(
          "Crea la cuenta y comparte el enlace de activación (Watson no envía correos).",
          "Create the account and share the activation link (Watson doesn't send emails).",
          locale,
        )}
      >
        <InviteUserForm roles={roles} onSuccess={() => setOpen(false)} />
      </Modal>
    </>
  );
}

export function UserActivationControl({
  userId,
  isActive,
  reassignTargets,
}: {
  userId: number;
  isActive: boolean;
  reassignTargets: { id: number; name: string }[];
}) {
  const locale = useLocale();
  const [state, formAction] = useActionState<ActionState, FormData>(setUserActive, null);
  const [confirming, setConfirming] = useState(false);

  if (isActive && !confirming) {
    return (
      <span className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}
        >
          {t("Desactivar…", "Deactivate…", locale)}
        </button>
        {state && !state.ok ? <span className="text-xs text-danger">{state.message}</span> : null}
      </span>
    );
  }

  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={userId} />
      <input type="hidden" name="activate" value={isActive ? "false" : "true"} />
      {isActive ? (
        <>
          <SearchableSelect
            name="reassignToId"
            className="h-7 w-auto text-xs"
            defaultValue=""
            options={[
              { value: "", label: t("Sin reasignar trabajo", "Don't reassign work", locale) },
              ...reassignTargets.map((target) => ({
                value: String(target.id),
                label: t(`Reasignar a ${target.name}`, `Reassign to ${target.name}`, locale),
              })),
            ]}
          />
          <button type="submit" className={cx(buttonDangerClass, "h-7 px-2 text-xs")}>
            {t("Confirmar desactivación", "Confirm deactivation", locale)}
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}
          >
            {t("Cancelar", "Cancel", locale)}
          </button>
        </>
      ) : (
        <button type="submit" className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>
          {t("Activar", "Activate", locale)}
        </button>
      )}
      {state && !state.ok ? <span className="w-full text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

export function RegenerateInvitationButton({ userId }: { userId: number }) {
  const locale = useLocale();
  const [state, formAction] = useActionState<ActionState, FormData>(regenerateInvitation, null);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={userId} />
      <button type="submit" className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>
        {t("Regenerar enlace", "Regenerate link", locale)}
      </button>
      {state && !state.ok ? <span className="ml-2 text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

export function CopyLinkButton({ path }: { path: string }) {
  const locale = useLocale();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}
      onClick={async () => {
        await navigator.clipboard.writeText(`${window.location.origin}${path}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? t("Copiado ✓", "Copied ✓", locale) : t("Copiar enlace", "Copy link", locale)}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* API keys                                                            */
/* ------------------------------------------------------------------ */

export function ApiKeyCreateForm() {
  const locale = useLocale();
  const [state, formAction] = useActionState<ActionState, FormData>(createApiKey, null);
  return (
    <form action={formAction} className="space-y-3">
      {/* The success message carries the one-time plaintext token. */}
      <FormAlert state={state} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <label className={labelClass}>{t("Nombre de la clave", "Key name", locale)}</label>
          <input
            name="name"
            required
            placeholder={t("p. ej. Integración interna", "e.g. Internal integration", locale)}
            className={inputClass}
          />
        </div>
        <SubmitButton>{t("Generar clave", "Generate key", locale)}</SubmitButton>
      </div>
    </form>
  );
}

export function RevokeApiKeyButton({ keyId }: { keyId: number }) {
  const locale = useLocale();
  const [state, formAction] = useActionState<ActionState, FormData>(revokeApiKey, null);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={keyId} />
      <button type="submit" className={cx(buttonDangerClass, "h-7 px-2 text-xs")}>
        {t("Revocar", "Revoke", locale)}
      </button>
      {state && !state.ok ? <span className="ml-2 text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}
