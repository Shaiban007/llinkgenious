import Link from "next/link";
import { and, asc, eq } from "drizzle-orm";
import { db, employeePerformance } from "@/db";
import { requireSession } from "@/lib/session";
import { kpiScore, kraScore, listMembers, loadKpiRows, loadKraRows, overallScore, PERIODS, ratingFor, resolvePeriod } from "@/lib/performance";
import { ACHIEVEMENT_TONE } from "@/lib/kpi-catalog";
import { fmtPct } from "@/lib/format";
import { fmtDate, fmtNumber } from "@/lib/utils";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { GroupedBars, RankedBars, TrendChart } from "@/components/charts";
import { COLORS } from "@/lib/chart-colors";
import { SubmitButton } from "@/components/submit-button";
import { saveSnapshotAction } from "@/app/actions/performance";

export const metadata = { title: "Employee Performance" };
export const dynamic = "force-dynamic";

export default async function PerformancePage({ searchParams }: { searchParams: { period?: string } }) {
  const s = await requireSession();
  const period = resolvePeriod(searchParams.period ?? "this_month", s.workspace.timezone);
  const all = await listMembers(s.workspace.id);
  const members = s.isWsAdmin ? all : all.filter((m) => m.id === s.user.id);
  const kraAll = await loadKraRows({ workspaceId: s.workspace.id, userId: s.isWsAdmin ? null : s.user.id, which: period.key.startsWith("last") ? "previous" : "current", scoring: s.workspace.settings.scoring, tz: s.workspace.timezone, teamSize: all.length });

  const people = [];
  for (const m of members) {
    const { rows, metrics } = await loadKpiRows({ workspaceId: s.workspace.id, userId: m.id, period, scoring: s.workspace.settings.scoring, teamSize: all.length });
    const kpi = kpiScore(rows);
    const kra = kraScore(kraAll.filter((r) => r.userId === m.id));
    const overall = overallScore(kpi, kra);
    people.push({ m, metrics, kpi, kra, overall, rating: ratingFor(overall) });
  }

  const history = await db
    .select()
    .from(employeePerformance)
    .where(and(eq(employeePerformance.workspaceId, s.workspace.id), s.isWsAdmin ? undefined : eq(employeePerformance.userId, s.user.id)))
    .orderBy(asc(employeePerformance.periodStart));
  const byPeriod = new Map<string, number[]>();
  for (const h of history) {
    const vals = [h.kpiAchievement, h.kraAchievement].filter((v): v is string => v !== null).map(Number);
    if (!vals.length) continue;
    const key = h.periodStart.toISOString();
    byPeriod.set(key, [...(byPeriod.get(key) ?? []), vals.reduce((a, b) => a + b, 0) / vals.length]);
  }
  const trend = [...byPeriod.entries()].map(([k, v]) => ({ label: fmtDate(new Date(k), "MMM yy"), full: `Period starting ${fmtDate(new Date(k))}`, value: Math.round(v.reduce((a, b) => a + b, 0) / v.length) }));

  return (
    <>
      <PageHeader
        title="Employee Performance"
        subtitle={s.isWsAdmin ? "Everyone’s results next to their KPI and KRA scores." : "Your results, KPI score and KRA score."}
        actions={s.isWsAdmin ? <form action={saveSnapshotAction}><input type="hidden" name="period" value={period.key} /><SubmitButton variant="secondary" pendingText="Saving…">Save snapshot of {period.label.toLowerCase()}</SubmitButton></form> : undefined}
      />
      <form method="get" className="mb-5 flex items-end gap-2">
        <label className="text-xs font-semibold text-navy-500">Period<select name="period" defaultValue={period.key} className="input mt-1 !w-auto">{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <button className="btn-secondary">Apply</button>
      </form>

      <div className="mb-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <GroupedBars title="Leads created, qualified and converted" subtitle={period.label} data={people.map((p) => ({ label: p.m.name, created: p.metrics.leadsGenerated, qualified: p.metrics.qualified, converted: p.metrics.converted }))} series={[{ key: "created", label: "Created", color: COLORS.blue }, { key: "qualified", label: "Qualified", color: COLORS.orange }, { key: "converted", label: "Converted", color: COLORS.aqua }]} />
        <RankedBars title="Overall performance score" subtitle="Average of KPI score and KRA score (people with neither are left out)" data={people.filter((p) => p.overall !== null).sort((a, b) => b.overall! - a.overall!).map((p) => ({ label: p.m.name, value: Math.round(p.overall!) }))} valueLabel="Score %" categoryLabel="Person" />
      </div>

      <Card className="mb-5">
        <CardHeader title={period.label} subtitle="Activity counts come straight from leads, stage history and tasks" />
        {people.length === 0 ? <EmptyState title="No team members" /> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px]">
              <thead><tr>{["Person", "Leads", "Qualified", "Contacted", "Follow-ups done", "Meetings", "Proposals", "Converted", "Conv. rate", "Tasks done", "Overdue", "KPI", "KRA", "Overall"].map((h, i) => <th key={h} className={`th ${i > 0 ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
              <tbody>
                {people.map(({ m, metrics: x, kpi, kra, overall, rating }) => (
                  <tr key={m.id} className="hover:bg-navy-50/50">
                    <td className="td font-semibold">{m.name}</td>
                    {[x.leadsGenerated, x.qualified, x.contacted, x.followUpsCompleted, x.meetings, x.proposals, x.converted].map((v, i) => <td key={i} className="td text-right tabular-nums">{fmtNumber(v)}</td>)}
                    <td className="td text-right tabular-nums">{x.conversionRate.toFixed(1)}%</td>
                    <td className="td text-right tabular-nums">{fmtNumber(x.tasksCompleted)}</td>
                    <td className="td text-right tabular-nums">{fmtNumber(x.overdueFollowUps)}</td>
                    <td className="td text-right tabular-nums">{fmtPct(kpi)}</td>
                    <td className="td text-right tabular-nums">{fmtPct(kra)}</td>
                    <td className="td text-right"><span className="mr-2 font-semibold tabular-nums">{fmtPct(overall)}</span><Badge tone={ACHIEVEMENT_TONE[rating]}>{rating}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <TrendChart title="Performance history" subtitle="Saved snapshots (average of KPI and KRA scores)" data={trend} unit="%" valueLabel="Score" color={COLORS.aqua} />
      <p className="mt-3 text-xs text-navy-400">Targets live on <Link href="/kpi" className="font-semibold text-brand-600">KPIs</Link> and <Link href="/kra" className="font-semibold text-brand-600">KRA</Link>. History appears once an administrator saves a snapshot.</p>
    </>
  );
}
