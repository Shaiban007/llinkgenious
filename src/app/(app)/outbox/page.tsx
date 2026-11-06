import Link from "next/link";
import { and, count, desc, eq } from "drizzle-orm";
import { AlertTriangle, CheckCircle2, Plus } from "lucide-react";
import { db, leads, outreachEmails, users } from "@/db";
import { requireSession } from "@/lib/session";
import { getWorkspaceSmtp } from "@/lib/mailer";
import { sentToday } from "@/lib/outreach";
import { fmtDateTime } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { SelectAll } from "@/components/select-all";
import { approveAction, deleteEmailAction, rejectAction, retryFailedAction, sendAllApprovedAction, sendOneAction, updateDraftAction } from "@/app/actions/outbox";
import { cn } from "@/lib/utils";

export const metadata = { title: "Email Outbox" };
export const dynamic = "force-dynamic";

const TABS = [
  ["DRAFT", "Drafts"],
  ["APPROVED", "Approved"],
  ["SENT", "Sent"],
  ["FAILED", "Failed"],
  ["REJECTED", "Rejected"],
] as const;
const TONE: Record<string, string> = { DRAFT: "bg-amber-100 text-amber-800", APPROVED: "bg-blue-100 text-blue-700", SENT: "bg-emerald-100 text-emerald-700", FAILED: "bg-rose-100 text-rose-700", REJECTED: "bg-slate-200 text-slate-600" };

