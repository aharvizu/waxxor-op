"use client";

import { useActionState, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { ChevronRight, Plus } from "lucide-react";
import { FieldError, FormAlert } from "@/components/form-feedback";
import { SearchableSelect } from "@/components/searchable-select";
import { SubmitButton } from "@/components/submit-button";
import { Badge, buttonSecondaryClass, cx, inputClass, labelClass } from "@/components/ui";
import type { ActionState } from "@/lib/action-result";
import { SERVICE_CATEGORIES } from "@/lib/company360";
import { useLocale } from "@/components/locale-provider";
import { t, type Locale } from "@/lib/i18n";
import { MenuButton, MenuSubmitButton } from "../tickets/catalog-manager";
import {
  createService,
  createServiceVariant,
  deleteService,
  deleteServiceVariant,
  toggleServiceActive,
  toggleServiceVariantActive,
  updateService,
  updateServiceVariant,
} from "./actions";

export type VariantRow = {
  id: number;
  name: string;
  sku: string | null;
  description: string | null;
  defaultRemoteRate: string | null;
  defaultOnsiteRate: string | null;
  defaultFixedPrice: string | null;
  status: string;
};

export type ServiceRow = {
  id: number;
  name: string;
  category: string;
  description: string | null;
  scope: string | null;
  defaultRemoteRate: string | null;
  defaultOnsiteRate: string | null;
  defaultFixedPrice: string | null;
  isRenewable: boolean;
  status: string;
  variants: VariantRow[];
};

function useForm(action: (p: ActionState, f: FormData) => Promise<ActionState>) {
  return useActionState<ActionState, FormData>(action, null);
}

function ratesSummary(
  r: { defaultRemoteRate: string | null; defaultOnsiteRate: string | null; defaultFixedPrice: string | null },
  locale: Locale,
) {
  const parts: string[] = [];
  if (r.defaultRemoteRate) parts.push(`${t("Remoto", "Remote", locale)} $${r.defaultRemoteRate}`);
  if (r.defaultOnsiteRate) parts.push(`${t("Sitio", "On-site", locale)} $${r.defaultOnsiteRate}`);
  if (r.defaultFixedPrice) parts.push(`${t("Fijo", "Fixed", locale)} $${r.defaultFixedPrice}`);
  return parts.join(" · ");
}

/* -------------------------------------------------------------- service */

function ServiceEditForm({ service, onDone }: { service: ServiceRow; onDone: () => void }) {
  const locale = useLocale();
  const [state, formAction] = useForm(updateService);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={formAction} className="space-y-2 p-1">
      <input type="hidden" name="id" value={service.id} />
      <FormAlert state={state} />
      <div>
        <label className={labelClass}>{t("Nombre", "Name", locale)}</label>
        <input name="name" defaultValue={service.name} required className={inputClass} />
        <FieldError errors={errors.name} />
      </div>
      <div>
        <label className={labelClass}>{t("Categoría", "Category", locale)}</label>
        <SearchableSelect
          name="category"
          defaultValue={service.category}
          options={SERVICE_CATEGORIES.map((c) => ({ value: c, label: c }))}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>{t("Tarifa remota", "Remote rate", locale)}</label>
          <input name="defaultRemoteRate" defaultValue={service.defaultRemoteRate ?? ""} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{t("Tarifa en sitio", "On-site rate", locale)}</label>
          <input name="defaultOnsiteRate" defaultValue={service.defaultOnsiteRate ?? ""} className={inputClass} />
        </div>
      </div>
      <div>
        <label className={labelClass}>{t("Precio fijo", "Fixed price", locale)}</label>
        <input name="defaultFixedPrice" defaultValue={service.defaultFixedPrice ?? ""} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>{t("Descripción", "Description", locale)}</label>
        <textarea name="description" rows={2} defaultValue={service.description ?? ""} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>{t("Alcance", "Scope", locale)}</label>
        <textarea name="scope" rows={2} defaultValue={service.scope ?? ""} className={inputClass} />
      </div>
      <label className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" name="isRenewable" defaultChecked={service.isRenewable} /> {t("Es renovable", "Is renewable", locale)}
      </label>
      <div className="flex items-center gap-2">
        <SubmitButton className="h-8">{t("Guardar", "Save", locale)}</SubmitButton>
        <button type="button" onClick={onDone} className={cx(buttonSecondaryClass, "h-8")}>
          {t("Cancelar", "Cancel", locale)}
        </button>
      </div>
    </form>
  );
}

