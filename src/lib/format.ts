import type { KpiDef } from "./kpi-catalog";

export function fmtKpi(def: Pick<KpiDef, "unit">, v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  if (def.unit === "percent") return `${v.toFixed(1)}%`;
  if (def.unit === "hours") return `${v.toFixed(1)} h`;
  if (def.unit === "score") return v.toFixed(1);
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}
export const fmtPct = (v: number | null | undefined) => (v === null || v === undefined ? "—" : `${v.toFixed(0)}%`);
