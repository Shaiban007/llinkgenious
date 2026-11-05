import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { db, leads } from "@/db";
import { requireSession } from "@/lib/session";
import { updateLeadAction } from "@/app/actions/leads";
import { LeadForm } from "@/components/lead-form";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Edit lead" };
export const dynamic = "force-dynamic";

export default async function EditLeadPage({ params }: { params: { id: string } }) {
  const s = await requireSession();
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const [lead] = await db.select().from(leads).where(and(eq(leads.id, params.id), eq(leads.workspaceId, s.workspace.id), isNull(leads.archivedAt))).limit(1);
  if (!lead) notFound();
  return (
    <>
      <PageHeader title={`Edit ${lead.fullName}`} subtitle="Saving re-calculates the lead score." />
      <div className="max-w-4xl">
        <LeadForm action={updateLeadAction} lead={lead} cancelHref={`/leads/${lead.id}`} />
      </div>
    </>
  );
}
