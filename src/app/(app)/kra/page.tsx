import { requireSession } from "@/lib/session";
import { kraScore, listMembers, loadKraRows } from "@/lib/performance";
import { ACHIEVEMENT_TONE, KPI_BY_KEY, KPI_CATALOG, achievementStatus } from "@/lib/kpi-catalog";
import { fmtKpi, fmtPct } from "@/lib/format";
import { DEPARTMENTS } from "@/lib/constants";
import { Badge, Card, CardHeader, EmptyState, PageHeader, ProgressBar } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { deleteKraAction, reviewKraAction, saveKraAction } from "@/app/actions/performance";
import Link from "next/link";
import { cn } from "@/lib/utils";

export const metadata = { title: "KRA" };
export const dynamic = "force-dynamic";

function KraFields({ members, k }: { members: { id: string; name: string }[]; k?: { id: string; name: string; description: string | null; measurement: string | null; userId: string; metricKey: string | null; target: number; period: string; weightage: number } }) {
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
      {k && <input type="hidden" name="id" value={k.id} />}
      <label className="block md:col-span-2"><span className="label">Key result area *</span><input name="name" required defaultValue={k?.name} placeholder="e.g. Generate qualified importer leads" className="input" /></label>
      <label className="block md:col-span-2"><span className="label">Description</span><input name="description" defaultValue={k?.description ?? ""} className="input" /></label>
      <label className="block"><span className="label">Assigned to *</span><select name="assignedTo" defaultValue={k?.userId} className="input">{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      <label className="block"><span className="label">Department</span><select name="department" className="input"><option value="">—</option>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</select></label>
      <label className="block"><span className="label">Measured automatically by</span>
        <select name="metricKey" defaultValue={k?.metricKey ?? ""} className="input"><option value="">Nothing — I will enter the result by hand</option>{KPI_CATALOG.map((d) => <option key={d.key} value={d.key}>{d.name}</option>)}</select>
      </label>
      <label className="block"><span className="label">How it is measured (words)</span><input name="measurement" defaultValue={k?.measurement ?? ""} className="input" /></label>
      <label className="block"><span className="label">Target *</span><input name="target" type="number" step="any" min={0} required defaultValue={k?.target} className="input" /></label>
      <label className="block"><span className="label">Period</span><select name="period" defaultValue={k?.period ?? "MONTHLY"} className="input"><option value="MONTHLY">Monthly</option><option value="QUARTERLY">Quarterly</option></select></label>
      <label className="block"><span className="label">Weightage (importance, 1–100) *</span><input name="weightage" type="number" min={1} max={100} required defaultValue={k?.weightage ?? 20} className="input" /></label>
    </div>
  );
}

