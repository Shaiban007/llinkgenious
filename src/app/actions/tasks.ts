"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { db, leads, tasks, workspaceMembers } from "@/db";
import { requireSession } from "@/lib/session";
import { toCtx } from "@/lib/ctx";
import { flash } from "@/lib/flash";
import { addActivity } from "@/lib/leads";
import { notify } from "@/lib/notifications";
import { str, strOrNull } from "@/lib/utils";

const safe = (p: string, fallback: string) => (p.startsWith("/") ? p : fallback);

/** Converts a date + time typed in the workspace timezone into a real instant. */
function parseDue(date: string, time: string, tz: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const t = /^\d{2}:\d{2}$/.test(time) ? time : "09:00";
  const guess = new Date(`${date}T${t}:00Z`);
  if (Number.isNaN(guess.getTime())) return null;
  const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(guess)) p[part.type] = part.value;
  const off = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - guess.getTime();
  return new Date(guess.getTime() - off);
}

export async function createTaskAction(fd: FormData) {
  const s = await requireSession();
  const back = safe(str(fd.get("back")), "/tasks");
  const title = str(fd.get("title")).trim();
  if (title.length < 2) flash(back, { err: "Give the task a title." });
  const kind = ["TASK", "FOLLOW_UP", "MEETING"].includes(str(fd.get("kind"))) ? (str(fd.get("kind")) as "TASK" | "FOLLOW_UP" | "MEETING") : "TASK";
  const priority = ["LOW", "MEDIUM", "HIGH", "URGENT"].includes(str(fd.get("priority"))) ? (str(fd.get("priority")) as "LOW") : "MEDIUM";
  const dueAt = parseDue(str(fd.get("dueDate")), str(fd.get("dueTime")), s.workspace.timezone);
  if ((kind === "FOLLOW_UP" || kind === "MEETING") && !dueAt) flash(back, { err: "Follow-ups and meetings need a due date." });

  const leadId = strOrNull(fd.get("leadId"));
  let leadName: string | null = null;
  if (leadId) {
    const [l] = await db.select({ id: leads.id, name: leads.fullName }).from(leads).where(and(eq(leads.id, leadId), eq(leads.workspaceId, s.workspace.id))).limit(1);
    if (!l) flash(back, { err: "Lead not found." });
    leadName = l.name;
  }
  const assignedTo = strOrNull(fd.get("assignedTo")) ?? s.user.id;
  const [m] = await db.select({ u: workspaceMembers.userId }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, s.workspace.id), eq(workspaceMembers.userId, assignedTo))).limit(1);
  if (!m) flash(back, { err: "That person is not in this workspace." });

  const [t] = await db
    .insert(tasks)
    .values({ workspaceId: s.workspace.id, leadId, title: title.slice(0, 200), description: strOrNull(fd.get("description"))?.slice(0, 1000), kind, priority, dueAt, assignedTo, createdBy: s.user.id })
    .returning();
  if (leadId) {
    await addActivity(toCtx(s), leadId, "TASK", `${kind === "FOLLOW_UP" ? "Follow-up" : kind === "MEETING" ? "Meeting" : "Task"} created: ${title}`, { taskId: t.id });
    if (dueAt && kind === "FOLLOW_UP") await db.update(leads).set({ nextFollowUpAt: dueAt }).where(eq(leads.id, leadId));
  }
  if (assignedTo !== s.user.id) await notify({ workspaceId: s.workspace.id, userId: assignedTo, type: "FOLLOW_UP_DUE", title: `New ${kind.toLowerCase().replace("_", "-")} for you: ${title}`, body: leadName ?? undefined, link: leadId ? `/leads/${leadId}` : "/tasks" });
  revalidatePath("/tasks");
  flash(back, { ok: "Saved." });
}

export async function completeTaskAction(fd: FormData) {
  const s = await requireSession();
  const back = safe(str(fd.get("back")), "/tasks");
  const id = str(fd.get("id"));
  const reopen = fd.get("reopen") === "1";
  const [t] = await db.update(tasks).set({ completedAt: reopen ? null : new Date() }).where(and(eq(tasks.id, id), eq(tasks.workspaceId, s.workspace.id))).returning();
  if (!t) flash(back, { err: "Task not found." });
  if (t.leadId && !reopen) {
    await addActivity(toCtx(s), t.leadId, "TASK", `Completed: ${t.title}`, { taskId: t.id });
    if (t.kind === "FOLLOW_UP") {
      await db.update(leads).set({ nextFollowUpAt: null }).where(and(eq(leads.id, t.leadId), eq(leads.nextFollowUpAt, t.dueAt!)));
    }
  }
  revalidatePath("/tasks");
  flash(back, { ok: reopen ? "Task re-opened." : "Marked as done." });
}

export async function deleteTaskAction(fd: FormData) {
  const s = await requireSession();
  const back = safe(str(fd.get("back")), "/tasks");
  const id = str(fd.get("id"));
  const [t] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.workspaceId, s.workspace.id))).limit(1);
  if (!t) flash(back, { err: "Task not found." });
  if (!s.isWsAdmin && t.createdBy !== s.user.id && t.assignedTo !== s.user.id) flash(back, { err: "Only the creator, the assignee or an administrator can delete this." });
  await db.delete(tasks).where(eq(tasks.id, id));
  revalidatePath("/tasks");
  flash(back, { ok: "Task deleted." });
}
