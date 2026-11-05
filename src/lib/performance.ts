/**
 * KPI / KRA / employee-performance maths. Everything is computed from real records via computeMetrics().
 *  - KPI achievement % = actual ÷ target (or target ÷ actual when LOWER is better).
 *  - KRA weighted score = Σ(min(achievement, 100%) × weight) ÷ Σ weight. Capping at 100% stops one
 *    over-achieved goal from hiding a missed one.
 *  - Overall performance = average of the KPI score and the KRA score that exist for that person.
 */
import { and, eq, isNull } from "drizzle-orm";
import { db, kpiTargets, kras, users, workspaceMembers } from "@/db";
import { computeMetrics, daysIn, kpiValues, type Metrics, type Range } from "./metrics";
import { achievementPct, achievementStatus, KPI_BY_KEY, KPI_CATALOG, type AchievementStatus, type KpiDef } from "./kpi-catalog";
import { addDays, startOfMonthTz } from "./utils";
import type { ScoringConfig } from "./workspace-settings";

export type PeriodKey = "this_month" | "last_month" | "this_quarter" | "last_quarter";
export type Period = Range & { key: PeriodKey; label: string; days: number };

export const PERIODS: [PeriodKey, string][] = [
  ["this_month", "This month"],
  ["last_month", "Last month"],
  ["this_quarter", "This quarter"],
  ["last_quarter", "Last quarter"],
];

function localYm(d: Date, tz: string) {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: tz, year: "numeric", month: "numeric" }).formatToParts(d);
  return { y: Number(p.find((x) => x.type === "year")!.value), m: Number(p.find((x) => x.type === "month")!.value) };
}

/** Start of the month `offset` months from `ref` (workspace timezone). */
function monthStart(ref: Date, tz: string, offset: number) {
  let d = startOfMonthTz(ref, tz);
  for (let i = 0; i < Math.abs(offset); i++) d = offset > 0 ? startOfMonthTz(addDays(d, 32), tz) : startOfMonthTz(addDays(d, -1), tz);
  return d;
}

export function resolvePeriod(key: string, tz: string, now = new Date()): Period {
  const k = (PERIODS.some(([p]) => p === key) ? key : "this_month") as PeriodKey;
  const label = PERIODS.find(([p]) => p === k)![1];
  let from: Date;
  let to: Date;
  if (k === "this_month" || k === "last_month") {
    from = monthStart(now, tz, k === "this_month" ? 0 : -1);
    to = monthStart(from, tz, 1);
  } else {
    const { m } = localYm(now, tz);
    const intoQuarter = (m - 1) % 3; // months since quarter start
    const thisQ = monthStart(now, tz, -intoQuarter);
    from = k === "this_quarter" ? thisQ : monthStart(thisQ, tz, -3);
    to = monthStart(from, tz, 3);
  }
  return { key: k, label, from, to, days: daysIn({ from, to }) };
}

/** Count-type targets are stored per month, so longer periods scale them up. Rates, hours, scores and snapshots never scale. */
export function scaleTarget(def: KpiDef, target: number, period: Period) {
  const perUnit = ["NEW_LEADS_PER_DAY", "NEW_LEADS_PER_WEEK", "NEW_LEADS_PER_MONTH", "LEADS_PER_EMPLOYEE", "OVERDUE_FOLLOWUPS"].includes(def.key);
  if (def.unit !== "count" || perUnit) return target;
  return target * (period.days / 30);
}

export type KpiRow = { def: KpiDef; actual: number | null; target: number | null; pct: number | null; status: AchievementStatus };

