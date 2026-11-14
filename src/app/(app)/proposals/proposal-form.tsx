"use client";

import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { FormAlert } from "@/components/form-feedback";
import { SearchableSelect } from "@/components/searchable-select";
import { SubmitButton } from "@/components/submit-button";
import { Card, buttonSecondaryClass, cx, iconButtonClass, inputClass, labelClass } from "@/components/ui";
import type { ActionState } from "@/lib/action-result";
import { computeTotals, itemAmountCents } from "@/lib/proposals/calc";
import { PRODUCT_LIST, PRODUCTS, getPlan, resolvePeriod, type CatalogContext, type Product } from "@/lib/proposals/catalog";
import { centsToInput, formatCents, parseMoneyToCents } from "@/lib/proposals/money";
import type { BillingPeriod, ProductKey, ProposalInput, ProposalItem, Recurrence } from "@/lib/proposals/types";
import { saveProposal } from "./actions";

/** Una partida mientras se captura: cantidad y precio son texto hasta guardar. */
type DraftItem = {
  title: string;
  description: string;
  quantity: string;
  termLabel: string;
  recurrence: Recurrence;
  price: string;
  notIncluded: boolean;
  extra: boolean;
};

function toDraft(item: ProposalItem): DraftItem {
  return {
    title: item.title,
    description: item.description,
    quantity: item.quantity === null ? "" : String(item.quantity),
    termLabel: item.termLabel,
    recurrence: item.recurrence,
    price: item.unitPriceCents === null ? "" : centsToInput(item.unitPriceCents),
    notIncluded: item.unitPriceCents === null,
    extra: item.extra === true,
  };
}

/** null si la cantidad o el precio capturados no son números válidos. */
function fromDraft(d: DraftItem): ProposalItem | null {
  const qtyText = d.quantity.trim();
  const quantity = qtyText === "" ? null : Number(qtyText.replace(/,/g, ""));
  if (quantity !== null && (!Number.isFinite(quantity) || quantity < 0)) return null;
  const unitPriceCents = d.notIncluded ? null : parseMoneyToCents(d.price.trim() === "" ? "0" : d.price);
  if (!d.notIncluded && unitPriceCents === null) return null;
  return {
    title: d.title,
    description: d.description,
    quantity,
    termLabel: d.termLabel,
    unitPriceCents,
    recurrence: d.recurrence,
    ...(d.extra ? { extra: true } : {}),
  };
}

const PERIOD_LABELS: Record<BillingPeriod, string> = { annual: "Anual", monthly: "Mensual" };

export type ProposalFormInitial = ProposalInput & { id: number | null; assessmentId: number | null };