function ServiceAddForm({ onDone }: { onDone: () => void }) {
  const locale = useLocale();
  const [state, formAction] = useForm(createService);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={formAction} className="space-y-2 rounded-lg border border-dashed border-edge-strong p-3">
      <FormAlert state={state} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className={labelClass}>{t("Nombre", "Name", locale)}</label>
          <input name="name" required placeholder={t("ej. Microsoft 365", "e.g. Microsoft 365", locale)} className={inputClass} />
          <FieldError errors={errors.name} />
        </div>
        <div>
          <label className={labelClass}>{t("Categoría", "Category", locale)}</label>
          <SearchableSelect name="category" defaultValue="general" options={SERVICE_CATEGORIES.map((c) => ({ value: c, label: c }))} />
        </div>
        <div>
          <label className={labelClass}>{t("Tarifa remota (opcional)", "Remote rate (optional)", locale)}</label>
          <input name="defaultRemoteRate" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{t("Tarifa en sitio (opcional)", "On-site rate (optional)", locale)}</label>
          <input name="defaultOnsiteRate" className={inputClass} />
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm text-fg">
        <input type="checkbox" name="isRenewable" /> {t("Es renovable", "Is renewable", locale)}
      </label>
      <div className="flex items-center gap-2">
        <SubmitButton className="h-8">{t("Agregar servicio", "Add service", locale)}</SubmitButton>
        <button type="button" onClick={onDone} className={cx(buttonSecondaryClass, "h-8")}>
          {t("Cancelar", "Cancel", locale)}
        </button>
      </div>
    </form>
  );
}

