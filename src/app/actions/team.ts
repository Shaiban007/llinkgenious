"use server";

import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, leads, users, workspaceMembers } from "@/db";
import { requireWsAdmin } from "@/lib/session";
import { flash } from "@/lib/flash";
import { logAudit } from "@/lib/audit";
import { createAuthToken, appUrl } from "@/lib/auth-tokens";
import { hashPassword } from "@/lib/password";
import { randomPassword } from "@/lib/crypto";
import { rateLimit } from "@/lib/rate-limit";
import { sendSystemMail } from "@/lib/mailer";
import { str, strOrNull } from "@/lib/utils";

const schema = z.object({ name: z.string().trim().min(2, "Enter the person's name").max(100), email: z.string().trim().toLowerCase().email("Enter a valid email address") });

async function adminCount(ws: string) {
  const [r] = await db.select({ n: sql<number>`count(*)` }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, ws), eq(workspaceMembers.role, "ADMIN")));
  return Number(r.n);
}

export async function addMemberAction(fd: FormData) {
  const s = await requireWsAdmin();
  const lim = await rateLimit(`addmember:${s.user.id}`, 20, 3600);
  if (!lim.ok) flash("/team", { err: "Too many additions in the last hour. Try again later." });
  const p = schema.safeParse({ name: str(fd.get("name")), email: str(fd.get("email")) });
  if (!p.success) flash("/team", { err: p.error.issues[0].message });
  const role = str(fd.get("role")) === "ADMIN" ? "ADMIN" : "MEMBER";
  const { name, email } = p.data!;

  const [existing] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  if (existing) {
    const added = await db.insert(workspaceMembers).values({ workspaceId: s.workspace.id, userId: existing.id, role, department: strOrNull(fd.get("department")) }).onConflictDoNothing().returning({ id: workspaceMembers.id });
    await logAudit({ workspaceId: s.workspace.id, userId: s.user.id, action: "MEMBER_ADDED", meta: { email, existing: true } });
    flash("/team", added.length ? { ok: `${email} was added. They will see this workspace in their workspace switcher the next time they log in.` } : { err: "That person is already in this workspace." });
  }

  // New person: create the account with an unusable random password and give the admin a one-time "set your password" link.
  const [u] = await db.insert(users).values({ name, email, passwordHash: await hashPassword(randomPassword()), jobTitle: strOrNull(fd.get("jobTitle")) }).returning();
  await db.insert(workspaceMembers).values({ workspaceId: s.workspace.id, userId: u.id, role, department: strOrNull(fd.get("department")) });
  const raw = await createAuthToken(u.id, "RESET_PASSWORD", 60 * 72);
  const link = `${appUrl()}/reset-password/${raw}`;
  const mail = await sendSystemMail({ to: email, subject: `You have been added to ${s.workspace.name} on LinkGenius AI`, text: `Hello ${name},\n\n${s.user.name} added you to “${s.workspace.name}”.\nSet your password here (link valid for 3 days):\n${link}\n` }).catch(() => ({ delivered: false, devMode: true }));
  await logAudit({ workspaceId: s.workspace.id, userId: s.user.id, action: "MEMBER_INVITED", meta: { email, role } });
  const q = new URLSearchParams({ ok: mail.delivered ? `Invitation emailed to ${email}.` : `${name} was added. Email is not set up, so send them this one-time link yourself (valid 3 days):`, ...(mail.delivered ? {} : { link }) });
  flash(`/team?${q.toString()}`, {});
}

export async function setRoleAction(fd: FormData) {
  const s = await requireWsAdmin();
  const userId = str(fd.get("userId"));
  const role = str(fd.get("role")) === "ADMIN" ? "ADMIN" : "MEMBER";
  if (role === "MEMBER" && (await adminCount(s.workspace.id)) <= 1) {
    const [m] = await db.select({ r: workspaceMembers.role }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, s.workspace.id), eq(workspaceMembers.userId, userId))).limit(1);
    if (m?.r === "ADMIN") flash("/team", { err: "A workspace must keep at least one administrator." });
  }
  await db.update(workspaceMembers).set({ role }).where(and(eq(workspaceMembers.workspaceId, s.workspace.id), eq(workspaceMembers.userId, userId)));
  await logAudit({ workspaceId: s.workspace.id, userId: s.user.id, action: "MEMBER_ROLE_CHANGED", meta: { userId, role } });
  flash("/team", { ok: "Role updated." });
}

export async function removeMemberAction(fd: FormData) {
  const s = await requireWsAdmin();
  const userId = str(fd.get("userId"));
  const [m] = await db.select({ r: workspaceMembers.role }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, s.workspace.id), eq(workspaceMembers.userId, userId))).limit(1);
  if (!m) flash("/team", { err: "That person is not in this workspace." });
  if (m.r === "ADMIN" && (await adminCount(s.workspace.id)) <= 1) flash("/team", { err: "You cannot remove the only administrator." });
  // Their leads stay with the company: hand them to the administrator doing the removal.
  await db.update(leads).set({ assignedTo: s.user.id }).where(and(eq(leads.workspaceId, s.workspace.id), eq(leads.assignedTo, userId)));
  await db.delete(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, s.workspace.id), eq(workspaceMembers.userId, userId)));
  await logAudit({ workspaceId: s.workspace.id, userId: s.user.id, action: "MEMBER_REMOVED", meta: { userId } });
  flash("/team", { ok: "Removed. Their leads were reassigned to you." });
}
