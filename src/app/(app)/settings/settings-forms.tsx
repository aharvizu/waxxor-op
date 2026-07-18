"use client";

import { useActionState, useId, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import {
  Badge,
  buttonDangerClass,
  buttonSecondaryClass,
  cx,
  inputClass,
  labelClass,
} from "@/components/ui";
import type { ActionState } from "@/lib/action-result";
import type { CatalogItemRow } from "@/lib/settings-data";
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
  submitLabel = "Guardar cambios",
}: {
  settingKey: string;
  children: ReactNode;
  submitLabel?: string;
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveOrganizationSetting, null);
  return (
    <form action={formAction} className="space-y-4">
      <FormAlert state={state} />
      <input type="hidden" name="settingKey" value={settingKey} />
      {children}
      <SubmitButton>{submitLabel}</SubmitButton>
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
        <SubmitButton className="h-9">Agregar</SubmitButton>
      </div>
      {withTemplateLists ? (
        <div>
          <label className={labelClass}>Listas de la plantilla (una por línea)</label>
          <textarea
            name="templateLists"
            rows={3}
            placeholder={"Planeación\nEjecución\nCierre"}
            className={inputClass}
          />
          <FieldError errors={errors.templateLists} />
        </div>
      ) : null}
    </form>
  );
}

function CatalogRowActions({ item, canDelete }: { item: CatalogItemRow; canDelete: boolean }) {
  const [toggleState, toggleAction] = useActionState<ActionState, FormData>(toggleCatalogItem, null);
  const [deleteState, deleteAction] = useActionState<ActionState, FormData>(deleteCatalogItem, null);
  return (
    <span className="flex items-center gap-1.5">
      <form action={toggleAction}>
        <input type="hidden" name="id" value={item.id} />
        <button type="submit" className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>
          {item.isActive ? "Archivar" : "Restaurar"}
        </button>
      </form>
      {canDelete ? (
        <form action={deleteAction}>
          <input type="hidden" name="id" value={item.id} />
          <button type="submit" className={cx(buttonDangerClass, "h-7 px-2 text-xs")}>
            Eliminar
          </button>
        </form>
      ) : null}
      {toggleState && !toggleState.ok ? (
        <span className="text-xs text-danger">{toggleState.message}</span>
      ) : null}
      {deleteState && !deleteState.ok ? (
        <span className="text-xs text-danger">{deleteState.message}</span>
      ) : null}
    </span>
  );
}

