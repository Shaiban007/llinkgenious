import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { campaignLeads, campaigns, db, leads, outreachEmails } from "@/db";
import { requireSession } from "@/lib/session";
import { getLists } from "@/lib/members";
import { Badge, Card, CardHeader, PageHeader, StatCard } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { addCampaignLeadsAction, deleteCampaignAction, generateDraftsAction, removeCampaignLeadAction, setCampaignStatusAction, updateCampaignAction } from "@/app/actions/campaigns";
import { CampaignForm } from "../campaign-form";

export const metadata = { title: "Campaign" };
export const dynamic = "force-dynamic";

export default async function CampaignPage({ params }: { params: { id: string } }) {
  const s = await requireSession();
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const [c] = await db.select().from(campaigns).where(and(eq(campaigns.id, params.id), eq(campaigns.workspaceId, s.workspace.id))).limit(1);
  if (!c) notFound();
  const [members, lists, stat] = await Promise.all([
    db
      .select({ l: leads, email: sql<string | null>`(select status from outreach_emails e where e.campaign_id = ${c.id} and e.lead_id = ${leads.id} order by e.created_at desc limit 1)` })
      .from(campaignLeads)
      .innerJoin(leads, eq(leads.id, campaignLeads.leadId))
      .where(eq(campaignLeads.campaignId, c.id))
      .orderBy(desc(leads.score))
      .limit(300),
    getLists(s.workspace.id),
    db
      .select({ st: outreachEmails.status, n: sql<number>`count(*)` })
      .from(outreachEmails)
      .where(eq(outreachEmails.campaignId, c.id))
      .groupBy(outreachEmails.status),
  ]);
  const n = (k: string) => Number(stat.find((x) => x.st === k)?.n ?? 0);
  const need = members.filter((m) => !m.email).length;

  return (
    <>
      <PageHeader
        title={c.name}
        subtitle={c.description ?? "Campaign"}
        actions={
          <>
            <Badge tone="bg-navy-100 text-navy-700">{c.status}</Badge>
            {c.status !== "ACTIVE" && c.status !== "COMPLETED" && (
              <form action={setCampaignStatusAction}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="status" value="ACTIVE" />
                <SubmitButton>Activate</SubmitButton>
              </form>
            )}
            {c.status === "ACTIVE" && (
              <form action={setCampaignStatusAction}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="status" value="PAUSED" />
                <SubmitButton variant="secondary">Pause</SubmitButton>
              </form>
            )}
            {c.status !== "COMPLETED" && (
              <form action={setCampaignStatusAction}>
                <input type="hidden" name="id" value={c.id} />
                <input type="hidden" name="status" value="COMPLETED" />
                <SubmitButton variant="secondary" confirm="Mark this campaign as completed?">
                  Complete
                </SubmitButton>
              </form>
            )}
          </>
        }
      />

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Leads" value={String(members.length)} />
        <StatCard label="Drafts" value={String(n("DRAFT"))} />
        <StatCard label="Approved" value={String(n("APPROVED"))} />
        <StatCard label="Sent" value={String(n("SENT"))} />
        <StatCard label="Failed / rejected" value={String(n("FAILED") + n("REJECTED"))} />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader title="Leads in this campaign" subtitle="Only CRM leads with an email address that have not opted out can be added." />
            <div className="flex flex-wrap items-center gap-2 border-b border-navy-100 p-4">
              <form action={generateDraftsAction}>
                <input type="hidden" name="id" value={c.id} />
                <SubmitButton pendingText="Writing drafts…" className={need === 0 ? "opacity-60" : ""}>
                  Write drafts for {need} lead{need === 1 ? "" : "s"}
                </SubmitButton>
              </form>
              <Link href="/outbox" className="btn-secondary">
                Open Email Outbox
              </Link>
              <p className="w-full text-xs text-navy-400">This only writes drafts. Nothing is sent until you approve each email in the Outbox.</p>
            </div>
            <ul className="divide-y divide-navy-100">
              {members.length === 0 && <li className="px-5 py-6 text-sm text-navy-400">No leads yet. Add some using the panel on the right.</li>}
              {members.map(({ l, email }) => (
                <li key={l.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <Link href={`/leads/${l.id}`} className="text-sm font-semibold text-navy-900 hover:text-brand-600">
                      {l.fullName}
                    </Link>
                    <p className="text-xs text-navy-400">
                      {[l.companyName, l.email].filter(Boolean).join(" · ")} · score {l.score}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={email === "SENT" ? "bg-emerald-100 text-emerald-700" : email ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"}>{email ?? "No email yet"}</Badge>
                    <form action={removeCampaignLeadAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="leadId" value={l.id} />
                      <SubmitButton variant="ghost" size="sm">
                        Remove
                      </SubmitButton>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Campaign details & email template" />
            <div className="p-5">
              <CampaignForm action={updateCampaignAction} c={c} />
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Add leads" />
            <form action={addCampaignLeadsAction} className="space-y-3 border-b border-navy-100 p-5">
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="source" value="list" />
              <p className="text-sm font-semibold text-navy-800">From a list</p>
              <select name="listId" className="input" aria-label="List">
                <option value="">— choose a list —</option>
                {lists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
              <SubmitButton variant="secondary" className="w-full">
                Add list
              </SubmitButton>
            </form>
            <form action={addCampaignLeadsAction} className="space-y-3 p-5">
              <input type="hidden" name="id" value={c.id} />
              <input type="hidden" name="source" value="targeting" />
              <p className="text-sm font-semibold text-navy-800">Match this campaign’s targeting</p>
              <p className="text-xs text-navy-400">
                Industry: {c.targetIndustry ?? "any"} · Location: {c.targetLocation ?? "any"}
              </p>
              <label className="block text-xs font-semibold text-navy-500">
                Minimum lead score
                <input type="number" name="minScore" min={0} max={100} defaultValue={50} className="input mt-1" />
              </label>
              <SubmitButton variant="secondary" className="w-full">
                Add matching leads
              </SubmitButton>
            </form>
          </Card>
          {s.isWsAdmin && (
            <form action={deleteCampaignAction}>
              <input type="hidden" name="id" value={c.id} />
              <SubmitButton variant="danger" confirm="Delete this campaign? Leads and sent emails are kept.">
                Delete campaign
              </SubmitButton>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
