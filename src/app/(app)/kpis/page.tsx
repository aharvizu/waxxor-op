import type { Metadata } from "next";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { Gauge, Trash2 } from "lucide-react";
import { db } from "@/db";
import { kpiEntries, kpis } from "@/db/schema";
import { requireUser } from "@/lib/session";
import {
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  Progress,
  cx,
  inputClass,
  labelClass,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { fmtDate } from "@/lib/format";
import { addKpiEntry, createKpi, deleteKpi } from "./actions";

export const metadata: Metadata = { title: "KPIs" };

export default async function KpisPage() {
  const user = await requireUser();
  const kpiRows = await db
    .select()
    .from(kpis)
    .where(eq(kpis.organizationId, user.organizationId))
    .orderBy(asc(kpis.name));
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
        <div className="space-y-5 xl:col-span-2">
          {kpiRows.length === 0 ? (
            <EmptyState icon={<Gauge />} title="No KPIs defined yet">
              Define your first metric on the right, then record values over time.
            </EmptyState>
          ) : (
            kpiRows.map((k) => {
              const kEntries = entries.filter((e) => e.kpiId === k.id).slice(0, 6);
              const latest = kEntries[0];
              const target = k.target ? Number(k.target) : null;
              const hit =
                latest && target !== null ? Number(latest.value) >= target : null;
              const pct =
                latest && target ? (Number(latest.value) / target) * 100 : null;
              return (
                <Card key={k.id} className="p-5 hover:shadow-card-hover">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-fg">{k.name}</h2>
                      <div className="mt-1.5 flex items-baseline gap-2">
                        <span
                          className={cx(
                            "text-2xl font-semibold tracking-tight",
                            hit === true && "text-success",
                            hit === false && "text-warning",
                          )}
                        >
                          {latest ? Number(latest.value) : "—"}
                        </span>
                        {k.unit ? (
                          <span className="text-sm text-muted">{k.unit}</span>
                        ) : null}
                        {target !== null ? (
                          <span className="text-sm text-faint">
                            target {target}
                            {k.unit ? ` ${k.unit}` : ""}
                          </span>
                        ) : null}
                      </div>
                      {latest ? (
                        <div className="mt-1 text-xs text-faint">
                          Last recorded {fmtDate(latest.period)}
                        </div>
                      ) : null}
                    </div>
                    <form action={deleteKpi}>
                      <input type="hidden" name="id" value={k.id} />
                      <button
                        type="submit"
                        aria-label={`Delete KPI ${k.name}`}
                        className="flex size-8 items-center justify-center rounded-lg text-faint transition-colors duration-150 hover:bg-danger/10 hover:text-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </form>
                  </div>

                  {pct !== null ? (
                    <Progress
                      value={pct}
                      tone={hit ? "success" : "warning"}
                      className="mt-3"
                    />
                  ) : null}

                  {kEntries.length > 1 ? (
                    <ul className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
                      {kEntries.map((e) => (
                        <li
                          key={e.id}
                          className="rounded-full border border-edge bg-subtle px-2.5 py-1 tabular-nums"
                        >
                          {fmtDate(e.period)}: {Number(e.value)}
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <form
                    action={addKpiEntry}
                    className="mt-4 grid grid-cols-1 gap-3 border-t border-edge pt-4 sm:grid-cols-4"
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

        <Card className="h-fit overflow-hidden">
          <CardHeader title="New KPI" description="A metric to track over time." />
          <form action={createKpi} className="space-y-4 p-5">
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
