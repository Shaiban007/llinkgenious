/** Funnel, source, score and stage-time analytics. All numbers come from real rows; every query is workspace-scoped and CRM-only. */
import { sql } from "drizzle-orm";
import { db } from "@/db";
import type { Range } from "./metrics";
import type { ScoringConfig } from "./workspace-settings";

type Row = Record<string, unknown>;
const iso = (d: Date) => sql`${d.toISOString()}::timestamptz`;
const n = (v: unknown) => Number(v ?? 0);

export async function loadAnalytics(ws: string, range: Range, scoring: ScoringConfig) {
  const t = scoring.thresholds;

  const [funnel, sources, bands, stageTime, countries, emails] = await Promise.all([
    db.execute<Row>(sql`
      select sp.to_status as status, count(distinct sp.lead_id) as n
      from sales_pipeline sp join leads l on l.id = sp.lead_id and l.archived_at is null and l.in_crm
      where sp.workspace_id = ${ws} and sp.entered_at >= ${iso(range.from)} and sp.entered_at < ${iso(range.to)}
      group by 1`),
    db.execute<Row>(sql`
      select coalesce(nullif(trim(source_label), ''), 'Not recorded') as source,
             count(*) as leads,
             count(*) filter (where qualified_at is not null) as qualified,
             count(*) filter (where status = 'CONVERTED') as converted,
             round(avg(score)::numeric, 1) as avg_score
      from leads
      where workspace_id = ${ws} and archived_at is null and in_crm and crm_added_at >= ${iso(range.from)} and crm_added_at < ${iso(range.to)}
      group by 1 order by count(*) desc limit 12`),
    db.execute<Row>(sql`
      select case when score >= ${t.high} then 'High' when score >= ${t.good} then 'Good' when score >= ${t.medium} then 'Medium' else 'Low' end as band,
             count(*) as leads,
             count(*) filter (where status = 'CONVERTED') as converted,
             count(*) filter (where qualified_at is not null) as qualified
      from leads
      where workspace_id = ${ws} and archived_at is null and in_crm and crm_added_at >= ${iso(range.from)} and crm_added_at < ${iso(range.to)}
      group by 1`),
    db.execute<Row>(sql`
      select sp.to_status as status, count(*) as visits,
             round(avg(extract(epoch from (sp.exited_at - sp.entered_at)) / 86400.0)::numeric, 1) as avg_days
      from sales_pipeline sp join leads l on l.id = sp.lead_id and l.archived_at is null and l.in_crm
      where sp.workspace_id = ${ws} and sp.exited_at is not null and sp.entered_at >= ${iso(range.from)} and sp.entered_at < ${iso(range.to)}
      group by 1`),
    db.execute<Row>(sql`
      select coalesce(nullif(trim(country), ''), 'Not specified') as country, count(*) as leads,
             count(*) filter (where status = 'CONVERTED') as converted
      from leads
      where workspace_id = ${ws} and archived_at is null and in_crm and crm_added_at >= ${iso(range.from)} and crm_added_at < ${iso(range.to)}
      group by 1 order by count(*) desc limit 10`),
    db.execute<Row>(sql`
      select status, count(*) as n from outreach_emails
      where workspace_id = ${ws} and created_at >= ${iso(range.from)} and created_at < ${iso(range.to)}
      group by 1`),
  ]);

  const added = n((await db.execute<Row>(sql`select count(*) as n from leads where workspace_id = ${ws} and archived_at is null and in_crm and crm_added_at >= ${iso(range.from)} and crm_added_at < ${iso(range.to)}`))[0].n);
  const stageN = new Map((funnel as Row[]).map((r) => [String(r.status), n(r.n)]));
  const steps: { key: string; label: string; value: number }[] = [
    { key: "ADDED", label: "Added to CRM", value: added },
    { key: "QUALIFIED", label: "Qualified", value: stageN.get("QUALIFIED") ?? 0 },
    { key: "CONTACTED", label: "Contacted", value: stageN.get("CONTACTED") ?? 0 },
    { key: "MEETING_SCHEDULED", label: "Meeting", value: stageN.get("MEETING_SCHEDULED") ?? 0 },
    { key: "PROPOSAL_SENT", label: "Proposal", value: stageN.get("PROPOSAL_SENT") ?? 0 },
    { key: "NEGOTIATION", label: "Negotiation", value: stageN.get("NEGOTIATION") ?? 0 },
    { key: "CONVERTED", label: "Converted", value: stageN.get("CONVERTED") ?? 0 },
  ];
  const order = ["High", "Good", "Medium", "Low"];
  return {
    steps,
    sources: (sources as Row[]).map((r) => ({ source: String(r.source), leads: n(r.leads), qualified: n(r.qualified), converted: n(r.converted), avgScore: r.avg_score === null ? null : Number(r.avg_score) })),
    bands: (bands as Row[]).map((r) => ({ band: String(r.band), leads: n(r.leads), converted: n(r.converted), qualified: n(r.qualified) })).sort((a, b) => order.indexOf(a.band) - order.indexOf(b.band)),
    stageTime: (stageTime as Row[]).map((r) => ({ status: String(r.status), visits: n(r.visits), avgDays: r.avg_days === null ? null : Number(r.avg_days) })),
    countries: (countries as Row[]).map((r) => ({ country: String(r.country), leads: n(r.leads), converted: n(r.converted) })),
    emails: Object.fromEntries((emails as Row[]).map((r) => [String(r.status), n(r.n)])) as Record<string, number>,
  };
}
