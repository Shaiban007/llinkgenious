import Link from "next/link";
import { and, asc, desc, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db, leads, tasks, users } from "@/db";
import { requireSession } from "@/lib/session";
import { getMembers } from "@/lib/members";
import { PRIORITY_TONE } from "@/lib/constants";
import { addDays, fmtDateTime, startOfDayTz } from "@/lib/utils";
import { Badge, Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { completeTaskAction, createTaskAction, deleteTaskAction } from "@/app/actions/tasks";
import { cn } from "@/lib/utils";

export const metadata = { title: "Tasks & Follow-ups" };
export const dynamic = "force-dynamic";

const VIEWS = [
  ["open", "Open"],
  ["today", "Due today"],
  ["overdue", "Overdue"],
  ["done", "Done"],
] as const;

export default async function TasksPage({ searchParams }: { searchParams: { view?: string; who?: string; kind?: string } }) {
  const s = await requireSession();
  const view = VIEWS.some(([k]) => k === searchParams.view) ? searchParams.view! : "open";
  const who = s.isWsAdmin && searchParams.who === "all" ? "all" : "me";
  const kind = ["TASK", "FOLLOW_UP", "MEETING"].includes(searchParams.kind ?? "") ? searchParams.kind! : "";
  const now = new Date();
  const today = startOfDayTz(now, s.workspace.timezone);
  const tomorrow = addDays(today, 1);

  const conds = [eq(tasks.workspaceId, s.workspace.id), who === "me" ? eq(tasks.assignedTo, s.user.id) : undefined, kind ? sql`${tasks.kind} = ${kind}` : undefined];
  if (view === "open") conds.push(isNull(tasks.completedAt));
  if (view === "today") conds.push(isNull(tasks.completedAt), gte(tasks.dueAt, today), lt(tasks.dueAt, tomorrow));
  if (view === "overdue") conds.push(isNull(tasks.completedAt), isNotNull(tasks.dueAt), lt(tasks.dueAt, now));
  if (view === "done") conds.push(isNotNull(tasks.completedAt));

  const [rows, members, leadOptions] = await Promise.all([
    db
      .select({ t: tasks, lead: leads.fullName, who: users.name })
      .from(tasks)
      .leftJoin(leads, eq(leads.id, tasks.leadId))
      .leftJoin(users, eq(users.id, tasks.assignedTo))
      .where(and(...conds))
      .orderBy(view === "done" ? desc(tasks.completedAt) : asc(sql`${tasks.dueAt} nulls last`))
      .limit(200),
    getMembers(s.workspace.id),
    db.select({ id: leads.id, name: leads.fullName, company: leads.companyName }).from(leads).where(and(eq(leads.workspaceId, s.workspace.id), eq(leads.inCrm, true), isNull(leads.archivedAt))).orderBy(desc(leads.lastActivityAt)).limit(300),
  ]);
  const qs = (o: Record<string, string>) => new URLSearchParams({ view, ...(who === "all" ? { who } : {}), ...(kind ? { kind } : {}), ...o }).toString();

  return (
    <>
      <PageHeader title="Tasks & Follow-ups" subtitle="Everything you need to do next. Overdue follow-ups send you a reminder in the app." />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card>
            <div className="flex flex-wrap items-center gap-2 border-b border-navy-100 p-4">
              <div className="inline-flex rounded-lg border border-navy-200 p-0.5">
                {VIEWS.map(([k, label]) => (
                  <Link key={k} href={`/tasks?${qs({ view: k })}`} className={cn("rounded-md px-3 py-1.5 text-xs font-semibold", view === k ? "bg-navy-900 text-white" : "text-navy-600 hover:bg-navy-50")}>
                    {label}
                  </Link>
                ))}
              </div>
              <div className="inline-flex rounded-lg border border-navy-200 p-0.5">
                {[["", "All types"], ["FOLLOW_UP", "Follow-ups"], ["TASK", "Tasks"], ["MEETING", "Meetings"]].map(([k, label]) => (
                  <Link key={k} href={`/tasks?${qs({ kind: k })}`} className={cn("rounded-md px-3 py-1.5 text-xs font-semibold", kind === k ? "bg-navy-900 text-white" : "text-navy-600 hover:bg-navy-50")}>
                    {label}
                  </Link>
                ))}
              </div>
              {s.isWsAdmin && (
                <Link href={`/tasks?${qs({ who: who === "all" ? "me" : "all" })}`} className="btn-secondary btn-sm">
                  {who === "all" ? "Showing everyone’s — show mine" : "Show everyone’s"}
                </Link>
              )}
            </div>
            {rows.length === 0 ? (
              <EmptyState title="Nothing here" body={view === "overdue" ? "No overdue items. Nice." : "Add a task or follow-up with the form."} />
            ) : (
              <ul className="divide-y divide-navy-100">
                {rows.map(({ t, lead, who: assignee }) => {
                  const late = !t.completedAt && t.dueAt && t.dueAt < now;
                  const back = `/tasks?${qs({})}`;
                  return (
                    <li key={t.id} className="flex items-start justify-between gap-3 px-5 py-3.5">
                      <div className="min-w-0">
                        <p className={cn("text-sm font-semibold", t.completedAt ? "text-navy-400 line-through" : "text-navy-900")}>{t.title}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-navy-400">
                          <Badge tone="bg-navy-100 text-navy-600">{t.kind.replace("_", "-").toLowerCase()}</Badge>
                          <Badge tone={PRIORITY_TONE[t.priority]}>{t.priority}</Badge>
                          {t.dueAt && <span className={cn(late && "font-semibold text-rose-600")}>{late ? "Overdue · " : "Due "}{fmtDateTime(t.dueAt)}</span>}
                          {lead && t.leadId && (
                            <Link href={`/leads/${t.leadId}`} className="font-semibold text-brand-600 hover:underline">
                              {lead}
                            </Link>
                          )}
                          {who === "all" && assignee && <span>· {assignee}</span>}
                        </p>
                        {t.description && <p className="mt-1 text-xs text-navy-500">{t.description}</p>}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <form action={completeTaskAction}>
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="back" value={back} />
                          {t.completedAt && <input type="hidden" name="reopen" value="1" />}
                          <SubmitButton variant="secondary" size="sm">
                            {t.completedAt ? "Re-open" : "Mark done"}
                          </SubmitButton>
                        </form>
                        <form action={deleteTaskAction}>
                          <input type="hidden" name="id" value={t.id} />
                          <input type="hidden" name="back" value={back} />
                          <SubmitButton variant="ghost" size="sm" confirm="Delete this item?">
                            Delete
                          </SubmitButton>
                        </form>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="Add a task or follow-up" />
          <form action={createTaskAction} className="space-y-3 p-5">
            <input type="hidden" name="back" value={`/tasks?${qs({})}`} />
            <label className="block">
              <span className="label">What needs doing? *</span>
              <input name="title" required maxLength={200} className="input" placeholder="e.g. Send price list to Al Noor Foods" />
            </label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="label">Type</span>
                <select name="kind" className="input" defaultValue="FOLLOW_UP">
                  <option value="FOLLOW_UP">Follow-up</option>
                  <option value="TASK">Task</option>
                  <option value="MEETING">Meeting</option>
                </select>
              </label>
              <label className="block">
                <span className="label">Priority</span>
                <select name="priority" className="input" defaultValue="MEDIUM">
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </label>
              <label className="block">
                <span className="label">Due date</span>
                <input type="date" name="dueDate" className="input" />
              </label>
              <label className="block">
                <span className="label">Time</span>
                <input type="time" name="dueTime" defaultValue="10:00" className="input" />
              </label>
            </div>
            <label className="block">
              <span className="label">Lead (optional)</span>
              <select name="leadId" className="input" defaultValue="">
                <option value="">— not linked to a lead —</option>
                {leadOptions.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {l.company ? ` — ${l.company}` : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Assign to</span>
              <select name="assignedTo" className="input" defaultValue={s.user.id}>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="label">Notes</span>
              <textarea name="description" rows={2} maxLength={1000} className="input" />
            </label>
            <SubmitButton className="w-full">Add</SubmitButton>
            <p className="text-xs text-navy-400">Follow-ups and meetings need a due date. Times are in {s.workspace.timezone}.</p>
          </form>
        </Card>
      </div>
    </>
  );
}
