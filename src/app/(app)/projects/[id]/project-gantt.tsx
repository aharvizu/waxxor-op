import Link from "next/link";
import { GanttChartSquare } from "lucide-react";
import { addDays, daysBetween, MONTH_LABELS_ES } from "@/lib/calendar";
import type { LocalDate } from "@/lib/recurrence";
import { fmtDate } from "@/lib/format";
import { activityStatusMeta, projectListStatusMeta } from "@/lib/labels";
import type { ProjectTreeActivity, getProjectDependencies, getProjectMilestones, getProjectWorkTree } from "@/lib/project-data";
import { Badge, Card, EmptyState, cx } from "@/components/ui";

type WorkTree = Awaited<ReturnType<typeof getProjectWorkTree>>;
type Dependencies = Awaited<ReturnType<typeof getProjectDependencies>>;
type Milestones = Awaited<ReturnType<typeof getProjectMilestones>>;

const LABEL_W = 240;
const DAY_W = 24;
const ROW_H = 36;
const SECTION_H = 30;
const HEADER_H = 34;
const PAD_DAYS = 2;

const BAR_TONE_CLASS: Record<string, string> = {
  slate: "bg-slate-400 dark:bg-slate-500",
  blue: "bg-blue-500",
  amber: "bg-amber-500",
  green: "bg-green-500",
  red: "bg-red-500",
  violet: "bg-violet-500",
  purple: "bg-purple-500",
};

function barClass(status: string) {
  const tone = activityStatusMeta[status]?.tone ?? "slate";
  return BAR_TONE_CLASS[tone] ?? BAR_TONE_CLASS.slate;
}

/** Contiguous month segments covering [minDate, minDate+totalDays) — for the header ruler. */
function monthBands(minDate: LocalDate, totalDays: number, dayWidth: number) {
  const bands: { key: string; label: string; x: number; w: number }[] = [];
  let i = 0;
  while (i < totalDays) {
    const date = addDays(minDate, i);
    const [y, m] = date.split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const dayOfMonth = Number(date.slice(8, 10));
    const span = Math.min(daysInMonth - dayOfMonth + 1, totalDays - i);
    bands.push({ key: date, label: `${MONTH_LABELS_ES[m - 1]} ${y}`, x: i * dayWidth, w: span * dayWidth });
    i += span;
  }
  return bands;
}

type Row =
  | { kind: "section"; key: string; label: string; status: string; done: number; total: number }
  | {
      kind: "item";
      key: string;
      workItemId: number;
      activityId: number;
      title: string;
      assigneeName: string | null;
      status: string;
      start: LocalDate | null;
      end: LocalDate | null;
      indent: boolean;
    };

/**
 * Read-only Gantt for one project's internal breakdown — activities (grouped
 * by list/phase, subactivities indented under their parent) as bars, project
 * milestones as vertical markers, and existing work-item dependencies
 * (already created via the Trabajo tab's "+ Dependencia") as connector
 * arrows. No new data model: reuses getProjectWorkTree/getProjectDependencies
 * /getProjectMilestones verbatim — this is a new visualization, not new data.
 */
