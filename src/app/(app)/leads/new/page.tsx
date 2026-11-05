import { requireSession } from "@/lib/session";
import { getMembers } from "@/lib/members";
import { createLeadAction } from "@/app/actions/leads";
import { LeadForm } from "@/components/lead-form";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Add lead" };
export const dynamic = "force-dynamic";

export default async function NewLeadPage({ searchParams }: { searchParams: { pool?: string } }) {
  const s = await requireSession();
  const members = await getMembers(s.workspace.id);
  return (
    <>
      <PageHeader title="Add a lead" subtitle="Enter what you know. Missing details are fine — the lead score will simply be lower until you fill them in." />
      <div className="max-w-4xl">
        <LeadForm action={createLeadAction} members={members} currentUserId={s.user.id} cancelHref="/leads" defaultPool={searchParams.pool === "1"} />
      </div>
    </>
  );
}
