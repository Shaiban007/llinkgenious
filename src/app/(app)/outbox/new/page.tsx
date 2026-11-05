import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, leads } from "@/db";
import { requireSession } from "@/lib/session";
import { createDraftAction } from "@/app/actions/outbox";
import { DEFAULT_BODY, DEFAULT_SUBJECT } from "@/lib/outreach";
import { PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";

export const metadata = { title: "Write an email" };
export const dynamic = "force-dynamic";

export default async function NewEmailPage({ searchParams }: { searchParams: { lead?: string } }) {
  const s = await requireSession();
  const options = await db
    .select({ id: leads.id, name: leads.fullName, company: leads.companyName, email: leads.email })
    .from(leads)
    .where(and(eq(leads.workspaceId, s.workspace.id), eq(leads.inCrm, true), isNull(leads.archivedAt), sql`${leads.email} is not null`, eq(leads.emailOptOut, false)))
    .orderBy(desc(leads.score))
    .limit(500);

  return (
    <>
      <PageHeader title="Write an email" subtitle="This creates a DRAFT. You will review and approve it in the Outbox before anything is sent. Use {{firstName|there}}, {{company}}, {{senderName}} to personalise — the part after | is used when the lead has no value." />
      <form action={createDraftAction} className="card max-w-3xl space-y-4 p-5">
        <label className="block">
          <span className="label">To</span>
          <select name="leadId" defaultValue={searchParams.lead ?? ""} required className="input">
            <option value="" disabled>
              Choose a lead with an email address
            </option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
                {o.company ? ` — ${o.company}` : ""} ({o.email})
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Subject</span>
          <input name="subject" required defaultValue={DEFAULT_SUBJECT} className="input" maxLength={200} />
        </label>
        <label className="block">
          <span className="label">Message</span>
          <textarea name="body" required rows={12} defaultValue={DEFAULT_BODY} className="input font-mono text-[13px]" maxLength={8000} />
        </label>
        <p className="text-xs text-navy-400">Only describe what you really offer. Don’t claim certifications, prices or stock you can’t back up.</p>
        <SubmitButton>Save as draft</SubmitButton>
      </form>
    </>
  );
}
