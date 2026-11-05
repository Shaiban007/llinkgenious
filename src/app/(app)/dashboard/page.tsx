import Link from "next/link";
import { and, count, eq, isNull } from "drizzle-orm";
import { Search, Upload, UserPlus } from "lucide-react";
import { db, leads } from "@/db";
import { requireSession } from "@/lib/session";
import { loadDashboard } from "@/lib/dashboard";
import { fmtDate, fmtDateTime, fmtNumber, resolveRange } from "@/lib/utils";
import { STATUS_LABEL, STATUS_TONE } from "@/lib/constants";
import { Badge, Card, CardHeader, EmptyState, PageHeader, StatCard } from "@/components/ui";
import { GroupedBars, RankedBars, StageBars, TrendChart } from "@/components/charts";
import { COLORS } from "@/lib/chart-colors";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

const PRESETS = [
  ["today", "Today"],
  ["7d", "7 days"],
  ["30d", "30 days"],
  ["90d", "90 days"],
] as const;

export default async function DashboardPage({ searchParams }: { searchParams: { range?: string; from?: string; to?: string } }) {
  const s = await requireSession();
  const range = resolveRange({ ...searchParams, range: searchParams.range ?? s.workspace.settings.prefs.dashboardRange }, s.workspace.timezone);
  const d = await loadDashboard(s, range);

  const [pool] = await db
    .select({ n: count() })
    .from(leads)
    .where(and(eq(leads.workspaceId, s.workspace.id), eq(leads.inCrm, false), isNull(leads.archivedAt)));
  const waiting = Number(pool.n);

  const firstName = s.user.name.split(" ")[0];
  const fmt = (c: (typeof d.cards)[number]) => (c.format === "percent" ? `${c.value.toFixed(1)}%` : fmtNumber(c.value));
  const prev = (c: (typeof d.cards)[number]) => (c.format === "percent" ? `${c.previous.toFixed(1)}%` : fmtNumber(c.previous));

  return (
    <>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        subtitle={`${s.workspace.name} · ${range.label} (${fmtDate(range.from)} – ${fmtDate(new Date(range.to.getTime() - 1))})`}
        actions={
          <>
            <Link href="/finder" className="btn-secondary">
              <Search size={15} /> Lead Finder
            </Link>
            <Link href="/finder/import" className="btn-secondary">
              <Upload size={15} /> Import CSV
            </Link>
            <Link href="/leads/new" className="btn-primary">
              <UserPlus size={15} /> Add lead
            </Link>
          </>
        }
      />

      <form method="get" className="mb-5 flex flex-wrap items-end gap-2" aria-label="Date range">
        <div className="inline-flex rounded-lg border border-navy-200 bg-white p-0.5">
          {PRESETS.map(([k, label]) => (
            <Link key={k} href={`/dashboard?range=${k}`} className={cn("rounded-md px-3 py-1.5 text-xs font-semibold", range.key === k ? "bg-navy-900 text-white" : "text-navy-600 hover:bg-navy-50")}>
              {label}
            </Link>
          ))}
        </div>
        <input type="hidden" name="range" value="custom" />
        <label className="text-xs font-semibold text-navy-500">
          From
          <input type="date" name="from" defaultValue={searchParams.from} className="input mt-1 !w-auto" required />
        </label>
        <label className="text-xs font-semibold text-navy-500">
          To
          <input type="date" name="to" defaultValue={searchParams.to} className="input mt-1 !w-auto" required />
        </label>
        <button className="btn-secondary">Apply custom range</button>
      </form>

      {waiting > 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-navy-800">
          <span>
            <strong>{fmtNumber(waiting)}</strong> discovered lead{waiting === 1 ? " is" : "s are"} waiting in the Lead Finder. They are not counted here until you add them to the CRM.
          </span>
          <Link href="/finder" className="btn-primary btn-sm">
            Review them
          </Link>
        </div>
      )}

      {d.totalLeads === 0 ? (
        <Card>
          <EmptyState
            title="Your workspace has no leads yet"
            body="Import a CSV of buyers you already have, or add a lead by hand. Every number and chart on this page is calculated from your real leads — nothing is made up."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Link href="/finder/import" className="btn-primary">
                  Import a CSV
                </Link>
                <Link href="/leads/new" className="btn-secondary">
                  Add a lead
                </Link>
              </div>
            }
          />
        </Card>
      ) : null}

      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {d.cards.map((c) => (
          <StatCard key={c.key} label={c.label} value={fmt(c)} change={c.change} previous={prev(c)} hint={c.hint} />
        ))}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <TrendChart title="New leads over time" subtitle="Leads added to the CRM each day" data={d.trend} />
        <StageBars title="Pipeline stages" subtitle="Where every active lead is right now" data={d.pipeline} />
        <RankedBars title="Leads by industry" subtitle="Top industries in this period" data={d.byIndustry} categoryLabel="Industry" />
        <RankedBars title="Leads by designation" subtitle="Top job titles in this period" data={d.byTitle} color={COLORS.aqua} categoryLabel="Job title" />
        <RankedBars title="Leads by country" subtitle="Top countries in this period" data={d.byCountry} color={COLORS.orange} categoryLabel="Country" />
        <RankedBars title="Lead quality" subtitle="Score bands, best first" data={d.qualification} ordinal categoryLabel="Score band" />
        <TrendChart title="Conversion rate by month" subtitle="Converted ÷ new leads, last 6 months" data={d.monthly} unit="%" color={COLORS.orange} valueLabel="Conversion rate" />
        <GroupedBars
          title={s.isWsAdmin ? "Team performance" : "My performance"}
          subtitle="Leads created, qualified and converted in this period"
          data={d.team.map((t) => ({ label: t.label, created: t.created, qualified: t.qualified, converted: t.converted }))}
          series={[
            { key: "created", label: "Created", color: COLORS.blue },
            { key: "qualified", label: "Qualified", color: COLORS.orange },
            { key: "converted", label: "Converted", color: COLORS.aqua },
          ]}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader title="Recently added" subtitle="Newest leads in the CRM" />
          <ul className="divide-y divide-navy-100">
            {d.recent.added.length === 0 && <li className="px-5 py-6 text-sm text-navy-400">Nothing yet.</li>}
            {d.recent.added.map((l) => (
              <li key={l.id} className="px-5 py-3">
                <Link href={`/leads/${l.id}`} className="text-sm font-semibold text-navy-900 hover:text-brand-600">
                  {l.fullName}
                </Link>
                <p className="text-xs text-navy-400">
                  {[l.jobTitle, l.companyName].filter(Boolean).join(" · ") || "No details yet"} · {fmtDate(l.crmAddedAt)}
                </p>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Recently qualified" subtitle="Leads that reached Qualified" />
          <ul className="divide-y divide-navy-100">
            {d.recent.qualified.length === 0 && <li className="px-5 py-6 text-sm text-navy-400">No qualified leads yet.</li>}
            {d.recent.qualified.map((l) => (
              <li key={l.id} className="px-5 py-3">
                <Link href={`/leads/${l.id}`} className="text-sm font-semibold text-navy-900 hover:text-brand-600">
                  {l.fullName}
                </Link>
                <p className="text-xs text-navy-400">
                  {l.companyName ?? "—"} · {fmtDate(l.qualifiedAt)} · score {l.score}
                </p>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Upcoming follow-ups & tasks" subtitle="Open items with a due date" action={<Link href="/tasks" className="text-xs font-semibold text-brand-600">View all</Link>} />
          <ul className="divide-y divide-navy-100">
            {d.recent.upcoming.length === 0 && <li className="px-5 py-6 text-sm text-navy-400">Nothing scheduled.</li>}
            {d.recent.upcoming.map((t) => {
              const late = t.dueAt && t.dueAt < new Date();
              return (
                <li key={t.id} className="px-5 py-3">
                  <p className="text-sm font-semibold text-navy-900">{t.title}</p>
                  <p className={cn("text-xs", late ? "font-semibold text-rose-600" : "text-navy-400")}>
                    {late ? "Overdue · " : ""}
                    {fmtDateTime(t.dueAt)}
                    {t.leadName ? ` · ${t.leadName}` : ""}
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Latest activity" subtitle="Most recently touched leads" />
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th className="th">Lead</th>
                <th className="th">Company</th>
                <th className="th">Status</th>
                <th className="th text-right">Score</th>
                <th className="th">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {d.recent.updated.length === 0 && (
                <tr>
                  <td colSpan={5} className="td text-navy-400">
                    No activity yet.
                  </td>
                </tr>
              )}
              {d.recent.updated.map((l) => (
                <tr key={l.id}>
                  <td className="td">
                    <Link href={`/leads/${l.id}`} className="font-semibold hover:text-brand-600">
                      {l.fullName}
                    </Link>
                  </td>
                  <td className="td">{l.companyName ?? "—"}</td>
                  <td className="td">
                    <Badge tone={STATUS_TONE[l.status]}>{STATUS_LABEL[l.status]}</Badge>
                  </td>
                  <td className="td text-right tabular-nums">{l.score}</td>
                  <td className="td text-navy-500">{fmtDateTime(l.lastActivityAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
