import type { Metadata } from "next";
import { asc, desc, inArray } from "drizzle-orm";
import { db } from "@/db";
import { kpiEntries, kpis } from "@/db/schema";
import { Card, EmptyState, PageHeader, cx, inputClass, labelClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { fmtDate } from "@/lib/format";
import { addKpiEntry, createKpi, deleteKpi } from "./actions";

export const metadata: Metadata = { title: "KPIs" };

export default async function KpisPage() {
  const kpiRows = await db.select().from(kpis).orderBy(asc(kpis.name));
  const entries =
    kpiRows.length > 0
      ? await db
          .select()
          .from(kpiEntries)
          .where(
            inArray(
              kpiEntries.kpiId,
              kpiRows.map((k) => k.id),
            ),
          )
          .orderBy(desc(kpiEntries.period))
      : [];

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div>
      <PageHeader
        title="KPIs"
        subtitle="Track the numbers that matter — MRR, tickets resolved, assessments delivered, SLA compliance…"
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          {kpiRows.length === 0 ? (
            <EmptyState>No KPIs defined yet — add one on the right.</EmptyState>
          ) : (
            kpiRows.map((k) => {
              const kEntries = entries.filter((e) => e.kpiId === k.id).slice(0, 6);
              const latest = kEntries[0];
              const target = k.target ? Number(k.target) : null;
              const hit =
                latest && target !== null ? Number(latest.value) >= target : null;
              return (
                <Card key={k.id} className="p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <h2 className="text-sm font-semibold">{k.name}</h2>
                      <div className="mt-1 flex items-baseline gap-2">
                        <span
                          className={cx(
                            "text-2xl font-semibold tabular-nums",
                            hit === true && "text-emerald-600",
                            hit === false && "text-amber-600",
                          )}
                        >
                          {latest ? Number(latest.value) : "—"}
                        </span>
                        {k.unit ? (
                          <span className="text-sm text-slate-500">{k.unit}</span>
                        ) : null}
                        {target !== null ? (
                          <span className="text-sm text-slate-400">
                            target {target}
                            {k.unit ? ` ${k.unit}` : ""}
                          </span>
                        ) : null}
                      </div>
                      {latest ? (
                        <div className="mt-1 text-xs text-slate-500">
                          Last recorded {fmtDate(latest.period)}
                        </div>
                      ) : null}
                    </div>
                    <form action={deleteKpi}>
                      <input type="hidden" name="id" value={k.id} />
                      <button
                        type="submit"
                        className="text-xs font-medium text-red-600 hover:underline"
                      >
                        Delete
                      </button>
                    </form>
                  </div>

                  {kEntries.length > 1 ? (
                    <ul className="mt-3 flex flex-wrap gap-2 text-xs text-slate-500">
                      {kEntries.map((e) => (
                        <li key={e.id} className="rounded-full bg-slate-100 px-2.5 py-1">
                          {fmtDate(e.period)}: {Number(e.value)}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <form
                    action={addKpiEntry}
                    className="mt-4 grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-4"
                  >
                    <input type="hidden" name="kpiId" value={k.id} />
                    <input
                      name="value"
                      type="number"
                      step="0.01"
                      required
                      placeholder="Value"
                      aria-label="Value"
                      className={inputClass}
                    />
                    <input
                      name="period"
                      type="date"
                      defaultValue={today}
                      required
                      aria-label="Period"
                      className={inputClass}
                    />
                    <input
                      name="note"
                      placeholder="Note (optional)"
                      aria-label="Note"
                      className={inputClass}
                    />
                    <SubmitButton>Record</SubmitButton>
                  </form>
                </Card>
              );
            })
          )}
        </div>

        <Card className="h-fit p-5">
          <h2 className="mb-4 text-sm font-semibold">New KPI</h2>
          <form action={createKpi} className="space-y-4">
            <div>
              <label htmlFor="name" className={labelClass}>
                Name
              </label>
              <input
                id="name"
                name="name"
                required
                placeholder="e.g. Monthly recurring revenue"
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="unit" className={labelClass}>
                  Unit
                </label>
                <input id="unit" name="unit" placeholder="USD, %, tickets…" className={inputClass} />
              </div>
              <div>
                <label htmlFor="target" className={labelClass}>
                  Target
                </label>
                <input
                  id="target"
                  name="target"
                  type="number"
                  step="0.01"
                  className={inputClass}
                />
              </div>
            </div>
            <SubmitButton>Add KPI</SubmitButton>
          </form>
        </Card>
      </div>
    </div>
  );
}
