import { and, count, desc, eq, isNull } from "drizzle-orm";
import { Bell } from "lucide-react";
import { db, notifications } from "@/db";
import { requireSession } from "@/lib/session";
import { fmtDateTime } from "@/lib/utils";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { dismissAction, markAllReadAction, markReadAction } from "@/app/actions/notifications";
import { cn } from "@/lib/utils";
import Link from "next/link";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

export default async function NotificationsPage({ searchParams }: { searchParams: { show?: string } }) {
  const s = await requireSession();
  const unreadOnly = searchParams.show === "unread";
  const base = and(eq(notifications.userId, s.user.id), eq(notifications.workspaceId, s.workspace.id), isNull(notifications.dismissedAt));
  const [rows, [u]] = await Promise.all([
    db.select().from(notifications).where(unreadOnly ? and(base, isNull(notifications.readAt)) : base).orderBy(desc(notifications.createdAt)).limit(100),
    db.select({ n: count() }).from(notifications).where(and(base, isNull(notifications.readAt))),
  ]);
  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle="Reminders for follow-ups, overdue tasks, stale leads, assignments and approvals."
        actions={
          <>
            <Link href={unreadOnly ? "/notifications" : "/notifications?show=unread"} className="btn-secondary">
              {unreadOnly ? "Show all" : `Unread only (${Number(u.n)})`}
            </Link>
            <form action={markAllReadAction}>
              <SubmitButton variant="secondary">Mark all as read</SubmitButton>
            </form>
          </>
        }
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState title="You are all caught up" body="New reminders appear here as they happen." />
        ) : (
          <ul className="divide-y divide-navy-100">
            {rows.map((n) => (
              <li key={n.id} className={cn("flex items-start gap-3 px-5 py-4", !n.readAt && "bg-brand-50/50")}>
                <Bell size={16} className={cn("mt-0.5 shrink-0", n.readAt ? "text-navy-300" : "text-brand-600")} />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm", n.readAt ? "text-navy-600" : "font-semibold text-navy-900")}>{n.title}</p>
                  {n.body && <p className="text-xs text-navy-500">{n.body}</p>}
                  <p className="mt-0.5 text-[11px] text-navy-400">{fmtDateTime(n.createdAt)}</p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <form action={markReadAction}>
                    <input type="hidden" name="id" value={n.id} />
                    {n.link && <input type="hidden" name="link" value={n.link} />}
                    <SubmitButton variant="secondary" size="sm">
                      {n.link ? "Open" : n.readAt ? "Read" : "Mark read"}
                    </SubmitButton>
                  </form>
                  <form action={dismissAction}>
                    <input type="hidden" name="id" value={n.id} />
                    <SubmitButton variant="ghost" size="sm">
                      Dismiss
                    </SubmitButton>
                  </form>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