export function ProposalForm({
  initial,
  companies,
}: {
  initial: ProposalFormInitial;
  companies: { id: number; name: string }[];
}) {
  const [state, formAction] = useActionState<ActionState, FormData>(saveProposal, null);

  const [productKey, setProductKey] = useState<ProductKey>(initial.productKey);
  const [planKey, setPlanKey] = useState<string>(initial.planKey ?? PRODUCTS[initial.productKey].defaultPlan);
  const [period, setPeriod] = useState<BillingPeriod | null>(initial.billingPeriod);
  const [companyId, setCompanyId] = useState<string>(initial.companyId === null ? "" : String(initial.companyId));
  const [clientName, setClientName] = useState(initial.clientName);
  const [preparedBy, setPreparedBy] = useState(initial.preparedBy);
  const [date, setDate] = useState(initial.date);
  const [validityDays, setValidityDays] = useState(String(initial.validityDays));
  const [items, setItems] = useState<DraftItem[]>(initial.items.map(toDraft));
  const [note, setNote] = useState(initial.note);
  const [ivaPct, setIvaPct] = useState(String(initial.ivaBps / 100));
  const [licenseToAdd, setLicenseToAdd] = useState("");

  const product = PRODUCTS[productKey];
  const ctx = (p: Product, plan: string, per: BillingPeriod | null): CatalogContext => ({
    planKey: plan,
    period: per,
    validityDays: Number(validityDays) || 30,
  });

  /**
   * Al cambiar plan o periodo solo se actualiza lo que el usuario NO tocó:
   * una partida (o la nota) que sigue igual a la sugerida anterior pasa a la
   * sugerida nueva; lo editado a mano se respeta.
   */
  function retarget(nextProduct: Product, nextPlan: string, nextPeriod: BillingPeriod | null) {
    const before = product.suggestedItems(ctx(product, planKey, period));
    const after = nextProduct.suggestedItems(ctx(nextProduct, nextPlan, nextPeriod));
    setItems((prev) =>
      prev.map((item, i) => {
        if (item.extra) {
          // Las licencias agregadas siguen el compromiso de la propuesta.
          if (nextPeriod === null || item.recurrence === "one_time") return item;
          return { ...item, recurrence: nextPeriod, termLabel: PERIOD_LABELS[nextPeriod] };
        }
        const b = before[i];
        const a = after[i];
        if (!b || !a) return item;
        return {
          ...item,
          title: item.title === b.title ? a.title : item.title,
          description: item.description === b.description ? a.description : item.description,
          ...(item.termLabel === b.termLabel && item.recurrence === b.recurrence
            ? { termLabel: a.termLabel, recurrence: a.recurrence }
            : {}),
        };
      }),
    );
    if (note === product.defaultNote(ctx(product, planKey, period))) {
      setNote(nextProduct.defaultNote(ctx(nextProduct, nextPlan, nextPeriod)));
    }
  }

  function changeProduct(key: ProductKey) {
    // Otro producto es otro documento: partidas y nota vuelven a las sugeridas.
    const next = PRODUCTS[key];
    const nextPeriod = resolvePeriod(next, null);
    setProductKey(key);
    setPlanKey(next.defaultPlan);
    setPeriod(nextPeriod);
    setItems(next.suggestedItems(ctx(next, next.defaultPlan, nextPeriod)).map(toDraft));
    setNote(next.defaultNote(ctx(next, next.defaultPlan, nextPeriod)));
  }

  function changePlan(key: string) {
    retarget(product, key, period);
    setPlanKey(key);
  }

  function changePeriod(next: BillingPeriod) {
    retarget(product, planKey, next);
    setPeriod(next);
  }

  function changeCompany(value: string) {
    const previous = companies.find((c) => String(c.id) === companyId)?.name ?? "";
    const chosen = companies.find((c) => String(c.id) === value)?.name ?? "";
    setCompanyId(value);
    // El nombre impreso sigue a la empresa mientras no se haya personalizado.
    if (chosen && (clientName.trim() === "" || clientName === previous)) setClientName(chosen);
  }

  const patchItem = (index: number, patch: Partial<DraftItem>) =>
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  function addBlank() {
    const term = product.termOptions[0];
    setItems((prev) => [
      ...prev,
      { title: "", description: "", quantity: "1", termLabel: term.label, recurrence: term.recurrence, price: "0.00", notIncluded: false, extra: false },
    ]);
  }

  function addLicense() {
    const license = product.licenseCatalog.find((l) => l.key === licenseToAdd);
    if (!license) return;
    const per = period ?? "annual";
    const row: DraftItem = {
      title: license.title,
      description: license.description,
      quantity: "0",
      termLabel: PERIOD_LABELS[per],
      recurrence: per,
      price: "0.00",
      notIncluded: false,
      extra: true,
    };
    // Igual que la plantilla: después de la licencia principal y de las ya agregadas.
    setItems((prev) => {
      const at = 1 + prev.filter((i) => i.extra).length;
      return [...prev.slice(0, at), row, ...prev.slice(at)];
    });
    setLicenseToAdd("");
  }

  const parsedItems = useMemo(() => items.map(fromDraft), [items]);
  const validItems = parsedItems.filter((i): i is ProposalItem => i !== null);
  const ivaBps = Math.round((Number(ivaPct) || 0) * 100);
  const totals = computeTotals(validItems, ivaBps, period);
  const hasInvalid = parsedItems.some((i) => i === null);
  const overLimit = items.length > product.maxItems;

  const payload: ProposalInput = {
    companyId: companyId === "" ? null : Number(companyId),
    clientName,
    preparedBy,
    date,
    validityDays: Number(validityDays) || 0,
    productKey,
    planKey: product.planLabel ? planKey : null,
    billingPeriod: period,
    items: validItems,
    note,
    ivaBps,
  };

  const small = cx(inputClass, "h-9 text-sm");
  const recurringLabel = period === "annual" ? "Anualidad" : "Mensualidad";

  return (
    <form
      action={formAction}
      className="space-y-6"
      onSubmit={(e) => {
        // Una partida inválida no se descarta en silencio: se corrige antes de guardar.
        if (hasInvalid || overLimit) e.preventDefault();
      }}
    >
      <FormAlert state={state} />
      {initial.id !== null ? <input type="hidden" name="id" value={initial.id} /> : null}
      {initial.assessmentId !== null ? <input type="hidden" name="assessmentId" value={initial.assessmentId} /> : null}
      <input type="hidden" name="payload" value={JSON.stringify(payload)} />

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold text-fg">Producto</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="product" className={labelClass}>Producto o servicio</label>
            <select id="product" className={inputClass} value={productKey} onChange={(e) => changeProduct(e.target.value as ProductKey)}>
              {PRODUCT_LIST.map((p) => (
                <option key={p.key} value={p.key}>{p.name}</option>
              ))}
            </select>
          </div>
          {product.planLabel ? (
            <div>
              <label htmlFor="plan" className={labelClass}>{product.planLabel}</label>
              <select id="plan" className={inputClass} value={planKey} onChange={(e) => changePlan(e.target.value)}>
                {product.plans.map((p) => (
                  <option key={p.key} value={p.key}>{p.name}</option>
                ))}
              </select>
            </div>
          ) : null}
          {product.periods.length > 1 && period ? (
            <div>
              <label htmlFor="period" className={labelClass}>Licenciamiento</label>
              <select id="period" className={inputClass} value={period} onChange={(e) => changePeriod(e.target.value as BillingPeriod)}>
                {product.periods.map((p) => (
                  <option key={p} value={p}>{PERIOD_LABELS[p]}</option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-muted">
                Define el compromiso de las licencias y la columna recurrente. Captura el precio que corresponda a ese compromiso.
              </p>
            </div>
          ) : null}
        </div>
        <p className="text-xs text-muted">{getPlan(product, planKey).hero.subtitle}</p>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-sm font-semibold text-fg">Datos de la propuesta</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="company" className={labelClass}>Empresa</label>
            <SearchableSelect
              id="company"
              value={companyId}
              onValueChange={changeCompany}
              options={[{ value: "", label: "Prospecto (sin empresa registrada)" }, ...companies.map((c) => ({ value: String(c.id), label: c.name }))]}
            />
          </div>
          <div>
            <label htmlFor="clientName" className={labelClass}>Preparada para</label>
            <input id="clientName" className={inputClass} value={clientName} maxLength={80} required onChange={(e) => setClientName(e.target.value)} />
            <p className="mt-1.5 text-xs text-muted">Como se imprime en el documento.</p>
          </div>
          <div>
            <label htmlFor="preparedBy" className={labelClass}>Preparada por</label>
            <input id="preparedBy" className={inputClass} value={preparedBy} maxLength={60} required onChange={(e) => setPreparedBy(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label htmlFor="date" className={labelClass}>Fecha</label>
              <input id="date" type="date" className={inputClass} value={date} required onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label htmlFor="validity" className={labelClass}>Vigencia (días)</label>
              <input id="validity" type="number" min={1} max={365} className={inputClass} value={validityDays} required onChange={(e) => setValidityDays(e.target.value)} />
            </div>
            <div>
              <label htmlFor="iva" className={labelClass}>IVA %</label>
              <input id="iva" type="number" min={0} max={100} step="0.01" className={inputClass} value={ivaPct} required onChange={(e) => setIvaPct(e.target.value)} />
            </div>
          </div>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-fg">
            Propuesta económica
            <span className={cx("ml-2 text-xs font-normal", overLimit ? "text-danger" : "text-muted")}>
              {items.length} de {product.maxItems} partidas
            </span>
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {product.licenseCatalog.length > 0 ? (
              <>
                <select aria-label="Licencia a agregar" className={cx(small, "w-72")} value={licenseToAdd} onChange={(e) => setLicenseToAdd(e.target.value)}>
                  <option value="">Agregar licencia o complemento…</option>
                  {product.licenseCatalog.map((l) => (
                    <option key={l.key} value={l.key}>{l.title}</option>
                  ))}
                </select>
                <button type="button" className={buttonSecondaryClass} disabled={!licenseToAdd} onClick={addLicense}>
                  <Plus /> Agregar
                </button>
              </>
            ) : null}
            <button type="button" className={buttonSecondaryClass} onClick={addBlank}>
              <Plus /> Partida libre
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {items.map((item, i) => {
            const parsed = parsedItems[i];
            const amount = parsed ? itemAmountCents(parsed) : null;
            return (
              <div key={i} className="rounded-lg border border-edge p-3">
                <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_6rem_8rem_9rem_8rem_2.25rem]">
                  <div className="space-y-2">
                    <input aria-label={`Concepto ${i + 1}`} className={small} value={item.title} maxLength={120} placeholder="Concepto" onChange={(e) => patchItem(i, { title: e.target.value })} />
                    <input aria-label={`Descripción ${i + 1}`} className={cx(small, "text-muted")} value={item.description} maxLength={240} placeholder="Descripción de una línea" onChange={(e) => patchItem(i, { description: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted" htmlFor={`qty-${i}`}>{product.quantityHeader}</label>
                    <input id={`qty-${i}`} inputMode="decimal" className={cx(small, "text-right tabular-nums")} value={item.quantity} placeholder="—" onChange={(e) => patchItem(i, { quantity: e.target.value })} />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted" htmlFor={`term-${i}`}>Vigencia</label>
                    <select
                      id={`term-${i}`}
                      className={small}
                      value={item.termLabel}
                      onChange={(e) => {
                        const option = product.termOptions.find((o) => o.label === e.target.value)!;
                        patchItem(i, { termLabel: option.label, recurrence: option.recurrence });
                      }}
                    >
                      {product.termOptions.map((o) => (
                        <option key={o.label} value={o.label}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-muted" htmlFor={`price-${i}`}>P. unitario (MXN)</label>
                    <input
                      id={`price-${i}`}
                      inputMode="decimal"
                      className={cx(small, "text-right tabular-nums")}
                      value={item.notIncluded ? "" : item.price}
                      disabled={item.notIncluded}
                      placeholder={item.notIncluded ? "No Incluido" : "0.00"}
                      aria-invalid={parsed === null ? true : undefined}
                      onChange={(e) => patchItem(i, { price: e.target.value })}
                    />
                    <label className="mt-1 flex items-center gap-1.5 text-xs text-muted">
                      <input type="checkbox" checked={item.notIncluded} onChange={(e) => patchItem(i, { notIncluded: e.target.checked })} />
                      No incluido
                    </label>
                  </div>
                  <div>
                    <span className="mb-1 block text-xs text-muted">Importe</span>
                    <p className="flex h-9 items-center justify-end text-sm font-medium tabular-nums text-fg">
                      {parsed === null ? <span className="text-danger">Revisa</span> : amount === null ? "No Incluido" : formatCents(amount)}
                    </p>
                  </div>
                  <button type="button" className={cx(iconButtonClass, "mt-5")} aria-label={`Quitar partida ${i + 1}`} onClick={() => setItems((prev) => prev.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {overLimit ? (
          <p className="text-sm text-danger">
            {product.name} admite hasta {product.maxItems} partidas para caber en una hoja. Si necesitas más, divide en dos propuestas.
          </p>
        ) : null}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
          <div>
            <label htmlFor="note" className={labelClass}>Nota</label>
            <textarea id="note" rows={3} className={inputClass} value={note} maxLength={400} onChange={(e) => setNote(e.target.value)} />
            <p className="mt-1.5 text-xs text-muted">Se imprime junto a los totales, precedida de «Nota:».</p>
          </div>
          <div className="flex flex-wrap gap-6 self-start rounded-lg bg-subtle p-4 text-sm">
            <TotalsColumn title={product.totalsMode === "dual" ? "Pago único" : "Inversión total"} subtotal={totals.oneTime.subtotalCents} iva={totals.oneTime.ivaCents} total={totals.oneTime.totalCents} />
            {product.totalsMode === "dual" ? (
              <TotalsColumn title={recurringLabel} subtotal={totals.recurring.subtotalCents} iva={totals.recurring.ivaCents} total={totals.recurring.totalCents} />
            ) : null}
          </div>
        </div>
        {product.totalsMode === "dual" ? (
          // Regla de la especificación: son unidades distintas y sumarlas no significa nada.
          <p className="text-xs text-muted">El pago único y la {recurringLabel.toLowerCase()} nunca se suman: no existe un gran total.</p>
        ) : null}
      </Card>

      <div className="flex items-center justify-end gap-3">
        <Link href={initial.id !== null ? `/proposals/${initial.id}` : "/proposals"} className={buttonSecondaryClass}>
          Cancelar
        </Link>
        {hasInvalid ? <span className="text-sm text-danger">Hay una cantidad o un precio que no es un número.</span> : null}
        <SubmitButton>Guardar borrador</SubmitButton>
      </div>
    </form>
  );
}

function TotalsColumn({ title, subtotal, iva, total }: { title: string; subtotal: number; iva: number; total: number }) {
  return (
    <dl className="min-w-44 space-y-1">
      <dt className="text-xs font-semibold uppercase tracking-wide text-primary">{title}</dt>
      <div className="flex justify-between gap-6 text-muted"><span>Subtotal</span><span className="tabular-nums">{formatCents(subtotal)}</span></div>
      <div className="flex justify-between gap-6 text-muted"><span>IVA</span><span className="tabular-nums">{formatCents(iva)}</span></div>
      <div className="flex justify-between gap-6 border-t border-edge pt-1 font-semibold text-fg"><span>Total</span><span className="tabular-nums">{formatCents(total)}</span></div>
    </dl>
  );
}