function ServiceMenu({ service }: { service: ServiceRow }) {
  const locale = useLocale();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [toggleState, toggleAction] = useForm(toggleServiceActive);
  const [deleteState, deleteAction] = useForm(deleteService);

  function close() {
    setOpen(false);
    setEditing(false);
  }

  return (
    <>
      <Popover.Root open={open} onOpenChange={(next) => { setOpen(next); if (!next) setEditing(false); }}>
        <Popover.Trigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-label={t(`Más acciones para ${service.name}`, `More actions for ${service.name}`, locale)}
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
            onCloseAutoFocus={(e) => { e.preventDefault(); triggerRef.current?.focus(); }}
            className="z-[70] w-72 rounded-xl border border-edge bg-surface p-1.5 text-xs shadow-overlay outline-none"
          >
            {editing ? (
              <ServiceEditForm service={service} onDone={close} />
            ) : (
              <div className="space-y-0.5">
                <MenuButton onClick={() => setEditing(true)}>{t("Editar", "Edit", locale)}</MenuButton>
                <form action={(fd) => { toggleAction(fd); close(); }}>
                  <input type="hidden" name="id" value={service.id} />
                  <MenuSubmitButton>{service.status === "active" ? t("Desactivar", "Deactivate", locale) : t("Activar", "Activate", locale)}</MenuSubmitButton>
                </form>
                <div className="my-1 border-t border-edge" />
                <form action={(fd) => { deleteAction(fd); close(); }}>
                  <input type="hidden" name="id" value={service.id} />
                  <MenuSubmitButton danger>{t("Eliminar", "Delete", locale)}</MenuSubmitButton>
                </form>
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

/* -------------------------------------------------------------- variant */

function VariantEditForm({ variant, onDone }: { variant: VariantRow; onDone: () => void }) {
  const locale = useLocale();
  const [state, formAction] = useForm(updateServiceVariant);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={formAction} className="space-y-2 p-1">
      <input type="hidden" name="id" value={variant.id} />
      <FormAlert state={state} />
      <div>
        <label className={labelClass}>{t("Nombre", "Name", locale)}</label>
        <input name="name" defaultValue={variant.name} required className={inputClass} />
        <FieldError errors={errors.name} />
      </div>
      <div>
        <label className={labelClass}>{t("SKU (opcional)", "SKU (optional)", locale)}</label>
        <input name="sku" defaultValue={variant.sku ?? ""} className={inputClass} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelClass}>{t("Tarifa remota", "Remote rate", locale)}</label>
          <input name="defaultRemoteRate" defaultValue={variant.defaultRemoteRate ?? ""} className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{t("Tarifa en sitio", "On-site rate", locale)}</label>
          <input name="defaultOnsiteRate" defaultValue={variant.defaultOnsiteRate ?? ""} className={inputClass} />
        </div>
      </div>
      <div>
        <label className={labelClass}>{t("Precio fijo", "Fixed price", locale)}</label>
        <input name="defaultFixedPrice" defaultValue={variant.defaultFixedPrice ?? ""} className={inputClass} />
      </div>
      <div>
        <label className={labelClass}>{t("Descripción", "Description", locale)}</label>
        <textarea name="description" rows={2} defaultValue={variant.description ?? ""} className={inputClass} />
      </div>
      <div className="flex items-center gap-2">
        <SubmitButton className="h-8">{t("Guardar", "Save", locale)}</SubmitButton>
        <button type="button" onClick={onDone} className={cx(buttonSecondaryClass, "h-8")}>
          {t("Cancelar", "Cancel", locale)}
        </button>
      </div>
    </form>
  );
}

function VariantMenu({ variant }: { variant: VariantRow }) {
  const locale = useLocale();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [toggleState, toggleAction] = useForm(toggleServiceVariantActive);
  const [deleteState, deleteAction] = useForm(deleteServiceVariant);

  function close() {
    setOpen(false);
    setEditing(false);
  }

  return (
    <>
      <Popover.Root open={open} onOpenChange={(next) => { setOpen(next); if (!next) setEditing(false); }}>
        <Popover.Trigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-label={t(`Más acciones para ${variant.name}`, `More actions for ${variant.name}`, locale)}
            className="ml-auto flex size-6 shrink-0 items-center justify-center rounded-md text-muted hover:bg-subtle hover:text-fg"
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
            onCloseAutoFocus={(e) => { e.preventDefault(); triggerRef.current?.focus(); }}
            className="z-[70] w-72 rounded-xl border border-edge bg-surface p-1.5 text-xs shadow-overlay outline-none"
          >
            {editing ? (
              <VariantEditForm variant={variant} onDone={close} />
            ) : (
              <div className="space-y-0.5">
                <MenuButton onClick={() => setEditing(true)}>{t("Editar", "Edit", locale)}</MenuButton>
                <form action={(fd) => { toggleAction(fd); close(); }}>
                  <input type="hidden" name="id" value={variant.id} />
                  <MenuSubmitButton>{variant.status === "active" ? t("Desactivar", "Deactivate", locale) : t("Activar", "Activate", locale)}</MenuSubmitButton>
                </form>
                <div className="my-1 border-t border-edge" />
                <form action={(fd) => { deleteAction(fd); close(); }}>
                  <input type="hidden" name="id" value={variant.id} />
                  <MenuSubmitButton danger>{t("Eliminar", "Delete", locale)}</MenuSubmitButton>
                </form>
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

function VariantAddForm({ serviceId, onDone }: { serviceId: number; onDone: () => void }) {
  const locale = useLocale();
  const [state, formAction] = useForm(createServiceVariant);
  const errors = state && !state.ok ? (state.fieldErrors ?? {}) : {};
  return (
    <form action={formAction} className="space-y-2 rounded-lg border border-dashed border-edge-strong p-2.5">
      <input type="hidden" name="serviceId" value={serviceId} />
      <FormAlert state={state} />
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className={labelClass}>{t("Nombre", "Name", locale)}</label>
          <input name="name" required placeholder={t("ej. Business Basic", "e.g. Business Basic", locale)} className={inputClass} />
          <FieldError errors={errors.name} />
        </div>
        <div>
          <label className={labelClass}>{t("SKU (opcional)", "SKU (optional)", locale)}</label>
          <input name="sku" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{t("Tarifa remota (opcional)", "Remote rate (optional)", locale)}</label>
          <input name="defaultRemoteRate" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>{t("Precio fijo (opcional)", "Fixed price (optional)", locale)}</label>
          <input name="defaultFixedPrice" className={inputClass} />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <SubmitButton className="h-7 text-xs">{t("Agregar variante", "Add variant", locale)}</SubmitButton>
        <button type="button" onClick={onDone} className={cx(buttonSecondaryClass, "h-7 text-xs")}>
          {t("Cancelar", "Cancel", locale)}
        </button>
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- list */

function ServiceListRow({ service }: { service: ServiceRow }) {
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [addingVariant, setAddingVariant] = useState(false);
  return (
    <li className={cx("px-3 py-2", service.status !== "active" && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="text-muted hover:text-fg"
          title={open ? t("Contraer", "Collapse", locale) : t(`Variantes (${service.variants.length})`, `Variants (${service.variants.length})`, locale)}
        >
          {open ? <ChevronRight className="size-4 rotate-90 transition-transform" /> : <ChevronRight className="size-4 transition-transform" />}
        </button>
        <span className="min-w-0 truncate font-medium text-fg">{service.name}</span>
        <Badge tone="slate">{service.category}</Badge>
        {service.status !== "active" ? <Badge tone="slate">{t("Inactivo", "Inactive", locale)}</Badge> : null}
        {service.variants.length > 0 ? (
          <span className="text-xs text-muted">
            {t(
              `${service.variants.length} variante${service.variants.length === 1 ? "" : "s"}`,
              `${service.variants.length} variant${service.variants.length === 1 ? "" : "s"}`,
              locale,
            )}
          </span>
        ) : null}
        <span className="text-xs text-muted">{ratesSummary(service, locale)}</span>
        <ServiceMenu service={service} />
      </div>
      {open ? (
        <div className="mt-2 space-y-1.5 border-l border-edge pl-6">
          {service.variants.map((v) => (
            <div key={v.id} className={cx("flex flex-wrap items-center gap-2 py-1", v.status !== "active" && "opacity-60")}>
              <span className="min-w-0 truncate text-sm text-fg">{v.name}</span>
              {v.sku ? <span className="text-xs text-faint">{v.sku}</span> : null}
              {v.status !== "active" ? <Badge tone="slate">{t("Inactiva", "Inactive", locale)}</Badge> : null}
              <span className="text-xs text-muted">{ratesSummary(v, locale)}</span>
              <VariantMenu variant={v} />
            </div>
          ))}
          {service.variants.length === 0 && !addingVariant ? (
            <p className="py-1 text-xs text-muted">{t("Sin variantes todavía.", "No variants yet.", locale)}</p>
          ) : null}
          {addingVariant ? (
            <VariantAddForm serviceId={service.id} onDone={() => setAddingVariant(false)} />
          ) : (
            <button
              type="button"
              onClick={() => setAddingVariant(true)}
              className={cx(buttonSecondaryClass, "h-7 gap-1 text-xs")}
            >
              <Plus className="size-3.5" /> {t("Nueva variante", "New variant", locale)}
            </button>
          )}
        </div>
      ) : null}
    </li>
  );
}

export function ServicesManager({ services }: { services: ServiceRow[] }) {
  const locale = useLocale();
  const [adding, setAdding] = useState(false);
  return (
    <div className="space-y-3">
      {adding ? (
        <ServiceAddForm onDone={() => setAdding(false)} />
      ) : (
        <button type="button" onClick={() => setAdding(true)} className={cx(buttonSecondaryClass, "h-8 gap-1.5 text-xs")}>
          <Plus className="size-3.5" /> {t("Nuevo servicio", "New service", locale)}
        </button>
      )}
      {services.length === 0 ? (
        <p className="text-sm text-muted">{t("Sin elementos todavía.", "No items yet.", locale)}</p>
      ) : (
        <ul className="divide-y divide-edge rounded-lg border border-edge">
          {services.map((s) => (
            <ServiceListRow key={s.id} service={s} />
          ))}
        </ul>
      )}
    </div>
  );
}
