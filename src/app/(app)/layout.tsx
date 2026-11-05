import { and, count, eq, isNull } from "drizzle-orm";
import { db, notifications } from "@/db";
import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/session";
import { runRemindersThrottled } from "@/lib/reminders";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const s = await requireSession();
  await runRemindersThrottled(s.workspace.id, s.workspace.settings).catch(() => {});
  const [u] = await db
    .select({ n: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, s.user.id), eq(notifications.workspaceId, s.workspace.id), isNull(notifications.readAt), isNull(notifications.dismissedAt)));

  return (
    <AppShell
      userName={s.user.name}
      userEmail={s.user.email}
      emailVerified={s.user.emailVerified}
      isWsAdmin={s.isWsAdmin}
      isPlatformAdmin={s.isPlatformAdmin}
      workspaceId={s.workspace.id}
      workspaceName={s.workspace.name}
      workspaces={s.workspaces}
      unread={Number(u.n)}
    >
      {children}
    </AppShell>
  );
}