export function ProjectGantt({
  tree,
  dependencies,
  milestones,
  now,
}: {
  tree: WorkTree;
  dependencies: Dependencies;
  milestones: Milestones;
  now: Date;
}) {
  const today = now.toISOString().slice(0, 10);

  const byList = new Map<number, ProjectTreeActivity[]>();
  for (const a of tree.activities) {
    if (a.parentActivityId !== null || a.listId === null) continue;
    const list = byList.get(a.listId);
    if (list) list.push(a);
    else byList.set(a.listId, [a]);
  }
  const childrenOf = (parentId: number) => tree.activities.filter((a) => a.parentActivityId === parentId);

  const rows: Row[] = [];
  for (const list of tree.lists) {
    const topLevel = byList.get(list.id) ?? [];
    if (topLevel.length === 0) continue;
    const flat: { a: ProjectTreeActivity; indent: boolean }[] = [];
    for (const a of topLevel) {
      flat.push({ a, indent: false });
      for (const child of childrenOf(a.activityId)) flat.push({ a: child, indent: true });
    }
    rows.push({
      kind: "section",
      key: `s${list.id}`,
      label: list.name,
      status: list.status,
      done: flat.filter((x) => x.a.status === "completed").length,
      total: flat.length,
    });
    for (const { a, indent } of flat) {
      rows.push({
        kind: "item",
        key: `a${a.activityId}`,
        workItemId: a.workItemId,
        activityId: a.activityId,
        title: a.title,
        assigneeName: a.assigneeName,
        status: a.status,
        start: a.startDate,
        end: a.dueDate,
        indent,
      });
    }
  }

  const allDates: LocalDate[] = [];
  for (const r of rows) {
    if (r.kind !== "item") continue;
    if (r.start) allDates.push(r.start);
    if (r.end) allDates.push(r.end);
  }
  for (const m of milestones) allDates.push(m.milestone.targetDate);

  if (allDates.length === 0) {
    return (
      <EmptyState icon={<GanttChartSquare />} title="Sin fechas para mostrar en el Gantt">
        Agrega fecha de inicio/vencimiento a las actividades, o una fecha objetivo a un hito, para verlas en la línea de tiempo.
      </EmptyState>
    );
  }

  const minDate = addDays(allDates.reduce((a, b) => (b < a ? b : a)), -PAD_DAYS);
  const maxDate = addDays(allDates.reduce((a, b) => (b > a ? b : a)), PAD_DAYS);
  const totalDays = daysBetween(minDate, maxDate) + 1;
  const timelineW = totalDays * DAY_W;

  // Y offsets computed in the same order rows render, so the SVG overlay lines up exactly.
  let cursorY = 0;
  const rowY = new Map<string, number>();
  for (const r of rows) {
    rowY.set(r.key, cursorY);
    cursorY += r.kind === "section" ? SECTION_H : ROW_H;
  }
  const rowsHeight = cursorY;

  const centerYByWorkItem = new Map<number, number>();
  const barXByWorkItem = new Map<number, { x1: number; x2: number }>();
  for (const r of rows) {
    if (r.kind !== "item") continue;
    const top = rowY.get(r.key)!;
    centerYByWorkItem.set(r.workItemId, top + ROW_H / 2);
    if (r.start || r.end) {
      const s = r.start ?? r.end!;
      const e = r.end ?? r.start!;
      const x1 = daysBetween(minDate, s) * DAY_W;
      const x2 = Math.max((daysBetween(minDate, e) + 1) * DAY_W, x1 + DAY_W * 0.6);
      barXByWorkItem.set(r.workItemId, { x1, x2 });
    }
  }

  const arrows = dependencies
    .map((d) => {
      const y1 = centerYByWorkItem.get(d.blockerWorkItemId);
      const y2 = centerYByWorkItem.get(d.blockedWorkItemId);
      const bx = barXByWorkItem.get(d.blockerWorkItemId);
      const kx = barXByWorkItem.get(d.blockedWorkItemId);
      if (y1 === undefined || y2 === undefined || !bx || !kx) return null;
      const x1 = bx.x2;
      const x2 = kx.x1;
      const midX = x1 + 10;
      return { key: `dep${d.id}`, path: `M ${x1} ${y1} L ${midX} ${y1} L ${midX} ${y2} L ${x2} ${y2}` };
    })
    .filter((a): a is { key: string; path: string } => a !== null);

  const milestoneMarks = milestones.map((m) => ({
    key: `m${m.milestone.id}`,
    x: daysBetween(minDate, m.milestone.targetDate) * DAY_W + DAY_W / 2,
    name: m.milestone.name,
    date: m.milestone.targetDate,
    status: m.milestone.status,
  }));

  const bands = monthBands(minDate, totalDays, DAY_W);
  const todayX = today >= minDate && today <= maxDate ? daysBetween(minDate, today) * DAY_W : null;
  const statusesUsed = [...new Set(rows.filter((r) => r.kind === "item").map((r) => r.status))];

  return (
    <div className="space-y-3">
      {milestoneMarks.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
          {milestoneMarks.map((m) => (
            <span key={m.key} className="inline-flex items-center gap-1 rounded-full border border-edge px-2 py-0.5">
              <span className="inline-block size-1.5 rotate-45 bg-primary" aria-hidden />
              {m.name} · {fmtDate(m.date)}
            </span>
          ))}
        </div>
      ) : null}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <div style={{ width: LABEL_W + timelineW }}>
            {/* header ruler */}
            <div className="sticky top-0 z-10 flex border-b border-edge bg-surface">
              <div className="shrink-0 border-r border-edge" style={{ width: LABEL_W, height: HEADER_H }} />
              <div className="relative" style={{ width: timelineW, height: HEADER_H }}>
                {bands.map((b) => (
                  <div
                    key={b.key}
                    className="absolute top-0 flex h-full items-center truncate border-l border-edge px-2 text-xs font-medium text-muted"
                    style={{ left: b.x, width: b.w }}
                  >
                    {b.label}
                  </div>
                ))}
                {milestoneMarks.map((m) => (
                  <div
                    key={m.key}
                    title={`${m.name} · ${fmtDate(m.date)}`}
                    className="absolute bottom-0.5 size-2 -translate-x-1/2 rotate-45 bg-primary"
                    style={{ left: m.x }}
                  />
                ))}
                {todayX !== null ? (
                  <div className="absolute bottom-0 -translate-x-1/2 text-[10px] font-semibold text-danger" style={{ left: todayX }}>
                    Hoy
                  </div>
                ) : null}
              </div>
            </div>

            {/* rows + overlay */}
            <div className="relative">
              <svg
                className="pointer-events-none absolute top-0"
                style={{ left: LABEL_W, width: timelineW, height: rowsHeight }}
                width={timelineW}
                height={rowsHeight}
              >
                <defs>
                  <marker id="gantt-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                    <path d="M0,0 L6,3 L0,6 Z" className="fill-faint" />
                  </marker>
                </defs>
                {milestoneMarks.map((m) => (
                  <line key={m.key} x1={m.x} x2={m.x} y1={0} y2={rowsHeight} className="stroke-primary/30" strokeDasharray="3 3" strokeWidth={1} />
                ))}
                {todayX !== null ? (
                  <line x1={todayX} x2={todayX} y1={0} y2={rowsHeight} className="stroke-danger/40" strokeDasharray="2 2" strokeWidth={1} />
                ) : null}
                {arrows.map((a) => (
                  <path key={a.key} d={a.path} fill="none" className="stroke-faint" strokeWidth={1.5} markerEnd="url(#gantt-arrow)" opacity={0.7} />
                ))}
              </svg>

              {rows.map((r) =>
                r.kind === "section" ? (
                  <div key={r.key} className="flex items-center bg-subtle/60" style={{ height: SECTION_H }}>
                    <div className="flex shrink-0 items-center gap-2 border-r border-edge px-3 text-xs font-semibold text-fg" style={{ width: LABEL_W }}>
                      <span className="truncate">{r.label}</span>
                      <Badge tone={projectListStatusMeta[r.status]?.tone ?? "slate"}>{projectListStatusMeta[r.status]?.label ?? r.status}</Badge>
                      <span className="ml-auto shrink-0 tabular-nums text-faint">{r.done}/{r.total}</span>
                    </div>
                    <div style={{ width: timelineW }} />
                  </div>
                ) : (
                  <div key={r.key} className="flex items-center border-b border-edge/60" style={{ height: ROW_H }}>
                    <div className={cx("shrink-0 truncate border-r border-edge px-3 text-xs", r.indent && "pl-7")} style={{ width: LABEL_W }}>
                      <Link href={`/activities/${r.activityId}`} className={cx("hover:text-primary", r.status === "completed" ? "text-muted line-through" : "text-fg")}>
                        {r.title}
                      </Link>
                      <span className="ml-1.5 text-faint">{r.assigneeName ?? "sin responsable"}</span>
                    </div>
                    <div className="relative" style={{ width: timelineW, height: ROW_H }}>
                      {(() => {
                        const bar = barXByWorkItem.get(r.workItemId);
                        if (!bar) return null;
                        return (
                          <div
                            title={`${r.title} · ${r.start ? fmtDate(r.start) : "?"} – ${r.end ? fmtDate(r.end) : "?"} · ${activityStatusMeta[r.status]?.label ?? r.status}`}
                            className={cx("absolute top-1/2 h-3.5 -translate-y-1/2 rounded-full", barClass(r.status))}
                            style={{ left: bar.x1 + 2, width: bar.x2 - bar.x1 - 4 }}
                          />
                        );
                      })()}
                    </div>
                  </div>
                ),
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted">
        {statusesUsed.map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span className={cx("size-2.5 rounded-full", barClass(s))} aria-hidden />
            {activityStatusMeta[s]?.label ?? s}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="size-1.5 rotate-45 bg-primary" aria-hidden />
          Hito
        </span>
        {arrows.length > 0 ? <span>→ dependencia</span> : null}
      </div>
    </div>
  );
}
