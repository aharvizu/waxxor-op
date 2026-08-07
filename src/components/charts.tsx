"use client";

import {
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart as RLineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LabelList,
} from "recharts";
import { cx } from "@/components/ui";

/**
 * Recharts wrappers for Watson's three chart forms (dataviz skill: bar for
 * magnitude-by-category, line for trend, sparkline for a stat-tile
 * accessory). Colors are CSS custom properties (--wx-chart-*, globals.css)
 * so light/dark follow the `.dark` class with no JS theme detection —
 * Recharts accepts any CSS color string in fill/stroke. Every chart here
 * returns null on empty data so the caller's existing list/table view stays
 * the single source of truth ("every chart has a table-view twin").
 */

const SERIES_COLOR = {
  primary: "var(--wx-chart-1)",
  accent: "var(--wx-chart-2)",
} as const;

type SeriesColor = keyof typeof SERIES_COLOR;

const AXIS_TICK_STYLE = { fill: "var(--wx-muted)", fontSize: 11 };
const GRID_STROKE = "var(--wx-edge)";
const LABEL_STYLE = { fill: "var(--wx-muted)", fontSize: 11 };

type TooltipPayloadEntry = { name?: string; value?: number; color?: string };

/** Shared tooltip chrome: value leads (bold, ink), series name follows (muted), a short color line-key never a filled box. */
function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  valueFormatter: (value: number) => string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-lg border border-edge bg-surface px-3 py-2 text-xs shadow-overlay">
      {label ? <div className="mb-1 font-medium text-fg">{label}</div> : null}
      <div className="space-y-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: p.color }} />
            {p.name ? <span className="text-muted">{p.name}</span> : null}
            <span className="ml-auto font-semibold tabular-nums text-fg">
              {typeof p.value === "number" ? valueFormatter(p.value) : "—"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Y-axis category tick — truncates long names (technician/client) with the full value in an SVG title, never clipped without a fallback. */
function CategoryTick({ x, y, payload }: { x?: number; y?: number; payload?: { value?: string | number } }) {
  const text = String(payload?.value ?? "");
  const truncated = text.length > 16 ? `${text.slice(0, 15)}…` : text;
  return (
    <g transform={`translate(${x},${y})`}>
      <title>{text}</title>
      <text dx={-8} dy={4} textAnchor="end" fill="var(--wx-muted)" fontSize={11}>
        {truncated}
      </text>
    </g>
  );
}

/* ------------------------------------------------------------------- bar */

export type BarChartSeries = { key: string; label: string; color?: SeriesColor };
export type BarChartDatum = { label: string; [seriesKey: string]: number | string };

/**
 * Horizontal bars (category names read left-to-right, never rotated) — one
 * hue for a single series, the two-color pair for a "creados vs cerrados"
 * comparison. Legend only appears for 2+ series (a single hue needs no
 * legend box, per the dataviz skill).
 */
export function BarChart({
  data,
  series,
  valueFormatter = (v) => String(v),
  className,
}: {
  data: BarChartDatum[];
  series: BarChartSeries[];
  valueFormatter?: (value: number) => string;
  className?: string;
}) {
  if (data.length === 0) return null;
  const rowHeight = series.length > 1 ? 40 : 32;
  const height = Math.max(140, data.length * rowHeight + 56 + (series.length > 1 ? 28 : 0));
  return (
    <div className={cx("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RBarChart data={data} layout="vertical" margin={{ top: 4, right: 44, bottom: 4, left: 4 }} barGap={2} barCategoryGap="28%">
          <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
          <XAxis type="number" tick={AXIS_TICK_STYLE} axisLine={{ stroke: GRID_STROKE }} tickLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="label" width={112} tick={<CategoryTick />} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
          <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} cursor={{ fill: "var(--wx-subtle)" }} />
          {series.length > 1 ? <Legend iconType="rect" iconSize={10} wrapperStyle={{ fontSize: 12, color: "var(--wx-muted)" }} /> : null}
          {series.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              name={s.label}
              fill={SERIES_COLOR[s.color ?? (i === 0 ? "primary" : "accent")]}
              radius={[0, 4, 4, 0]}
              barSize={series.length > 1 ? 14 : 18}
              isAnimationActive={false}
            >
              <LabelList dataKey={s.key} position="right" formatter={valueFormatter as (v: unknown) => string} style={LABEL_STYLE} />
            </Bar>
          ))}
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------------ line */

export type LineChartPoint = { label: string; value: number };

/** A trend across a handful of labeled points (period-over-period, not a dense time series). Single series only — no legend box. */
export function LineChart({
  data,
  color = "primary",
  valueFormatter = (v) => String(v),
  height = 180,
  className,
}: {
  data: LineChartPoint[];
  color?: SeriesColor;
  valueFormatter?: (value: number) => string;
  height?: number;
  className?: string;
}) {
  if (data.length === 0) return null;
  const stroke = SERIES_COLOR[color];
  return (
    <div className={cx("w-full", className)} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RLineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} />
          <XAxis dataKey="label" tick={AXIS_TICK_STYLE} axisLine={{ stroke: GRID_STROKE }} tickLine={false} />
          <YAxis tick={AXIS_TICK_STYLE} axisLine={false} tickLine={false} width={40} allowDecimals={false} />
          <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} cursor={{ stroke: GRID_STROKE }} />
          <Line
            type="monotone"
            dataKey="value"
            name="Valor"
            stroke={stroke}
            strokeWidth={2}
            dot={{ r: 4, fill: stroke, stroke: "var(--wx-surface)", strokeWidth: 2 }}
            activeDot={{ r: 5, fill: stroke, stroke: "var(--wx-surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ------------------------------------------------------------- sparkline */

export type SparklinePoint = { label: string; value: number };

type DotRenderProps = { cx?: number; cy?: number; index?: number };

/** Compact stat-tile trend accessory — thin line, no axes/grid, only the current (last) point marked. Needs ≥2 points to say anything. */
export function Sparkline({
  data,
  color = "primary",
  valueFormatter = (v) => String(v),
  width = 96,
  height = 28,
  className,
}: {
  data: SparklinePoint[];
  color?: SeriesColor;
  valueFormatter?: (value: number) => string;
  width?: number;
  height?: number;
  className?: string;
}) {
  if (data.length < 2) return null;
  const stroke = SERIES_COLOR[color];
  const lastIndex = data.length - 1;
  return (
    <div className={cx("inline-block", className)} style={{ width, height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RLineChart data={data} margin={{ top: 3, right: 3, bottom: 3, left: 3 }}>
          <Tooltip content={<ChartTooltip valueFormatter={valueFormatter} />} cursor={false} />
          <Line
            type="monotone"
            dataKey="value"
            stroke={stroke}
            strokeWidth={2}
            isAnimationActive={false}
            dot={(props: DotRenderProps) => (
              <circle
                key={`dot-${props.index}`}
                cx={props.cx}
                cy={props.cy}
                r={props.index === lastIndex ? 4 : 0}
                fill={stroke}
                stroke="var(--wx-surface)"
                strokeWidth={props.index === lastIndex ? 2 : 0}
              />
            )}
            activeDot={{ r: 4, fill: stroke, stroke: "var(--wx-surface)", strokeWidth: 2 }}
          />
        </RLineChart>
      </ResponsiveContainer>
    </div>
  );
}
