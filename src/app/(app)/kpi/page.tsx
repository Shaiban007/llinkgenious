import { requireSession } from "@/lib/session";
import { listMembers, kpiScore, loadKpiRows, PERIODS, resolvePeriod, scaleTarget } from "@/lib/performance";
import { ACHIEVEMENT_TONE } from "@/lib/kpi-catalog";
import { fmtKpi, fmtPct } from "@/lib/format";
import { Badge, Card, CardHeader, PageHeader, ProgressBar, StatCard } from "@/components/ui";
import { RankedBars } from "@/components/charts";
import { SubmitButton } from "@/components/submit-button";
import { saveKpiTargetsAction } from "@/app/actions/performance";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "KPIs" };
export const dynamic = "force-dynamic";

export default async function KpiPage({ searchParams }: { searchParams: { period?: string; who?: string } }) {
  const s = await requireSession();
  const period = resolvePeriod(searchParams.period ?? "this_month", s.workspace.timezone);
  const members = await listMembers(s.workspace.id);
  // Members only ever see themselves. Administrators can look at the team or any person.
  const who = !s.isWsAdmin ? s.user.id : searchParams.who && members.some((m) => m.id === searchParams.who) ? searchParams.who : "team";
  const userId = who === "team" ? null : who;
  const { rows } = await loadKpiRows({ workspaceId: s.workspace.id, userId, period, scoring: s.workspace.settings.scoring, teamSize: members.length });
  const score = kpiScore(rows);
  const count = (st: string) => rows.filter((r) => r.status === st).length;
  const categories = [...new Set(rows.map((r) => r.def.category))];
  const chart = rows.filter((r) => r.pct !== null && r.target !== null).map((r) => ({ label: r.def.name, value: Math.round(Math.min(r.pct!, 150)) }));
  const whoName = who === "team" ? "the whole team" : members.find((m) => m.id === who)?.name ?? "";

  return (
    <>
      <PageHeader title="KPIs" subtitle={`Key performance indicators for ${whoName}, ${period.label.toLowerCase()} (${fmtDate(period.from)} – ${fmtDate(new Date(period.to.getTime() - 1))}). Every number is calculated from your real leads, tasks and stage history.`} />
      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-navy-500">Period
          <select name="period" defaultValue={period.key} className="input mt-1 !w-auto">{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
        </label>
        {s.isWsAdmin && (
          <label className="text-xs font-semibold text-navy-500">Show
            <select name="who" defaultValue={who} className="input mt-1 !w-auto"><option value="team">Whole team</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          </label>
        )}
        <button className="btn-secondary">Apply</button>
      </form>

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="KPI score" value={score === null ? "—" : `${score.toFixed(0)}%`} hint="average of KPIs with a target (each capped at 100%)" />
        <StatCard label="Exceeding target" value={String(count("Exceeding Target"))} />
        <StatCard label="On track" value={String(count("On Track"))} />
        <StatCard label="Needs attention" value={String(count("Needs Improvement") + count("Below Target"))} />
      </div>

      {chart.length > 0 ? (
        <div className="mb-5"><RankedBars title="Achievement by KPI" subtitle="% of target reached (capped at 150%)" data={chart} valueLabel="% of target" categoryLabel="KPI" /></div>
      ) : (
        <Card className="mb-5"><div className="p-5 text-sm text-navy-500">No KPI has both a target and data for this selection yet.{s.isWsAdmin ? " Set targets below." : " Ask your administrator to set targets."}</div></Card>
      )}

      {categories.map((cat) => (
        <Card key={cat} className="mb-5">
          <CardHeader title={cat} />
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead><tr><th className="th">KPI</th><th className="th text-right">Actual</th><th className="th text-right">Target</th><th className="th w-48">Achievement</th><th className="th">Status</th></tr></thead>
              <tbody>
                {rows.filter((r) => r.def.category === cat).map((r) => (
                  <tr key={r.def.key}>
                    <td className="td"><p className="font-semibold">{r.def.name}</p><p className="text-xs text-navy-400">{r.def.description}{!r.def.higherIsBetter && " Lower is better."}</p></td>
                    <td className="td text-right tabular-nums">{fmtKpi(r.def, r.actual)}</td>
                    <td className="td text-right tabular-nums">{r.target === null ? <span className="text-navy-300">not set</span> : fmtKpi(r.def, r.target)}</td>
                    <td className="td">{r.pct === null ? <span className="text-xs text-navy-300">—</span> : <div className="flex items-center gap-2"><div className="flex-1"><ProgressBar pct={r.pct} /></div><span className="w-10 text-right text-xs tabular-nums text-navy-500">{fmtPct(r.pct)}</span></div>}</td>
                    <td className="td"><Badge tone={ACHIEVEMENT_TONE[r.status]}>{r.status}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      {s.isWsAdmin && (
        <Card>
          <CardHeader title={`Set monthly targets for ${whoName}`} subtitle="Leave a box empty for no target. A person without their own targets shows “not set” — team targets are for the whole team." />
          <form action={saveKpiTargetsAction} className="p-5">
            <input type="hidden" name="who" value={who} />
            <input type="hidden" name="period" value={period.key} />
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {rows.map((r) => (
                <label key={r.def.key} className="block text-xs font-semibold text-navy-500">{r.def.name}
                  <input name={`t_${r.def.key}`} type="number" step="any" min={0} defaultValue={r.target === null ? "" : Number((r.target / scaleTarget(r.def, 1, period)).toFixed(2))} className="input mt-1 font-normal" />
                </label>
              ))}
            </div>
            <div className="mt-4"><SubmitButton>Save targets</SubmitButton></div>
          </form>
        </Card>
      )}
    </>
  );
}