export default async function OutboxPage({ searchParams }: { searchParams: { tab?: string } }) {
  const s = await requireSession();
  const tab = TABS.some(([k]) => k === searchParams.tab) ? searchParams.tab! : "DRAFT";
  const ws = s.workspace.id;
  const e = s.workspace.settings.email;
  const [smtp, today, counts, rows] = await Promise.all([
    getWorkspaceSmtp(ws),
    sentToday(ws, s.workspace.timezone),
    db.select({ st: outreachEmails.status, n: count() }).from(outreachEmails).where(eq(outreachEmails.workspaceId, ws)).groupBy(outreachEmails.status),
    db
      .select({ m: outreachEmails, lead: leads.fullName, company: leads.companyName, by: users.name })
      .from(outreachEmails)
      .innerJoin(leads, eq(leads.id, outreachEmails.leadId))
      .leftJoin(users, eq(users.id, outreachEmails.approvedBy))
      .where(and(eq(outreachEmails.workspaceId, ws), eq(outreachEmails.status, tab as "DRAFT")))
      .orderBy(desc(outreachEmails.createdAt))
      .limit(100),
  ]);
  const n = new Map(counts.map((c) => [c.st, Number(c.n)]));
  const checks = [
    { ok: Boolean(smtp), text: smtp ? "Email account connected" : "Email account not connected — add your SMTP details in Integrations", href: "/integrations" },
    { ok: Boolean(e.physicalAddress?.trim()), text: e.physicalAddress?.trim() ? "Postal address set for the email footer" : "Postal address missing — add it in Settings → Email (required in every outreach email)", href: "/settings" },
  ];
  const ready = checks.every((c) => c.ok);
  const here = `/outbox?tab=${tab}`;

  return (
    <>
      <PageHeader
        title="Email Outbox"
        subtitle="Every email starts as a draft. You read it, approve it, and only then can it be sent. Each email carries an unsubscribe link."
        actions={
          <>
            <Link href="/outbox/new" className="btn-secondary">
              <Plus size={15} /> Write an email
            </Link>
            <form action={sendAllApprovedAction}>
              <input type="hidden" name="back" value="/outbox?tab=SENT" />
              <SubmitButton pendingText="Sending…" confirm={`Send all ${n.get("APPROVED") ?? 0} approved emails now?`}>
                Send approved emails ({n.get("APPROVED") ?? 0})
              </SubmitButton>
            </form>
          </>
        }
      />

      <Card className="mb-5">
        <div className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
          {checks.map((c) => (
            <Link key={c.text} href={c.href} className={cn("flex items-start gap-2 rounded-lg p-3 text-sm", c.ok ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900")}>
              {c.ok ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
              {c.text}
            </Link>
          ))}
          <div className="rounded-lg bg-navy-50 p-3 text-sm text-navy-700">
            Sent today: <strong>{today}</strong> of your daily limit <strong>{e.dailyLimit}</strong>
          </div>
        </div>
        {!ready && <p className="border-t border-navy-100 px-4 py-2 text-xs text-navy-500">You can write and approve emails now. Sending stays blocked until both items above are green — we never pretend an email was sent.</p>}
      </Card>

      <Card>
        <div className="flex flex-wrap gap-1 border-b border-navy-100 p-3">
          {TABS.map(([k, label]) => (
            <Link key={k} href={`/outbox?tab=${k}`} className={cn("rounded-lg px-3 py-1.5 text-sm font-semibold", tab === k ? "bg-navy-900 text-white" : "text-navy-600 hover:bg-navy-50")}>
              {label} <span className="opacity-60">{n.get(k as "DRAFT") ?? 0}</span>
            </Link>
          ))}
        </div>

        {rows.length === 0 ? (
          <EmptyState title={`No ${tab.toLowerCase()} emails`} body={tab === "DRAFT" ? "Open a lead and choose “Draft email”, or generate drafts from a campaign." : undefined} />
        ) : (
          <form>
            {(tab === "DRAFT" || tab === "APPROVED") && (
              <div className="flex flex-wrap items-center gap-2 border-b border-navy-100 bg-navy-50/60 px-4 py-2.5">
                <SelectAll />
                <span className="text-xs text-navy-500">Select all</span>
                <input type="hidden" name="back" value={here} />
                {tab === "DRAFT" && (
                  <button formAction={approveAction} className="btn-primary btn-sm">
                    Approve ticked
                  </button>
                )}
                <button formAction={rejectAction} className="btn-secondary btn-sm">
                  Reject ticked
                </button>
              </div>
            )}
            <ul className="divide-y divide-navy-100">
              {rows.map(({ m, lead, company, by }) => (
                <li key={m.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    {(tab === "DRAFT" || tab === "APPROVED") && <input type="checkbox" name="ids" value={m.id} className="mt-1 h-4 w-4 rounded border-navy-300" aria-label={`Select email to ${lead}`} />}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={TONE[m.status]}>{m.status}</Badge>
                        <Link href={`/leads/${m.leadId}`} className="text-sm font-semibold text-navy-900 hover:text-brand-600">
                          {lead}
                        </Link>
                        <span className="text-xs text-navy-400">
                          {company ? `${company} · ` : ""}
                          {m.toEmail}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-semibold text-navy-800">{m.subject}</p>
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs font-semibold text-brand-600">{m.status === "DRAFT" ? "Read & edit" : "Read"}</summary>
                        {m.status === "DRAFT" ? (
                          <div className="mt-2 space-y-2 rounded-xl bg-navy-50 p-3">
                            <input name={`subject_${m.id}`} defaultValue={m.subject} className="input" aria-label="Subject" maxLength={200} />
                            <textarea name={`body_${m.id}`} defaultValue={m.body} rows={9} className="input font-mono text-[13px]" aria-label="Message" maxLength={8000} />
                            <p className="text-[11px] text-navy-400">Your signature, unsubscribe link and postal address are added automatically when the email is sent.</p>
                            <button formAction={updateDraftAction.bind(null, m.id)} className="btn-secondary btn-sm">
                              Save changes
                            </button>
                          </div>
                        ) : (
                          <pre className="mt-2 whitespace-pre-wrap rounded-xl bg-navy-50 p-3 font-sans text-[13px] text-navy-700">{m.body}</pre>
                        )}
                      </details>
                      <p className="mt-1 text-[11px] text-navy-400">
                        Created {fmtDateTime(m.createdAt)}
                        {by && m.approvedAt ? ` · approved by ${by} ${fmtDateTime(m.approvedAt)}` : ""}
                        {m.sentAt ? ` · sent ${fmtDateTime(m.sentAt)}` : ""}
                      </p>
                      {m.error && m.error !== "__sending__" && <p className="mt-1 text-xs font-semibold text-rose-600">{m.error}</p>}
                    </div>
                    <div className="flex shrink-0 flex-col gap-1">
                      {m.status === "APPROVED" && (
                        <SubmitButton formAction={sendOneAction.bind(null, m.id)} size="sm" pendingText="Sending…">
                          Send now
                        </SubmitButton>
                      )}
                      {m.status === "FAILED" && (
                        <SubmitButton formAction={retryFailedAction.bind(null, m.id)} variant="secondary" size="sm">
                          Back to draft
                        </SubmitButton>
                      )}
                      {["DRAFT", "REJECTED", "FAILED"].includes(m.status) && (
                        <SubmitButton formAction={deleteEmailAction.bind(null, m.id)} variant="ghost" size="sm" confirm="Delete this email?">
                          Delete
                        </SubmitButton>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </form>
        )}
      </Card>
    </>
  );
}
