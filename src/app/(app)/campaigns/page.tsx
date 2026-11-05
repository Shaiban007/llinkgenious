import Link from "next/link";
import { desc, eq, sql } from "drizzle-orm";
import { Plus } from "lucide-react";
import { campaigns, db } from "@/db";
import { requireSession } from "@/lib/session";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";
const TONE = { DRAFT: "bg-slate-200 text-slate-700", ACTIVE: "bg-emerald-100 text-emerald-700", PAUSED: "bg-amber-100 text-amber-800", COMPLETED: "bg-blue-100 text-blue-700" } as const;

export default async function CampaignsPage() {
  const s = await requireSession();
  const rows = await db
    .select({
      c: campaigns,
      leadCount: sql<number>`(select count(*) from campaign_leads cl where cl.campaign_id = ${campaigns.id})`,
      sent: sql<number>`(select count(*) from outreach_emails e where e.campaign_id = ${campaigns.id} and e.status = 'SENT')`,
      pending: sql<number>`(select count(*) from outreach_emails e where e.campaign_id = ${campaigns.id} and e.status in ('DRAFT','APPROVED'))`,
    })
    .from(campaigns)
    .where(eq(campaigns.workspaceId, s.workspace.id))
    .orderBy(desc(campaigns.createdAt));

  return (
    <>
      <PageHeader
        title="Campaigns"
        subtitle="Organised outreach to a group of leads."
        actions={
          <Link href="/campaigns/new" className="btn-primary">
            <Plus size={15} /> New campaign
          </Link>
        }
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="No campaigns yet" body="Create a campaign, add leads, generate drafts, then approve and send them from the Outbox." action={<Link href="/campaigns/new" className="btn-primary">Create your first campaign</Link>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr>
                  <th className="th">Campaign</th>
                  <th className="th">Status</th>
                  <th className="th text-right">Leads</th>
                  <th className="th text-right">Awaiting approval / send</th>
                  <th className="th text-right">Sent</th>
                  <th className="th">Created</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ c, leadCount, sent, pending }) => (
                  <tr key={c.id} className="hover:bg-navy-50/50">
                    <td className="td">
                      <Link href={`/campaigns/${c.id}`} className="font-semibold text-navy-900 hover:text-brand-600">
                        {c.name}
                      </Link>
                      {c.description && <p className="text-xs text-navy-400">{c.description}</p>}
                    </td>
                    <td className="td">
                      <Badge tone={TONE[c.status]}>{c.status}</Badge>
                    </td>
                    <td className="td text-right tabular-nums">{Number(leadCount)}</td>
                    <td className="td text-right tabular-nums">{Number(pending)}</td>
                    <td className="td text-right tabular-nums">{Number(sent)}</td>
                    <td className="td text-navy-500">{fmtDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