function CatalogRename({ item }: { item: CatalogItemRow }) {
  const [state, formAction] = useActionState<ActionState, FormData>(updateCatalogItem, null);
  const config = (item.config ?? null) as { lists?: string[] } | null;
  return (
    <form action={formAction} className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
      <input type="hidden" name="id" value={item.id} />
      {item.color ? (
        <input
          name="color"
          type="color"
          defaultValue={item.color}
          className="h-7 w-9 cursor-pointer rounded border border-edge bg-surface p-0.5"
        />
      ) : null}
      <input
        name="name"
        defaultValue={item.name}
        required
        className={cx(inputClass, "h-7 w-auto min-w-32 flex-1 text-sm")}
      />
      {config?.lists ? (
        <input
          name="templateLists"
          defaultValue={config.lists.join("\n")}
          type="hidden"
        />
      ) : null}
      <button type="submit" className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>
        Guardar
      </button>
      {state && !state.ok ? <span className="text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

/**
 * Full manager for one catalog kind: add form, active/archived rows, optional
 * subcategory tree (one level, mirrors ticket category → subcategory).
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
        <p className="text-sm text-muted">Sin elementos todavía.</p>
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
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function CatalogRow({
  item,
  childItems,
  hasChildren,
  childLabel,
  canDelete,
  kind,
}: {
  item: CatalogItemRow;
  childItems: CatalogItemRow[];
  hasChildren: boolean;
  childLabel: string | null;
  canDelete: boolean;
  kind: string;
}) {
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
            title={open ? "Contraer" : `${childLabel ?? "Subelementos"} (${childItems.length})`}
          >
            {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          </button>
        ) : null}
        <CatalogRename item={item} />
        {!item.isActive ? <Badge tone="slate">Archivado</Badge> : null}
        {hasChildren && childItems.length > 0 ? (
          <span className="text-xs text-muted">
            {childItems.length} {childLabel?.toLowerCase() ?? "subelementos"}
          </span>
        ) : null}
        <CatalogRowActions item={item} canDelete={canDelete} />
      </div>
      {config?.lists ? (
        <p className="mt-1 pl-6 text-xs text-muted">Listas: {config.lists.join(" · ")}</p>
      ) : null}
      {hasChildren && open ? (
        <div className="mt-2 space-y-2 border-l border-edge pl-6">
          {childItems.map((child) => (
            <div key={child.id} className={cx("flex flex-wrap items-center gap-2", !child.isActive && "opacity-60")}>
              <CatalogRename item={child} />
              {!child.isActive ? <Badge tone="slate">Archivado</Badge> : null}
              <CatalogRowActions item={child} canDelete={canDelete} />
            </div>
          ))}
          <CatalogAddForm
            kind={kind}
            parentId={item.id}
            placeholder={`Nueva ${childLabel?.toLowerCase().replace(/s$/, "") ?? "subcategoría"}…`}
          />
        </div>
      ) : null}
    </li>
  );
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

export function InviteUserForm({ roles }: { roles: { value: string; label: string }[] }) {
  const [state, formAction] = useActionState<ActionState, FormData>(inviteUser, null);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  const id = useId();
  return (
    <form action={formAction} className="space-y-3">
      <FormAlert state={state} />
      <div>
        <label htmlFor={`${id}-name`} className={labelClass}>Nombre</label>
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
          <label htmlFor={`${id}-role`} className={labelClass}>Rol</label>
          <select id={`${id}-role`} name="role" className={inputClass} defaultValue="technician">
            {roles.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-title`} className={labelClass}>Puesto (opcional)</label>
          <input id={`${id}-title`} name="title" className={inputClass} />
        </div>
      </div>
      <SubmitButton>Crear invitación</SubmitButton>
      <p className="text-xs text-muted">
        Watson no envía correos: comparte el enlace de invitación que aparecerá en la tabla.
      </p>
    </form>
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
          Desactivar…
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
          <select name="reassignToId" className={cx(inputClass, "h-7 w-auto text-xs")} defaultValue="">
            <option value="">Sin reasignar trabajo</option>
            {reassignTargets.map((t) => (
              <option key={t.id} value={t.id}>Reasignar a {t.name}</option>
            ))}
          </select>
          <button type="submit" className={cx(buttonDangerClass, "h-7 px-2 text-xs")}>
            Confirmar desactivación
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}
          >
            Cancelar
          </button>
        </>
      ) : (
        <button type="submit" className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>
          Activar
        </button>
      )}
      {state && !state.ok ? <span className="w-full text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

export function RegenerateInvitationButton({ userId }: { userId: number }) {
  const [state, formAction] = useActionState<ActionState, FormData>(regenerateInvitation, null);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={userId} />
      <button type="submit" className={cx(buttonSecondaryClass, "h-7 px-2 text-xs")}>
        Regenerar enlace
      </button>
      {state && !state.ok ? <span className="ml-2 text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

export function CopyLinkButton({ path }: { path: string }) {
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
      {copied ? "Copiado ✓" : "Copiar enlace"}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* API keys                                                            */
/* ------------------------------------------------------------------ */

export function ApiKeyCreateForm() {
  const [state, formAction] = useActionState<ActionState, FormData>(createApiKey, null);
  return (
    <form action={formAction} className="space-y-3">
      {/* The success message carries the one-time plaintext token. */}
      <FormAlert state={state} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <label className={labelClass}>Nombre de la clave</label>
          <input name="name" required placeholder="p. ej. Integración interna" className={inputClass} />
        </div>
        <SubmitButton>Generar clave</SubmitButton>
      </div>
    </form>
  );
}

export function RevokeApiKeyButton({ keyId }: { keyId: number }) {
  const [state, formAction] = useActionState<ActionState, FormData>(revokeApiKey, null);
  return (
    <form action={formAction} className="inline">
      <input type="hidden" name="id" value={keyId} />
      <button type="submit" className={cx(buttonDangerClass, "h-7 px-2 text-xs")}>
        Revocar
      </button>
      {state && !state.ok ? <span className="ml-2 text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}
