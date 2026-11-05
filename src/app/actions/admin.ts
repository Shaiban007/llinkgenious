"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db, errorLogs, users } from "@/db";
import { requirePlatformAdmin } from "@/lib/session";
import { flash } from "@/lib/flash";
import { logAudit } from "@/lib/audit";
import { str } from "@/lib/utils";

export async function setUserActiveAction(fd: FormData) {
  const s = await requirePlatformAdmin();
  const id = str(fd.get("id"));
  const active = fd.get("active") === "1";
  if (id === s.user.id) flash("/admin", { err: "You cannot deactivate your own account." });
  const [u] = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, id)).limit(1);
  if (!u) flash("/admin", { err: "User not found." });
  // Bumping sessionVersion signs the person out everywhere straight away.
  await db.update(users).set({ isActive: active, sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, id));
  await logAudit({ workspaceId: s.workspace.id, userId: s.user.id, action: active ? "USER_ACTIVATED" : "USER_DEACTIVATED", entity: "user", entityId: id });
  revalidatePath("/admin");
  flash("/admin", { ok: `${u.name} ${active ? "can log in again" : "has been deactivated and signed out"}.` });
}

export async function signOutUserAction(fd: FormData) {
  const s = await requirePlatformAdmin();
  const id = str(fd.get("id"));
  if (id === s.user.id) flash("/admin", { err: "Use the Log out button to sign yourself out." });
  await db.update(users).set({ sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, id));
  await logAudit({ workspaceId: s.workspace.id, userId: s.user.id, action: "USER_SIGNED_OUT", entity: "user", entityId: id });
  flash("/admin", { ok: "That person was signed out everywhere." });
}

export async function clearErrorLogsAction() {
  const s = await requirePlatformAdmin();
  await db.delete(errorLogs).where(sql`${errorLogs.createdAt} < now() - interval '7 days'`);
  await logAudit({ workspaceId: s.workspace.id, userId: s.user.id, action: "ERROR_LOGS_CLEARED" });
  revalidatePath("/admin");
  flash("/admin", { ok: "Error logs older than 7 days were deleted." });
}
