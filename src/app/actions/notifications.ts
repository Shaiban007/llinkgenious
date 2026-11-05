"use server";

import { revalidatePath } from "next/cache";
import { and, eq, isNull } from "drizzle-orm";
import { db, notifications } from "@/db";
import { requireSession } from "@/lib/session";
import { flash } from "@/lib/flash";
import { str } from "@/lib/utils";

export async function markReadAction(fd: FormData) {
  const s = await requireSession();
  const id = str(fd.get("id"));
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.id, id), eq(notifications.userId, s.user.id)));
  revalidatePath("/notifications");
  const link = str(fd.get("link"));
  if (link.startsWith("/")) flash(link, {});
  flash("/notifications", {});
}

export async function markAllReadAction() {
  const s = await requireSession();
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, s.user.id), eq(notifications.workspaceId, s.workspace.id), isNull(notifications.readAt)));
  flash("/notifications", { ok: "All notifications marked as read." });
}

export async function dismissAction(fd: FormData) {
  const s = await requireSession();
  await db.update(notifications).set({ dismissedAt: new Date(), readAt: new Date() }).where(and(eq(notifications.id, str(fd.get("id"))), eq(notifications.userId, s.user.id)));
  flash("/notifications", {});
}
