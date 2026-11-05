/**
 * In-app reminder scheduler. It looks for things that need attention and creates notifications.
 * Every notification carries a dedupeKey, so running this 100 times never creates a duplicate.
 * It runs (a) when someone opens the app (throttled to once per 5 minutes per workspace) and
 * (b) from /api/cron/tick, which you can call every few minutes from any scheduler.
 */
import { and, eq, isNotNull, isNull, lt, notInArray } from "drizzle-orm";
import { db, leads, tasks } from "@/db";
import { notify } from "./notifications";
import type { WorkspaceSettings } from "./workspace-settings";

const lastRun = new Map<string, number>();

export async function runRemindersThrottled(workspaceId: string, settings: WorkspaceSettings) {
  const now = Date.now();
  if (now - (lastRun.get(workspaceId) ?? 0) < 5 * 60 * 1000) return;
  lastRun.set(workspaceId, now);
  await runReminders(workspaceId, settings);
}

export async function runReminders(workspaceId: string, settings: WorkspaceSettings, now = new Date()) {
  const soon = new Date(now.getTime() + 24 * 3600 * 1000);
  let created = 0;

  const open = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.workspaceId, workspaceId), isNull(tasks.completedAt), isNotNull(tasks.dueAt), lt(tasks.dueAt, soon)))
    .limit(500);

  for (const t of open) {
    if (!t.assignedTo || !t.dueAt) continue;
    const overdue = t.dueAt < now;
    const isFollowUp = t.kind === "FOLLOW_UP";
    if (isFollowUp ? !settings.prefs.notifyFollowUps : !settings.prefs.notifyTasks) continue;
    await notify({
      workspaceId,
      userId: t.assignedTo,
      type: overdue ? "TASK_OVERDUE" : isFollowUp ? "FOLLOW_UP_DUE" : t.kind === "MEETING" ? "MEETING_SOON" : "FOLLOW_UP_DUE",
      title: overdue ? `Overdue: ${t.title}` : `Due soon: ${t.title}`,
      link: t.leadId ? `/leads/${t.leadId}` : "/tasks",
      dedupeKey: `${overdue ? "overdue" : "due"}:${t.id}`,
    });
    created++;
  }

  // Leads nobody has touched for a while (only real CRM leads that are still open).
  const staleBefore = new Date(now.getTime() - settings.prefs.staleLeadDays * 86400000);
  const stale = await db
    .select({ id: leads.id, name: leads.fullName, assignedTo: leads.assignedTo })
    .from(leads)
    .where(
      and(
        eq(leads.workspaceId, workspaceId),
        eq(leads.inCrm, true),
        isNull(leads.archivedAt),
        notInArray(leads.status, ["CONVERTED", "NOT_INTERESTED", "DISQUALIFIED"]),
        lt(leads.lastActivityAt, staleBefore),
        isNotNull(leads.assignedTo)
      )
    )
    .limit(200);
  const week = Math.floor(now.getTime() / (7 * 86400000));
  for (const l of stale) {
    await notify({
      workspaceId,
      userId: l.assignedTo,
      type: "LEAD_STALE",
      title: `${l.name} has had no activity for ${settings.prefs.staleLeadDays}+ days`,
      link: `/leads/${l.id}`,
      dedupeKey: `stale:${l.id}:${week}`, // at most one reminder per lead per week
    });
    created++;
  }
  return { checked: open.length + stale.length, created };
}

