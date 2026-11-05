import { Download } from "lucide-react";
import { requireSession } from "@/lib/session";
import { buildReport, REPORT_TYPES, type ReportKey } from "@/lib/reports";
import { listMembers, PERIODS } from "@/lib/performance";
import { Card, CardHeader, PageHeader } from "@/components/ui";

export const metadata = { title: "Reports" };
export const dynamic = "force-dynamic";

export default async function ReportsPage({ searchParams }: { searchParams: Record<string, string | undefined> }) {
  const s = await requireSession();
  const members = await listMembers(s.workspace.id);
  const sel = (REPORT_TYPES.find((t) => t.key === searchParams.type)?.key ?? "leads") as ReportKey;
  const meta = REPORT_TYPES.find((t) => t.key === sel)!;
  const q: Record<string, string> = {};
  for (const [k, v] of Object.entries(searchParams)) if (typeof v === "string" && v) q[k] = v;
  const data = await buildReport(sel, s, q);
  const qs = new URLSearchParams(Object.entries(q).filter(([k]) => k !== "type" && k !== "format")).toString();
  const dl = (f: string) => `/api/reports/${sel}?${qs ? qs + "&" : ""}format=${f}`;

  return (
    <>
      <PageHeader title="Reports" subtitle="Choose a report, adjust the period, preview it, then download it as CSV, Excel or PDF." />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-4">
        <Card className="h-fit">
          <CardHeader title="Report" />
          <form method="get" className="space-y-3 p-5">
            <label className="block"><span className="label">Type</span><select name="type" defaultValue={sel} className="input">{REPORT_TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select></label>
            <p className="text-xs text-navy-400">{meta.desc}</p>
            {meta.range === "dates" && (<>
              <label className="block"><span className="label">Period</span><select name="range" defaultValue={searchParams.range ?? "30d"} className="input"><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option><option value="custom">Custom dates</option></select></label>
              <div className="grid grid-cols-2 gap-2"><label className="block"><span className="label">From</span><input type="date" name="from" defaultValue={searchParams.from} className="input" /></label><label className="block"><span className="label">To</span><input type="date" name="to" defaultValue={searchParams.to} className="input" /></label></div>
              <p className="text-[11px] text-navy-400">Dates only apply when “Custom dates” is chosen.</p></>)}
            {(meta.range === "period") && <label className="block"><span className="label">Period</span><select name="period" defaultValue={searchParams.period ?? "this_month"} className="input">{PERIODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>}
            {meta.range === "which" && <label className="block"><span className="label">Period</span><select name="which" defaultValue={searchParams.which ?? "current"} className="input"><option value="current">Current</option><option value="previous">Previous</option></select></label>}
            {sel === "kpi" && s.isWsAdmin && <label className="block"><span className="label">Person</span><select name="who" defaultValue={searchParams.who ?? ""} className="input"><option value="">Whole team</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
            <button className="btn-primary w-full">Preview</button>
          </form>
          <div className="space-y-2 border-t border-navy-100 p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">Download</p>
            {(["csv", "xlsx", "pdf"] as const).map((f) => <a key={f} href={dl(f)} className="btn-secondary w-full"><Download size={14} /> {f === "csv" ? "CSV" : f === "xlsx" ? "Excel (.xlsx)" : "PDF"}</a>)}
          </div>
        </Card>
        <Card className="xl:col-span-3">
          <CardHeader title={data.title} subtitle={data.subtitle} />
          <div className="max-h-[640px] overflow-auto">
            <table className="w-full">
              <thead className="sticky top-0"><tr>{data.columns.map((c) => <th key={c} className="th">{c}</th>)}</tr></thead>
              <tbody>
                {data.rows.length === 0 && <tr><td colSpan={data.columns.length} className="td text-navy-400">No data for this selection.</td></tr>}
                {data.rows.slice(0, 200).map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="td">{c ?? <span className="text-navy-300">—</span>}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
          {data.rows.length > 200 && <p className="border-t border-navy-100 px-5 py-3 text-xs text-navy-400">Preview shows the first 200 of {data.rows.length} rows. Downloads contain everything.</p>}
        </Card>
      </div>
    </>
  );
}
