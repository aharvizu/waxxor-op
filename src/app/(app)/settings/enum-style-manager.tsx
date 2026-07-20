"use client";

import { useActionState } from "react";
import { FormAlert } from "@/components/form-feedback";
import { SubmitButton } from "@/components/submit-button";
import { Badge, Card, CardHeader, type BadgeTone, cx, inputClass, labelClass } from "@/components/ui";
import type { ActionState } from "@/lib/action-result";
import type { StyledMeta } from "@/lib/catalog-styles";
import type { CatalogItemRow } from "@/lib/settings-data";
import { createCatalogItem, toggleCatalogItem, updateCatalogItem } from "./actions";

const TONES: BadgeTone[] = ["slate", "blue", "amber", "green", "red", "violet", "purple"];

/**
 * Editable style overrides for a fixed enum (status/priority/billing —
 * Part 3, "cosmetic layer" per the 2026-07-20 dynamic-config sprint scoping:
 * the enum's raw values never change, only label/color/icon/order are
 * org-configurable). One row per enum value; `existingRows` tells us which
 * already have an override (update) vs need one created on first save.
 */
export function EnumStyleManager({
  kind,
  title,
  description,
  values,
  styled,
  existingRows,
}: {
  kind: string;
  title: string;
  description?: string;
  values: readonly string[];
  styled: Record<string, StyledMeta>;
  existingRows: CatalogItemRow[];
}) {
  const byName = new Map(existingRows.map((r) => [r.name, r]));
  return (
    <Card className="p-5">
      <CardHeader title={title} description={description} className="mb-3 px-0 pt-0" />
      <ul className="space-y-2">
        {[...values]
          .sort((a, b) => styled[a].sortOrder - styled[b].sortOrder)
          .map((value) => (
            <EnumStyleRow key={value} kind={kind} value={value} meta={styled[value]} row={byName.get(value)} />
          ))}
      </ul>
    </Card>
  );
}

function EnumStyleRow({
  kind,
  value,
  meta,
  row,
}: {
  kind: string;
  value: string;
  meta: StyledMeta;
  row?: CatalogItemRow;
}) {
  const action = row ? updateCatalogItem : createCatalogItem;
  const [state, formAction] = useActionState<ActionState, FormData>(action, null);
  const [toggleState, toggleAction] = useActionState<ActionState, FormData>(toggleCatalogItem, null);

  return (
    <li className="rounded-lg border border-edge bg-surface px-3 py-2">
      <details>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Badge tone={meta.tone}>{meta.label}</Badge>
            <code className="text-[11px] text-faint">{value}</code>
            {!meta.isActive ? <Badge tone="slate">Oculto</Badge> : null}
          </span>
          {row ? (
            <form action={toggleAction}>
              <input type="hidden" name="id" value={row.id} />
              <button type="submit" className="text-xs text-muted hover:text-fg">
                {meta.isActive ? "Ocultar" : "Mostrar"}
              </button>
            </form>
          ) : null}
        </summary>
        <form action={formAction} className="mt-3 grid grid-cols-1 gap-3 border-t border-edge pt-3 sm:grid-cols-2">
          <FormAlert state={state} />
          {row ? <input type="hidden" name="id" value={row.id} /> : <input type="hidden" name="kind" value={kind} />}
          <input type="hidden" name="name" value={value} />
          <div>
            <label className={labelClass}>Etiqueta personalizada</label>
            <input name="styleLabel" defaultValue={row ? meta.label : ""} placeholder={meta.label} className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Color</label>
            <select name="color" defaultValue={meta.tone} className={inputClass}>
              {TONES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass}>Ícono (lucide, opcional)</label>
            <input name="icon" defaultValue={meta.icon ?? ""} placeholder="ej. Clock" className={inputClass} />
          </div>
          <div className="flex items-end">
            <SubmitButton className="h-9">{row ? "Guardar" : "Personalizar"}</SubmitButton>
          </div>
        </form>
      </details>
      {toggleState && !toggleState.ok ? <p className={cx("mt-1 text-xs text-danger")}>{toggleState.message}</p> : null}
    </li>
  );
}
