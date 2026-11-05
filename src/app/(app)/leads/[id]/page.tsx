import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { Building2, Globe, Linkedin, Mail, MapPin, Pencil, Phone } from "lucide-react";
import { db, leadActivities, leadListItems, leadLists, leadNotes, leads, outreachEmails, tasks, users } from "@/db";
import { requireSession } from "@/lib/session";
import { getMembers } from "@/lib/members";
import { scoreLead } from "@/lib/scoring";
import { ACTIVITY_LABEL, LEAD_STATUSES, PRIORITY_TONE, STATUS_LABEL, STATUS_TONE, VERIFICATION_LABEL, VERIFICATION_TONE } from "@/lib/constants";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/utils";
import { Badge, Card, CardHeader, ProgressBar } from "@/components/ui";
import { ScoreBadge } from "@/components/leads-table";
import { SubmitButton } from "@/components/submit-button";
import { enrichLeadAction } from "@/app/actions/finder";
import { addNoteAction, archiveLeadAction, assignLeadAction, changeStatusAction, toggleOptOutAction, verifyLeadAction } from "@/app/actions/leads";
import { completeTaskAction, createTaskAction } from "@/app/actions/tasks";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lead" };

export default async function LeadPage({ params }: { params: { id: string } }) {
  const s = await requireSession();
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const ws = s.workspace.id;
  const [lead] = await db.select().from(leads).where(and(eq(leads.id, params.id), eq(leads.workspaceId, ws), isNull(leads.archivedAt))).limit(1);
  if (!lead) notFound();

  const [members, notes, activity, leadTasks, emails, memberOfLists] = await Promise.all([
    getMembers(ws),
    db.select({ n: leadNotes, author: users.name }).from(leadNotes).leftJoin(users, eq(users.id, leadNotes.authorId)).where(eq(leadNotes.leadId, lead.id)).orderBy(desc(leadNotes.createdAt)).limit(30),
    db.select({ a: leadActivities, who: users.name }).from(leadActivities).leftJoin(users, eq(users.id, leadActivities.userId)).where(eq(leadActivities.leadId, lead.id)).orderBy(desc(leadActivities.createdAt)).limit(60),
    db.select().from(tasks).where(and(eq(tasks.leadId, lead.id), eq(tasks.workspaceId, ws))).orderBy(asc(tasks.completedAt), asc(tasks.dueAt)).limit(20),
    db.select().from(outreachEmails).where(and(eq(outreachEmails.leadId, lead.id), eq(outreachEmails.workspaceId, ws))).orderBy(desc(outreachEmails.createdAt)).limit(10),
    db.select({ name: leadLists.name }).from(leadListItems).innerJoin(leadLists, eq(leadLists.id, leadListItems.listId)).where(eq(leadListItems.leadId, lead.id)),
  ]);

  const score = scoreLead(lead, s.workspace.settings.scoring);
  const here = `/leads/${lead.id}`;
  const owner = members.find((m) => m.id === lead.assignedTo)?.name;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs text-navy-400">
            <Link href={lead.inCrm ? "/leads" : "/finder"} className="hover:text-brand-600">
              {lead.inCrm ? "All Leads" : "Lead Finder"}
            </Link>{" "}
            / Lead
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-navy-900">{lead.fullName}</h1>
          <p className="mt-1 text-sm text-navy-500">{[lead.jobTitle, lead.companyName].filter(Boolean).join(" at ") || "No job title or company yet"}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {lead.inCrm ? <Badge tone={STATUS_TONE[lead.status]}>{STATUS_LABEL[lead.status]}</Badge> : <Badge tone="bg-brand-100 text-brand-700">Discovered — not in CRM yet</Badge>}
            <ScoreBadge score={lead.score} category={lead.scoreCategory} />
            <Badge tone={VERIFICATION_TONE[lead.verification]}>{VERIFICATION_LABEL[lead.verification]}</Badge>
            {lead.isDemo && <Badge tone="bg-amber-100 text-amber-800">Demo data</Badge>}
            {lead.emailOptOut && <Badge tone="bg-rose-100 text-rose-700">Do not email</Badge>}
            {memberOfLists.map((l) => (
              <Badge key={l.name} tone="bg-violet-100 text-violet-700">
                {l.name}
              </Badge>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/outbox/new?lead=${lead.id}`} className={cn("btn-secondary", (!lead.email || lead.emailOptOut) && "pointer-events-none opacity-50")} aria-disabled={!lead.email || lead.emailOptOut}>
            <Mail size={15} /> Draft email
          </Link>
          <Link href={`${here}/edit`} className="btn-secondary">
            <Pencil size={15} /> Edit
          </Link>
          <form action={archiveLeadAction}>
            <input type="hidden" name="id" value={lead.id} />
            <SubmitButton variant="ghost" confirm="Archive this lead? It will disappear from lists and reports.">
              Archive
            </SubmitButton>
          </form>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="space-y-5 xl:col-span-2">
          <Card>
            <CardHeader title="Contact & company" />
            <dl className="grid grid-cols-1 gap-x-8 gap-y-4 p-5 text-sm sm:grid-cols-2">
              <Item icon={<Mail size={14} />} label="Email">
                {lead.email ? <a className="text-brand-600 hover:underline" href={`mailto:${lead.email}`}>{lead.email}</a> : null}
              </Item>
              <Item icon={<Phone size={14} />} label="Phone">
                {lead.phone}
              </Item>
              <Item icon={<Linkedin size={14} />} label="LinkedIn">
                {lead.linkedinUrl ? (
                  <a className="text-brand-600 hover:underline" href={/^https?:/i.test(lead.linkedinUrl) ? lead.linkedinUrl : `https://${lead.linkedinUrl}`} target="_blank" rel="noopener noreferrer">
                    Open profile
                  </a>
                ) : null}
              </Item>
              <Item icon={<Globe size={14} />} label="Website">
                {lead.companyWebsite ? (
                  <a className="text-brand-600 hover:underline" href={/^https?:/i.test(lead.companyWebsite) ? lead.companyWebsite : `https://${lead.companyWebsite}`} target="_blank" rel="noopener noreferrer">
                    {lead.companyWebsite}
                  </a>
                ) : null}
              </Item>
              <Item icon={<Building2 size={14} />} label="Industry / size">
                {[lead.industry, lead.companySize && `${lead.companySize} employees`].filter(Boolean).join(" · ")}
              </Item>
              <Item icon={<MapPin size={14} />} label="Location">
                {[lead.location, lead.country].filter(Boolean).join(", ")}
              </Item>
              <Item label="Buys / interested in">{lead.interests}</Item>
              <Item label="Seniority / department">{[lead.seniority, lead.department].filter(Boolean).join(" · ")}</Item>
              <Item label="Source">{lead.sourceLabel}</Item>
              <Item label="Deal value">{lead.dealValue ? fmtMoney(lead.dealValue, lead.dealCurrency ?? "USD") : null}</Item>
              <Item label="Owner">{owner}</Item>
              <Item label={lead.inCrm ? "Added to CRM" : "Found"}>{fmtDate(lead.inCrm ? lead.crmAddedAt : lead.createdAt)}</Item>
            </dl>
          </Card>

          <Card>
            <CardHeader title="Why this score?" subtitle="Every point is explained. Missing information never earns points." action={<ScoreBadge score={score.total} category={score.category} />} />
            <ul className="divide-y divide-navy-100">
              {score.breakdown.map((c) => (
                <li key={c.key} className="px-5 py-3">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-semibold text-navy-800">{c.label}</span>
                    <span className="tabular-nums text-navy-500">
                      {c.points} / {c.max}
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <ProgressBar pct={c.max ? (c.points / c.max) * 100 : 0} tone={c.matched === null ? "bg-navy-200" : c.points >= c.max * 0.7 ? "bg-emerald-500" : c.points > 0 ? "bg-amber-500" : "bg-rose-400"} />
                  </div>
                  <p className="mt-1 text-xs text-navy-500">{c.reason}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Activity timeline" subtitle="Everything that happened to this lead" />
            <ol className="divide-y divide-navy-100">
              {activity.map(({ a, who }) => (
                <li key={a.id} className="flex gap-3 px-5 py-3">
                  <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                  <div className="text-sm">
                    <p className="text-navy-800">
                      <span className="font-semibold">{ACTIVITY_LABEL[a.type] ?? a.type}:</span> {a.summary}
                    </p>
                    <p className="text-xs text-navy-400">
                      {fmtDateTime(a.createdAt)}
                      {who ? ` · ${who}` : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-5">
          {lead.inCrm && (
            <Card>
              <CardHeader title="Status" />
              <form action={changeStatusAction} className="space-y-3 p-5">
                <input type="hidden" name="id" value={lead.id} />
                <select name="status" defaultValue={lead.status} className="input" aria-label="Status">
                  {LEAD_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {STATUS_LABEL[st]}
                    </option>
                  ))}
                </select>
                <input name="note" placeholder="Optional note about the change" className="input" maxLength={200} />
                <SubmitButton className="w-full">Update status</SubmitButton>
              </form>
            </Card>
          )}

          <Card>
            <CardHeader title="Owner" />
            <form action={assignLeadAction} className="space-y-3 p-5">
              <input type="hidden" name="id" value={lead.id} />
              <select name="userId" defaultValue={lead.assignedTo ?? ""} className="input" aria-label="Owner">
                <option value="">Unassigned</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <SubmitButton variant="secondary" className="w-full">
                Save owner
              </SubmitButton>
            </form>
          </Card>

          <Card>
            <CardHeader title="Verification" subtitle="Only mark Verified when you have checked the details yourself." />
            <form action={verifyLeadAction} className="space-y-3 p-5">
              <input type="hidden" name="id" value={lead.id} />
              <select name="verification" defaultValue={lead.verification} className="input" aria-label="Verification status">
                {Object.entries(VERIFICATION_LABEL).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
              <input name="source" placeholder="How did you check? (website, phone call, trade directory…)" className="input" maxLength={120} />
              <SubmitButton variant="secondary" className="w-full">
                Save verification
              </SubmitButton>
              {lead.verifiedAt && <p className="text-xs text-navy-400">Last verified {fmtDate(lead.verifiedAt)}</p>}
              {Object.keys(lead.fieldSources).length > 0 && (
                <ul className="space-y-0.5 text-xs text-navy-500">
                  {Object.entries(lead.fieldSources).map(([k, v]) => (
                    <li key={k}>
                      <span className="font-semibold">{k}</span> ← {v.source} ({fmtDate(v.verifiedAt)})
                    </li>
                  ))}
                </ul>
              )}
            </form>
          </Card>

          <Card>
            <CardHeader title="Enrich" subtitle="Reads the company's own public website and fills only EMPTY fields. Nothing is overwritten and nothing is marked verified." />
            <form action={enrichLeadAction} className="p-5">
              <input type="hidden" name="id" value={lead.id} />
              <SubmitButton variant="secondary" className="w-full" pendingText="Checking website…">
                Enrich from company website
              </SubmitButton>
            </form>
          </Card>

          <Card>
            <CardHeader title="Tasks & follow-ups" />
            <ul className="divide-y divide-navy-100">
              {leadTasks.length === 0 && <li className="px-5 py-4 text-sm text-navy-400">Nothing scheduled.</li>}
              {leadTasks.map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-2 px-5 py-3">
                  <div>
                    <p className={cn("text-sm font-semibold", t.completedAt ? "text-navy-400 line-through" : "text-navy-900")}>{t.title}</p>
                    <p className="text-xs text-navy-400">
                      <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge> {t.dueAt ? ` due ${fmtDateTime(t.dueAt)}` : ""}
                    </p>
                  </div>
                  <form action={completeTaskAction}>
                    <input type="hidden" name="id" value={t.id} />
                    <input type="hidden" name="back" value={here} />
                    {t.completedAt && <input type="hidden" name="reopen" value="1" />}
                    <SubmitButton variant="ghost" size="sm">
                      {t.completedAt ? "Re-open" : "Done"}
                    </SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
            <form action={createTaskAction} className="space-y-2 border-t border-navy-100 p-5">
              <input type="hidden" name="leadId" value={lead.id} />
              <input type="hidden" name="back" value={here} />
              <input name="title" required placeholder="e.g. Call to discuss pricing" className="input" aria-label="Task title" maxLength={200} />
              <div className="grid grid-cols-2 gap-2">
                <select name="kind" className="input" aria-label="Type" defaultValue="FOLLOW_UP">
                  <option value="FOLLOW_UP">Follow-up</option>
                  <option value="TASK">Task</option>
                  <option value="MEETING">Meeting</option>
                </select>
                <select name="priority" className="input" aria-label="Priority" defaultValue="MEDIUM">
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
                <input type="date" name="dueDate" className="input" aria-label="Due date" />
                <input type="time" name="dueTime" className="input" aria-label="Due time" defaultValue="10:00" />
              </div>
              <SubmitButton variant="secondary" className="w-full">
                Add
              </SubmitButton>
            </form>
          </Card>

          <Card>
            <CardHeader title="Notes" />
            <form action={addNoteAction} className="space-y-2 p-5">
              <input type="hidden" name="id" value={lead.id} />
              <textarea name="body" required rows={3} maxLength={4000} placeholder="What did you learn? What was agreed?" className="input" aria-label="Note" />
              <SubmitButton variant="secondary" className="w-full">
                Save note
              </SubmitButton>
            </form>
            <ul className="divide-y divide-navy-100 border-t border-navy-100">
              {notes.map(({ n, author }) => (
                <li key={n.id} className="px-5 py-3 text-sm">
                  <p className="whitespace-pre-wrap text-navy-800">{n.body}</p>
                  <p className="mt-1 text-xs text-navy-400">
                    {author ?? "Someone"} · {fmtDateTime(n.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Emails" subtitle="Drafts need your approval before anything is sent." />
            <ul className="divide-y divide-navy-100">
              {emails.length === 0 && <li className="px-5 py-4 text-sm text-navy-400">No emails yet.</li>}
              {emails.map((m) => (
                <li key={m.id} className="px-5 py-3 text-sm">
                  <Link href="/outbox" className="font-semibold text-navy-900 hover:text-brand-600">
                    {m.subject}
                  </Link>
                  <p className="text-xs text-navy-400">
                    {m.status} · {fmtDateTime(m.sentAt ?? m.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
            <form action={toggleOptOutAction} className="border-t border-navy-100 p-5">
              <input type="hidden" name="id" value={lead.id} />
              <input type="hidden" name="optOut" value={lead.emailOptOut ? "0" : "1"} />
              <SubmitButton variant="ghost" size="sm">
                {lead.emailOptOut ? "Allow emailing again" : "Mark as do-not-email"}
              </SubmitButton>
            </form>
          </Card>
        </div>
      </div>
    </>
  );
}

function Item({ label, icon, children }: { label: string; icon?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-navy-400">
        {icon}
        {label}
      </dt>
      <dd className="mt-1 text-navy-800">{children || <span className="text-navy-300">Not provided</span>}</dd>
    </div>
  );
}
