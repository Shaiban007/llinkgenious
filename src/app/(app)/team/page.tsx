import { eq, sql } from "drizzle-orm";
import { db, users, workspaceMembers } from "@/db";
import { requireWsAdmin } from "@/lib/session";
import { fmtDate } from "@/lib/utils";
import { Avatar, Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { addMemberAction, removeMemberAction, setRoleAction } from "@/app/actions/team";
import { DEPARTMENTS } from "@/lib/constants";

export const metadata = { title: "Team" };
export const dynamic = "force-dynamic";

export default async function TeamPage({ searchParams }: { searchParams: { link?: string } }) {
  const s = await requireWsAdmin();
  const rows = await db
    .select({ u: users, role: workspaceMembers.role, dept: workspaceMembers.department, joined: workspaceMembers.createdAt, leadCount: sql<number>`(select count(*) from leads l where l.assigned_to = ${users.id} and l.workspace_id = ${workspaceMembers.workspaceId} and l.archived_at is null and l.in_crm)` })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, s.workspace.id))
    .orderBy(users.name);
  const link = searchParams.link?.startsWith("http") ? searchParams.link : null;

  return (
    <>
      <PageHeader title="Team" subtitle="Administrators manage settings, targets, integrations and the team. Team members work on leads, tasks and campaigns." />
      {link && (
        <div className="mb-5 rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm text-navy-800">
          <p className="font-semibold">One-time link to send to the new team member (valid for 3 days):</p>
          <input readOnly value={link} className="input mt-2 font-mono text-xs" aria-label="Invitation link" />
        </div>
      )}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={`${rows.length} member${rows.length === 1 ? "" : "s"}`} />
          <ul className="divide-y divide-navy-100">
            {rows.map(({ u, role, dept, joined, leadCount }) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="flex items-center gap-3">
                  <Avatar name={u.name} />
                  <div>
                    <p className="text-sm font-semibold text-navy-900">
                      {u.name} {u.id === s.user.id && <span className="text-xs font-normal text-navy-400">(you)</span>}
                    </p>
                    <p className="text-xs text-navy-400">
                      {u.email} · {dept ?? u.jobTitle ?? "—"} · joined {fmtDate(joined)} · {Number(leadCount)} active leads
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={role === "ADMIN" ? "bg-violet-100 text-violet-700" : "bg-navy-100 text-navy-600"}>{role === "ADMIN" ? "Administrator" : "Team member"}</Badge>
                  <form action={setRoleAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="role" value={role === "ADMIN" ? "MEMBER" : "ADMIN"} />
                    <SubmitButton variant="secondary" size="sm">{role === "ADMIN" ? "Make member" : "Make administrator"}</SubmitButton>
                  </form>
                  {u.id !== s.user.id && (
                    <form action={removeMemberAction}>
                      <input type="hidden" name="userId" value={u.id} />
                      <SubmitButton variant="ghost" size="sm" confirm={`Remove ${u.name} from this workspace? Their leads will be reassigned to you.`}>Remove</SubmitButton>
                    </form>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="h-fit">
          <CardHeader title="Add a team member" />
          <form action={addMemberAction} className="space-y-3 p-5">
            <label className="block"><span className="label">Name</span><input name="name" required className="input" /></label>
            <label className="block"><span className="label">Email</span><input name="email" type="email" required className="input" /></label>
            <label className="block"><span className="label">Role</span><select name="role" className="input"><option value="MEMBER">Team member</option><option value="ADMIN">Administrator</option></select></label>
            <label className="block"><span className="label">Department</span><select name="department" className="input"><option value="">—</option>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</select></label>
            <SubmitButton className="w-full">Add person</SubmitButton>
            <p className="text-xs text-navy-400">They get a one-time link to choose their own password. You never see or set anyone’s password.</p>
          </form>
        </Card>
      </div>
    </>
  );
}
