import Link from "next/link";
import { requireSession } from "@/lib/session";
import { loadAnalytics } from "@/lib/analytics";
import { resolveRange, fmtDate, cn } from "@/lib/utils";
import { STATUS_LABEL, type LeadStatus } from "@/lib/constants";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { RankedBars, StageBars } from "@/components/charts";
import { COLORS } from "@/lib/chart-colors";

export const metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

const PRESETS = [["7d", "7 days"], ["30d", "30 days"], ["90d", "90 days"]] as const;
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "—");

export default async function AnalyticsPage({ searchParams }: { searchParams: { range?: string; from?: string; to?: string } }) {
  const s = await requireSession();
  const range = resolveRange(searchParams, s.workspace.timezone);
  const a = await loadAnalytics(s.workspace.id, range, s.workspace.settings.scoring);
  const e = a.emails;

  return (
    <>
      <PageHeader title="Analytics" subtitle={`What is working, ${range.label.toLowerCase()} (${fmtDate(range.from)} – ${fmtDate(new Date(range.to.getTime() - 1))}). Only leads in the CRM are counted.`} />
      <div className="mb-5 inline-flex rounded-lg border border-navy-200 bg-white p-0.5">
        {PRESETS.map(([k, l]) => <Link key={k} href={`/analytics?range=${k}`} className={cn("rounded-md px-3 py-1.5 text-xs font-semibold", range.key === k ? "bg-navy-900 text-white" : "text-navy-600 hover:bg-navy-50")}>{l}</Link>)}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <StageBars title="Sales funnel" subtitle="Leads that reached each stage in this period" data={a.steps.map((x) => ({ label: x.label, value: x.value }))} />
        <Card>
          <CardHeader title="Stage-to-stage conversion" subtitle="Share of the previous stage that reached the next one" />
          <div className="overflow-x-auto"><table className="w-full min-w-[460px]"><thead><tr><th className="th">From → To</th><th className="th text-right">From</th><th className="th text-right">To</th><th className="th text-right">Rate</th></tr></thead>
            <tbody>{a.steps.slice(1).map((x, i) => <tr key={x.key}><td className="td">{a.steps[i].label} → {x.label}</td><td className="td text-right tabular-nums">{a.steps[i].value}</td><td className="td text-right tabular-nums">{x.value}</td><td className="td text-right tabular-nums">{pct(x.value, a.steps[i].value)}</td></tr>)}</tbody></table></div>
          <p className="px-5 pb-4 text-xs text-navy-400">Leads can reach a stage that was added in an earlier period, so a rate above 100% just means older leads progressed.</p>
        </Card>
        <RankedBars title="Lead sources" subtitle="Where your leads came from" data={a.sources.map((x) => ({ label: x.source, value: x.leads }))} categoryLabel="Source" />
        <Card>
          <CardHeader title="Source quality" subtitle="Which sources produce qualified and converted leads" />
          <div className="overflow-x-auto"><table className="w-full min-w-[480px]"><thead><tr><th className="th">Source</th><th className="th text-right">Leads</th><th className="th text-right">Qualified</th><th className="th text-right">Converted</th><th className="th text-right">Avg score</th></tr></thead>
            <tbody>{a.sources.length === 0 && <tr><td colSpan={5} className="td text-navy-400">No data yet.</td></tr>}{a.sources.map((x) => <tr key={x.source}><td className="td">{x.source}</td><td className="td text-right tabular-nums">{x.leads}</td><td className="td text-right tabular-nums">{x.qualified} <span className="text-xs text-navy-400">({pct(x.qualified, x.leads)})</span></td><td className="td text-right tabular-nums">{x.converted} <span className="text-xs text-navy-400">({pct(x.converted, x.leads)})</span></td><td className="td text-right tabular-nums">{x.avgScore ?? "—"}</td></tr>)}</tbody></table></div>
        </Card>
        <Card>
          <CardHeader title="Does the score predict results?" subtitle="Outcome by score band — if High-band leads convert more, the scoring rules are working" />
          <div className="overflow-x-auto"><table className="w-full min-w-[460px]"><thead><tr><th className="th">Band</th><th className="th text-right">Leads</th><th className="th text-right">Qualified</th><th className="th text-right">Converted</th><th className="th text-right">Conversion</th></tr></thead>
            <tbody>{a.bands.length === 0 && <tr><td colSpan={5} className="td text-navy-400">No data yet.</td></tr>}{a.bands.map((x) => <tr key={x.band}><td className="td">{x.band}</td><td className="td text-right tabular-nums">{x.leads}</td><td className="td text-right tabular-nums">{x.qualified}</td><td className="td text-right tabular-nums">{x.converted}</td><td className="td text-right tabular-nums">{pct(x.converted, x.leads)}</td></tr>)}</tbody></table></div>
        </Card>
        <Card>
          <CardHeader title="Time spent in each stage" subtitle="Average days leads stayed before moving on" />
          <div className="overflow-x-auto"><table className="w-full min-w-[460px]"><thead><tr><th className="th">Stage</th><th className="th text-right">Leads that moved on</th><th className="th text-right">Avg days</th></tr></thead>
            <tbody>{a.stageTime.length === 0 && <tr><td colSpan={3} className="td text-navy-400">Not enough movement yet.</td></tr>}{a.stageTime.map((x) => <tr key={x.status}><td className="td">{STATUS_LABEL[x.status as LeadStatus] ?? x.status}</td><td className="td text-right tabular-nums">{x.visits}</td><td className="td text-right tabular-nums">{x.avgDays ?? "—"}</td></tr>)}</tbody></table></div>
        </Card>
        <RankedBars title="Countries" subtitle="Where your leads are" data={a.countries.map((x) => ({ label: x.country, value: x.leads }))} color={COLORS.orange} categoryLabel="Country" />
        <Card>
          <CardHeader title="Email outreach" subtitle="Emails created in this period" />
          <dl className="grid grid-cols-2 gap-4 p-5 text-sm sm:grid-cols-5">
            {[["Drafts", e.DRAFT], ["Approved", e.APPROVED], ["Sent", e.SENT], ["Failed", e.FAILED], ["Rejected", e.REJECTED]].map(([l, v]) => <div key={String(l)}><dt className="text-xs font-semibold uppercase text-navy-400">{l}</dt><dd className="mt-1 text-xl font-bold text-navy-900">{v ?? 0}</dd></div>)}
          </dl>
          <p className="px-5 pb-4 text-xs text-navy-400">Opens and replies are not tracked — record a reply by moving the lead’s status or adding a note.</p>
        </Card>
      </div>
    </>
  );
}
