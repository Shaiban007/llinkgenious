"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { db, workspaceMembers } from "@/db";
import { requireSession, WORKSPACE_COOKIE } from "@/lib/session";

/** Switch the active workspace. Membership is re-checked on the server so nobody can open someone else's workspace. */
export async function switchWorkspace(formData: FormData) {
  const s = await requireSession();
  const id = String(formData.get("workspaceId") ?? "");
  const [m] = await db
    .select({ id: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.userId, s.user.id), eq(workspaceMembers.workspaceId, id)))
    .limit(1);
  if (!m) redirect("/dashboard?err=" + encodeURIComponent("You are not a member of that workspace."));
  cookies().set(WORKSPACE_COOKIE, id, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  redirect("/dashboard");
}
