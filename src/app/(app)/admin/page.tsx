import { desc, eq, sql } from "drizzle-orm";
import { auditLogs, db, errorLogs, leads, outreachEmails, users, workspaces } from "@/db";
import { requirePlatformAdmin } from "@/lib/session";
import { Badge, Card, CardHeader, PageHeader, StatCard } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { clearErrorLogsAction, setUserActiveAction, signOutUserAction } from "@/app/actions/admin";
import { fmtDateTime } from "@/lib/utils";

export const metadata = { title: "Admin panel" };
export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const s = await requirePlatformAdmin();
  const n = (q: Promise<{ n: unknown }[]>) => q.then((r) => Number(r[0]?.n ?? 0));
  const [uCount, wCount, lCount, sentCount, errCount, userRows, wsRows, audit, errs] = await Promise.all([
    n(db.select({ n: sql`count(*)` }).from(users)),
    n(db.select({ n: sql`count(*)` }).from(workspaces)),
    n(db.select({ n: sql`count(*)` }).from(leads)),
    n(db.select({ n: sql`count(*)` }).from(outreachEmails).where(eq(outreachEmails.status, "SENT"))),
    n(db.select({ n: sql`count(*)` }).from(errorLogs).where(sql`${errorLogs.createdAt} > now() - interval '24 hours'`)),
    db.select({ u: users, wsCount: sql<number>`(select count(*) from workspace_members m where m.user_id = ${users.id})` }).from(users).orderBy(desc(users.createdAt)).limit(200),
    db.select({ w: workspaces, members: sql<number>`(select count(*) from workspace_members m where m.workspace_id = ${workspaces.id})`, leadCount: sql<number>`(select count(*) from leads l where l.workspace_id = ${workspaces.id})` }).from(workspaces).orderBy(desc(workspaces.createdAt)).limit(200),
    db.select({ a: auditLogs, who: users.name, ws: workspaces.name }).from(auditLogs).leftJoin(users, eq(users.id, auditLogs.userId)).leftJoin(workspaces, eq(workspaces.id, auditLogs.workspaceId)).orderBy(desc(auditLogs.createdAt)).limit(100),
    db.select().from(errorLogs).orderBy(desc(errorLogs.createdAt)).limit(50),
  ]);

  return (
    <>
      <PageHeader title="Admin panel" subtitle="Platform administrators only. Shows accounts, activity and errors. It never shows lead contents." />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Users" value={String(uCount)} />
        <StatCard label="Workspaces" value={String(wCount)} />
        <StatCard label="Leads (all)" value={String(lCount)} />
        <StatCard label="Emails sent" value={String(sentCount)} />
        <StatCard label="Errors (24 h)" value={String(errCount)} />
      </div>

      <Card className="mt-6">
        <CardHeader title="Users" subtitle="Deactivating someone signs them out immediately." />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px]">
            <thead><tr><th className="th">Name</th><th className="th">Email</th><th className="th">Role</th><th className="th">Workspaces</th><th className="th">Last login</th><th className="th">Status</th><th className="th" /></tr></thead>
            <tbody>
              {userRows.map(({ u, wsCount }) => (
                <tr key={u.id}>
                  <td className="td font-semibold text-navy-900">{u.name}</td>
                  <td className="td">{u.email}</td>
                  <td className="td">{u.role === "ADMIN" ? <Badge tone="bg-violet-100 text-violet-700">Platform admin</Badge> : "User"}</td>
                  <td className="td">{Number(wsCount)}</td>
                  <td className="td whitespace-nowrap text-navy-500">{u.lastLoginAt ? fmtDateTime(u.lastLoginAt) : "Never"}</td>
                  <td className="td">{u.isActive ? <Badge tone="bg-emerald-100 text-emerald-700">Active</Badge> : <Badge tone="bg-rose-100 text-rose-700">Deactivated</Badge>}</td>
                  <td className="td">
                    {u.id !== s.user.id && (
                      <form className="flex justify-end gap-1">
                        <input type="hidden" name="id" value={u.id} />
                        <input type="hidden" name="active" value={u.isActive ? "0" : "1"} />
                        {u.isActive && <SubmitButton variant="ghost" size="sm" formAction={signOutUserAction} confirm="Sign this person out everywhere?">Sign out</SubmitButton>}
                        <SubmitButton variant={u.isActive ? "danger" : "secondary"} size="sm" formAction={setUserActiveAction} confirm={u.isActive ? `Deactivate ${u.name}? They will be signed out and cannot log in.` : undefined}>{u.isActive ? "Deactivate" : "Reactivate"}</SubmitButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Workspaces" />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[600px]">
            <thead><tr><th className="th">Name</th><th className="th">Company</th><th className="th">Members</th><th className="th">Leads</th><th className="th">Created</th></tr></thead>
            <tbody>{wsRows.map(({ w, members, leadCount }) => <tr key={w.id}><td className="td font-semibold text-navy-900">{w.name}</td><td className="td">{w.companyName ?? "—"}</td><td className="td">{Number(members)}</td><td className="td">{Number(leadCount)}</td><td className="td whitespace-nowrap text-navy-500">{fmtDateTime(w.createdAt)}</td></tr>)}</tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Audit log" subtitle="The latest 100 important actions (logins, sends, exports, role changes)." />
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full min-w-[700px]">
            <thead className="sticky top-0"><tr><th className="th">When</th><th className="th">Who</th><th className="th">Workspace</th><th className="th">Action</th><th className="th">Details</th></tr></thead>
            <tbody>
              {audit.length === 0 && <tr><td colSpan={5} className="td text-navy-400">Nothing logged yet.</td></tr>}
              {audit.map(({ a, who, ws }) => <tr key={a.id}><td className="td whitespace-nowrap text-navy-500">{fmtDateTime(a.createdAt)}</td><td className="td">{who ?? "—"}</td><td className="td">{ws ?? "—"}</td><td className="td font-mono text-xs">{a.action}</td><td className="td max-w-[280px] truncate text-xs text-navy-400" title={JSON.stringify(a.meta)}>{Object.keys(a.meta).length ? JSON.stringify(a.meta) : "—"}</td></tr>)}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-6">
        <CardHeader title="Error log" subtitle="The latest 50 server errors. Technical; useful when asking for help." action={<form><SubmitButton variant="secondary" size="sm" formAction={clearErrorLogsAction} confirm="Delete error logs older than 7 days?">Clear old errors</SubmitButton></form>} />
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full min-w-[600px]">
            <thead className="sticky top-0"><tr><th className="th">When</th><th className="th">Where</th><th className="th">Message</th></tr></thead>
            <tbody>
              {errs.length === 0 && <tr><td colSpan={3} className="td text-navy-400">No errors recorded.</td></tr>}
              {errs.map((e) => <tr key={e.id}><td className="td whitespace-nowrap text-navy-500">{fmtDateTime(e.createdAt)}</td><td className="td font-mono text-xs">{e.path ?? "—"}</td><td className="td text-xs">{e.message.slice(0, 300)}</td></tr>)}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