export async function loadKpiRows(opts: { workspaceId: string; userId: string | null; period: Period; scoring: ScoringConfig; teamSize: number; metrics?: Metrics }): Promise<{ rows: KpiRow[]; metrics: Metrics }> {
  const m = opts.metrics ?? (await computeMetrics({ workspaceId: opts.workspaceId, userId: opts.userId }, opts.period, opts.scoring));
  const values = kpiValues(m, opts.period.days, opts.teamSize);
  const targets = await db
    .select()
    .from(kpiTargets)
    .where(and(eq(kpiTargets.workspaceId, opts.workspaceId), eq(kpiTargets.period, "MONTHLY"), opts.userId ? eq(kpiTargets.userId, opts.userId) : isNull(kpiTargets.userId)));
  const tmap = new Map(targets.map((t) => [t.kpiKey, Number(t.target)]));
  const rows = KPI_CATALOG.map((def) => {
    const actual = values[def.key] ?? null;
    const raw = tmap.get(def.key);
    const target = raw === undefined ? null : scaleTarget(def, raw, opts.period);
    // A KPI with no data (for example no leads → no average score) is not scored rather than scored as zero.
    const pct = actual === null ? null : achievementPct(actual, target, def.higherIsBetter);
    return { def, actual, target, pct, status: achievementStatus(pct) };
  });
  return { rows, metrics: m };
}

export function kpiScore(rows: KpiRow[]): number | null {
  const scored = rows.filter((r) => r.pct !== null);
  if (!scored.length) return null;
  return scored.reduce((s, r) => s + Math.min(r.pct!, 100), 0) / scored.length;
}

export type KraRow = {
  id: string;
  name: string;
  description: string | null;
  userId: string;
  userName: string;
  metricKey: string | null;
  measurement: string | null;
  period: "MONTHLY" | "QUARTERLY";
  weightage: number;
  target: number;
  actual: number | null;
  pct: number | null;
  status: AchievementStatus;
  reviewNotes: string | null;
  manual: boolean;
};

export async function loadKraRows(opts: { workspaceId: string; userId: string | null; which: "current" | "previous"; scoring: ScoringConfig; tz: string; teamSize: number }): Promise<KraRow[]> {
  const list = await db
    .select({ k: kras, name: users.name })
    .from(kras)
    .innerJoin(users, eq(users.id, kras.assignedTo))
    .where(and(eq(kras.workspaceId, opts.workspaceId), opts.userId ? eq(kras.assignedTo, opts.userId) : undefined))
    .orderBy(users.name, kras.name);
  const cache = new Map<string, Metrics>();
  const out: KraRow[] = [];
  for (const { k, name } of list) {
    const period = resolvePeriod(k.period === "MONTHLY" ? (opts.which === "current" ? "this_month" : "last_month") : opts.which === "current" ? "this_quarter" : "last_quarter", opts.tz);
    let actual: number | null = null;
    let manual = false;
    const def = k.metricKey ? KPI_BY_KEY[k.metricKey] : undefined;
    if (def && k.metricKey) {
      const ck = `${k.assignedTo}:${period.key}`;
      if (!cache.has(ck)) cache.set(ck, await computeMetrics({ workspaceId: opts.workspaceId, userId: k.assignedTo }, period, opts.scoring));
      actual = kpiValues(cache.get(ck)!, period.days, opts.teamSize)[k.metricKey] ?? null;
    } else if (k.manualActual !== null) {
      actual = Number(k.manualActual);
      manual = true;
    }
    const target = Number(k.target);
    const pct = actual === null ? null : achievementPct(actual, target, def?.higherIsBetter ?? true);
    out.push({ id: k.id, name: k.name, description: k.description, userId: k.assignedTo, userName: name, metricKey: k.metricKey, measurement: k.measurement, period: k.period, weightage: k.weightage, target, actual, pct, status: achievementStatus(pct), reviewNotes: k.reviewNotes, manual });
  }
  return out;
}

export function kraScore(rows: KraRow[]): number | null {
  const scored = rows.filter((r) => r.pct !== null);
  const w = scored.reduce((s, r) => s + r.weightage, 0);
  if (!w) return null;
  return scored.reduce((s, r) => s + Math.min(r.pct!, 100) * r.weightage, 0) / w;
}

export function overallScore(kpi: number | null, kra: number | null): number | null {
  const parts = [kpi, kra].filter((v): v is number => v !== null);
  return parts.length ? parts.reduce((a, b) => a + b, 0) / parts.length : null;
}

export function ratingFor(score: number | null): AchievementStatus {
  return achievementStatus(score === null ? null : score);
}

export async function listMembers(workspaceId: string) {
  return db
    .select({ id: users.id, name: users.name, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(users.name);
}


