"use client";

/**
 * Charts follow one visual system: categorical blue / orange / aqua, an ordinal blue ramp for ranked
 * or ordered data, thin gridlines, and a "Table" toggle on every chart so the exact numbers are always
 * one click away (and readable by screen readers).
 */
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { COLORS, ORDINAL } from "@/lib/chart-colors";


const AXIS = { fontSize: 11, fill: "#6c7aa6" };
const GRID = "#e6eaf4";

type Point = { label: string; value: number; full?: string };

function Shell({
  title,
  subtitle,
  columns,
  rows,
  empty,
  children,
  height = 260,
}: {
  title: string;
  subtitle?: string;
  columns: string[];
  rows: (string | number)[][];
  empty: boolean;
  children: React.ReactNode;
  height?: number;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  return (
    <section className="card flex flex-col" aria-label={title}>
      <div className="flex items-start justify-between gap-3 border-b border-navy-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-navy-900">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-navy-400">{subtitle}</p>}
        </div>
        <div className="inline-flex rounded-lg border border-navy-200 p-0.5" role="group" aria-label="Chart or table view">
          {(["chart", "table"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={cn("inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold", view === v ? "bg-navy-900 text-white" : "text-navy-500 hover:bg-navy-50")}
            >
              {v === "chart" ? <BarChart3 size={12} /> : <Table2 size={12} />}
              {v === "chart" ? "Chart" : "Table"}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 px-3 pb-4 pt-4" style={{ minHeight: height }}>
        {empty ? (
          <div className="flex h-full min-h-[200px] items-center justify-center px-6 text-center text-sm text-navy-400">
            No data for this period yet. Add leads to the CRM and this chart will fill in.
          </div>
        ) : view === "chart" ? (
          <div style={{ height }}>{children}</div>
        ) : (
          <div className="max-h-[300px] overflow-auto px-2">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  {columns.map((c, i) => (
                    <th key={c} className={cn("th", i > 0 && "text-right")}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    {r.map((cell, j) => (
                      <td key={j} className={cn("td", j > 0 && "text-right tabular-nums")}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

const tooltipStyle = { borderRadius: 10, border: "1px solid #e6eaf4", fontSize: 12, boxShadow: "0 4px 16px rgba(13,21,48,.08)" };

export function TrendChart({ title, subtitle, data, unit = "", color = COLORS.blue, valueLabel = "Leads" }: { title: string; subtitle?: string; data: Point[]; unit?: string; color?: string; valueLabel?: string }) {
  const empty = data.length === 0 || data.every((d) => d.value === 0);
  const tickEvery = Math.max(0, Math.ceil(data.length / 8) - 1);
  return (
    <Shell title={title} subtitle={subtitle} empty={empty} columns={["Period", valueLabel]} rows={data.map((d) => [d.full ?? d.label, `${d.value}${unit}`])}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} interval={tickEvery} tickLine={false} axisLine={{ stroke: GRID }} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} unit={unit} />
          <Tooltip contentStyle={tooltipStyle} labelFormatter={(_l, p) => p?.[0]?.payload?.full ?? _l} formatter={(v: number) => [`${v}${unit}`, valueLabel]} />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.25} dot={data.length <= 31 ? { r: 2.5, fill: color } : false} activeDot={{ r: 4 }} />
        </LineChart>
      </ResponsiveContainer>
    </Shell>
  );
}

/** Horizontal ranked bars. `ordinal` colours by rank (dark → light) for ordered data like score bands. */
export function RankedBars({ title, subtitle, data, ordinal = false, color = COLORS.blue, valueLabel = "Leads", categoryLabel = "Category" }: { title: string; subtitle?: string; data: Point[]; ordinal?: boolean; color?: string; valueLabel?: string; categoryLabel?: string }) {
  const empty = data.length === 0 || data.every((d) => d.value === 0);
  return (
    <Shell title={title} subtitle={subtitle} empty={empty} columns={[categoryLabel, valueLabel]} rows={data.map((d) => [d.label, d.value])}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 0 }}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
          <YAxis type="category" dataKey="label" tick={AXIS} width={118} tickLine={false} axisLine={false} interval={0} tickFormatter={(v: string) => (v.length > 18 ? v.slice(0, 17) + "…" : v)} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f4f6fb" }} formatter={(v: number) => [v, valueLabel]} />
          <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18} label={{ position: "right", fontSize: 11, fill: "#4a5a88" }}>
            {data.map((_, i) => (
              <Cell key={i} fill={ordinal ? ORDINAL[Math.min(i, ORDINAL.length - 1)] : color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Shell>
  );
}

/** Vertical bars, one colour per point — used for the pipeline stages (ordered left → right). */
export function StageBars({ title, subtitle, data, valueLabel = "Leads" }: { title: string; subtitle?: string; data: Point[]; valueLabel?: string }) {
  const empty = data.length === 0 || data.every((d) => d.value === 0);
  return (
    <Shell title={title} subtitle={subtitle} empty={empty} columns={["Stage", valueLabel]} rows={data.map((d) => [d.label, d.value])}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 16, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={0} angle={-20} textAnchor="end" height={50} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f4f6fb" }} formatter={(v: number) => [v, valueLabel]} />
          <Bar dataKey="value" fill={COLORS.blue} radius={[6, 6, 0, 0]} maxBarSize={36} label={{ position: "top", fontSize: 11, fill: "#4a5a88" }} />
        </BarChart>
      </ResponsiveContainer>
    </Shell>
  );
}

export function GroupedBars({
  title,
  subtitle,
  data,
  series,
  categoryLabel = "Person",
}: {
  title: string;
  subtitle?: string;
  data: Record<string, string | number>[];
  series: { key: string; label: string; color: string }[];
  categoryLabel?: string;
}) {
  const empty = data.length === 0 || data.every((d) => series.every((s) => !d[s.key]));
  return (
    <Shell title={title} subtitle={subtitle} empty={empty} columns={[categoryLabel, ...series.map((s) => s.label)]} rows={data.map((d) => [String(d.label), ...series.map((s) => Number(d[s.key] ?? 0))])}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} interval={0} tickFormatter={(v: string) => (v.length > 12 ? v.slice(0, 11) + "…" : v)} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f4f6fb" }} />
          <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) => (
            <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={22} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </Shell>
  );
}
