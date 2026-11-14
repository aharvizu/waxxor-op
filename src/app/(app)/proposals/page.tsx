import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { FileText, Plus } from "lucide-react";
import { db } from "@/db";
import { proposals } from "@/db/schema";
import { Badge, Card, EmptyState, PageHeader, THead, Table, Td, Th, buttonClass, cx, inputClass } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { getLabels } from "@/lib/labels";
import { getOrgLocale } from "@/lib/get-org-locale";
import { PRODUCT_LIST, getPlan, getProduct } from "@/lib/proposals/catalog";
import { effectiveStatus } from "@/lib/proposals/lifecycle";
import { formatCents } from "@/lib/proposals/money";
import { PROPOSAL_STATUSES, type ProposalStatus } from "@/lib/proposals/types";
import { ORG_TIMEZONE } from "@/lib/reports";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Propuestas" };

const STATUS_FILTERS = ["all", ...PROPOSAL_STATUSES] as const;

/**
 * Propuestas comerciales (Sales). Listado deliberadamente simple — filtro por
 * estado, producto y búsqueda en la URL — hasta que el volumen justifique
 * cablear el Motor de Vistas. Ver docs/features/proposals.md.
 */
export default async function ProposalsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; product?: string; q?: string }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const locale = await getOrgLocale(user.organizationId);
  const { proposalStatusMeta } = getLabels(locale);

  const status = (PROPOSAL_STATUSES as readonly string[]).includes(params.status ?? "") ? (params.status as ProposalStatus) : null;
  const product = getProduct(params.product ?? "");
  const q = (params.q ?? "").trim();

  const conditions: SQL[] = [eq(proposals.organizationId, user.organizationId)];
  if (status) conditions.push(eq(proposals.status, status));
  if (product) conditions.push(eq(proposals.productKey, product.key));
  if (q) conditions.push(or(ilike(proposals.clientName, `%${q}%`), ilike(proposals.folio, `%${q}%`))!);

  const rows = await db
    .select({
      id: proposals.id,
      folio: proposals.folio,
      status: proposals.status,
      clientName: proposals.clientName,
      productKey: proposals.productKey,
      planKey: proposals.planKey,
      date: proposals.date,
      expiresAt: proposals.expiresAt,
      totalOneTimeCents: proposals.totalOneTimeCents,
      totalRecurringCents: proposals.totalRecurringCents,
      billingPeriod: proposals.billingPeriod,
    })
    .from(proposals)
    .where(and(...conditions))
    .orderBy(desc(proposals.createdAt))
    .limit(200);

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: ORG_TIMEZONE }).format(new Date());
  const href = (patch: Record<string, string | undefined>) => {
    const qs = new URLSearchParams();
    const next = { status: params.status, product: params.product, q: params.q, ...patch };
    for (const [k, v] of Object.entries(next)) if (v) qs.set(k, v);
    const s = qs.toString();
    return s ? `/proposals?${s}` : "/proposals";
  };

  return (
    <div>
      <PageHeader
        title="Propuestas"
        subtitle="Propuestas comerciales de una página, con folio al emitir."
        action={
          <Link href="/proposals/new" className={buttonClass}>
            <Plus /> Nueva propuesta
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap rounded-lg border border-edge p-0.5">
          {STATUS_FILTERS.map((s) => (
            <Link
              key={s}
              href={href({ status: s === "all" ? undefined : s })}
              className={cx(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                (status ?? "all") === s ? "bg-primary-soft text-primary" : "text-muted hover:bg-subtle hover:text-fg",
              )}
            >
              {s === "all" ? "Todas" : (proposalStatusMeta[s]?.label ?? s)}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap rounded-lg border border-edge p-0.5">
          {[{ key: "", name: "Todos los productos" }, ...PRODUCT_LIST].map((p) => (
            <Link
              key={p.key}
              href={href({ product: p.key || undefined })}
              className={cx(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                (product?.key ?? "") === p.key ? "bg-primary-soft text-primary" : "text-muted hover:bg-subtle hover:text-fg",
              )}
            >
              {p.name}
            </Link>
          ))}
        </div>
        <form method="get" className="ml-auto">
          {params.status ? <input type="hidden" name="status" value={params.status} /> : null}
          {params.product ? <input type="hidden" name="product" value={params.product} /> : null}
          <input
            type="search"
            name="q"
            defaultValue={q}
            placeholder="Buscar cliente o folio…"
            aria-label="Buscar cliente o folio"
            className={cx(inputClass, "h-8 w-56 text-xs")}
          />
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon={<FileText />} title={status || product || q ? "Sin resultados" : "Aún no hay propuestas"}>
          {status || product || q
            ? "Ninguna propuesta coincide con estos filtros."
            : "Crea la primera: elige un producto, captura las partidas y emítela para asignarle folio."}
        </EmptyState>
      ) : (
        <Card>
          <Table>
            <THead>
              <tr>
                <Th>Folio</Th>
                <Th>Cliente</Th>
                <Th>Producto</Th>
                <Th>Estado</Th>
                <Th>Fecha</Th>
                <Th>Vence</Th>
                <Th className="text-right">Pago único</Th>
                <Th className="text-right">Recurrente</Th>
              </tr>
            </THead>
            <tbody>
              {rows.map((r) => {
                const shown = effectiveStatus(r.status, r.expiresAt, today);
                const p = getProduct(r.productKey);
                return (
                  <tr key={r.id} className="border-t border-edge">
                    <Td>
                      <Link href={`/proposals/${r.id}`} className="font-medium text-primary hover:underline">
                        {r.folio ?? "Borrador"}
                      </Link>
                    </Td>
                    <Td>{r.clientName}</Td>
                    <Td>{p ? (p.planLabel ? getPlan(p, r.planKey).name : p.name) : r.productKey}</Td>
                    <Td>
                      <Badge tone={proposalStatusMeta[shown]?.tone ?? "slate"}>{proposalStatusMeta[shown]?.label ?? shown}</Badge>
                    </Td>
                    <Td className="tabular-nums">{fmtDate(r.date)}</Td>
                    <Td className="tabular-nums">{fmtDate(r.expiresAt)}</Td>
                    <Td className="text-right tabular-nums">{formatCents(r.totalOneTimeCents)}</Td>
                    <Td className="text-right tabular-nums">
                      {r.billingPeriod ? (
                        <>
                          {formatCents(r.totalRecurringCents)}
                          <span className="ml-1 text-xs text-faint">{r.billingPeriod === "annual" ? "/año" : "/mes"}</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </Card>
      )}
    </div>
  );
}