export default async function KraPage({ searchParams }: { searchParams: { which?: string; who?: string } }) {
  const s = await requireSession();
  const members = await listMembers(s.workspace.id);
  const which = searchParams.which === "previous" ? "previous" : "current";
  const who = !s.isWsAdmin ? s.user.id : members.some((m) => m.id === searchParams.who) ? searchParams.who! : "";
  const rows = await loadKraRows({ workspaceId: s.workspace.id, userId: who || null, which, scoring: s.workspace.settings.scoring, tz: s.workspace.timezone, teamSize: members.length });
  const byUser = new Map<string, typeof rows>();
  for (const r of rows) byUser.set(r.userName, [...(byUser.get(r.userName) ?? []), r]);

  return (
    <>
      <PageHeader title="Key Result Areas (KRA)" subtitle="What each person is responsible for. Goals linked to a live metric update by themselves; the rest are reviewed by hand. The weighted score caps each goal at 100% so one big win cannot hide a miss." />
      <form method="get" className="mb-5 flex flex-wrap items-end gap-2">
        <label className="text-xs font-semibold text-navy-500">Period<select name="which" defaultValue={which} className="input mt-1 !w-auto"><option value="current">Current month / quarter</option><option value="previous">Previous month / quarter</option></select></label>
        {s.isWsAdmin && <label className="text-xs font-semibold text-navy-500">Person<select name="who" defaultValue={who} className="input mt-1 !w-auto"><option value="">Everyone</option>{members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
        <button className="btn-secondary">Apply</button>
      </form>

      {rows.length === 0 && <Card><EmptyState title="No KRAs yet" body={s.isWsAdmin ? "Create the first one below — for example “Qualified leads” measured automatically, target 40 per month." : "Your administrator has not assigned any KRAs to you yet."} /></Card>}

      {[...byUser.entries()].map(([name, list]) => {
        const sc = kraScore(list);
        return (
          <Card key={name} className="mb-5">
            <CardHeader title={name} subtitle={`${list.length} KRA${list.length === 1 ? "" : "s"}`} action={<div className="text-right"><p className="text-xs text-navy-400">Weighted score</p><p className="text-lg font-bold text-navy-900">{sc === null ? "—" : `${sc.toFixed(0)}%`}</p><Badge tone={ACHIEVEMENT_TONE[achievementStatus(sc)]}>{achievementStatus(sc)}</Badge></div>} />
            <ul className="divide-y divide-navy-100">
              {list.map((r) => {
                const def = r.metricKey ? KPI_BY_KEY[r.metricKey] : undefined;
                const u = { unit: def?.unit ?? "count" } as const;
                return (
                  <li key={r.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-navy-900">{r.name} <span className="ml-1 text-xs font-normal text-navy-400">weight {r.weightage} · {r.period.toLowerCase()}</span></p>
                        <p className="text-xs text-navy-400">{def ? `Measured automatically: ${def.name}` : r.measurement ?? "Reviewed by hand"}{r.description ? ` — ${r.description}` : ""}</p>
                      </div>
                      <Badge tone={ACHIEVEMENT_TONE[r.status]}>{r.status}</Badge>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex-1"><ProgressBar pct={r.pct ?? 0} /></div>
                      <span className="w-14 text-right text-sm font-semibold tabular-nums">{fmtPct(r.pct)}</span>
                    </div>
                    <p className="mt-1 text-xs text-navy-500">Actual <strong>{r.actual === null ? "not reviewed yet" : fmtKpi(u, r.actual)}</strong> of target <strong>{fmtKpi(u, r.target)}</strong>{r.manual && " (entered by hand)"}</p>
                    {r.reviewNotes && <p className="mt-1 rounded-lg bg-navy-50 px-3 py-2 text-xs text-navy-600">Review: {r.reviewNotes}</p>}
                    {s.isWsAdmin && (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs font-semibold text-brand-600">Review, edit or delete</summary>
                        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
                          <form action={reviewKraAction} className="space-y-2 rounded-xl bg-navy-50 p-3">
                            <input type="hidden" name="id" value={r.id} />
                            <p className="text-xs font-semibold text-navy-700">Review</p>
                            {!def && <label className="block text-xs text-navy-500">Actual result<input name="manualActual" type="number" step="any" min={0} defaultValue={r.actual ?? ""} className="input mt-1" /></label>}
                            <label className="block text-xs text-navy-500">Review notes<textarea name="reviewNotes" rows={2} defaultValue={r.reviewNotes ?? ""} className="input mt-1" /></label>
                            <SubmitButton variant="secondary" size="sm">Save review</SubmitButton>
                          </form>
                          <form action={saveKraAction} className="space-y-2 rounded-xl bg-navy-50 p-3">
                            <p className="text-xs font-semibold text-navy-700">Edit</p>
                            <KraFields members={members} k={r} />
                            <SubmitButton variant="secondary" size="sm">Save changes</SubmitButton>
                          </form>
                        </div>
                        <form action={deleteKraAction} className="mt-2"><input type="hidden" name="id" value={r.id} /><SubmitButton variant="ghost" size="sm" confirm="Delete this KRA?">Delete KRA</SubmitButton></form>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}

      {s.isWsAdmin && (
        <Card className="mt-2">
          <CardHeader title="Create a KRA" />
          <form action={saveKraAction} className="space-y-4 p-5"><KraFields members={members} /><SubmitButton>Create KRA</SubmitButton></form>
        </Card>
      )}
      <p className={cn("mt-4 text-xs text-navy-400")}>Looking for numbers behind a KRA? See <Link href="/kpi" className="font-semibold text-brand-600">KPIs</Link>.</p>
    </>
  );
}
