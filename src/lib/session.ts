import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { asc, eq } from "drizzle-orm";
import { db, users, workspaceMembers, workspaces } from "@/db";
import { authOptions } from "./auth";
import { getSettings, type WorkspaceSettings } from "./workspace-settings";

export type AppSession = {
  user: {
    id: string;
    name: string;
    email: string;
    role: "ADMIN" | "USER"; // platform role
    image: string | null;
    emailVerified: boolean;
  };
  workspace: {
    id: string;
    name: string;
    companyName: string | null;
    industry: string | null;
    timezone: string;
    dateFormat: string;
    settings: WorkspaceSettings;
  };
  memberRole: "ADMIN" | "MEMBER";
  isWsAdmin: boolean;
  isPlatformAdmin: boolean;
  workspaces: { id: string; name: string }[];
};

export const WORKSPACE_COOKIE = "lg_ws";

/** Reads the login cookie, re-checks the user in the database, and works out which workspace is active. */
export const getSession = cache(async (): Promise<AppSession | null> => {
  const s = await getServerSession(authOptions);
  if (!s?.user?.id) return null;
  // "Remember me" off → session only lasts 12 hours.
  if (!s.user.remember && Date.now() - (s.user.loginAt ?? 0) > 12 * 3600 * 1000) return null;

  const [user] = await db.select().from(users).where(eq(users.id, s.user.id)).limit(1);
  if (!user || !user.isActive || user.sessionVersion !== s.user.sv) return null;

  const memberships = await db
    .select({ ws: workspaces, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, user.id))
    .orderBy(asc(workspaceMembers.createdAt));
  if (!memberships.length) return null;

  const wanted = cookies().get(WORKSPACE_COOKIE)?.value;
  const current = memberships.find((m) => m.ws.id === wanted) ?? memberships[0];

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      image: user.image,
      emailVerified: Boolean(user.emailVerifiedAt),
    },
    workspace: {
      id: current.ws.id,
      name: current.ws.name,
      companyName: current.ws.companyName,
      industry: current.ws.industry,
      timezone: current.ws.timezone,
      dateFormat: current.ws.dateFormat,
      settings: getSettings(current.ws.settings),
    },
    memberRole: current.role,
    isWsAdmin: current.role === "ADMIN",
    isPlatformAdmin: user.role === "ADMIN",
    workspaces: memberships.map((m) => ({ id: m.ws.id, name: m.ws.name })),
  };
});

export async function requireSession(): Promise<AppSession> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

/** Workspace administrators only (team, integrations, targets, deletions). */
export async function requireWsAdmin(): Promise<AppSession> {
  const s = await requireSession();
  if (!s.isWsAdmin) redirect("/dashboard?err=" + encodeURIComponent("Only workspace administrators can do that."));
  return s;
}

/** Platform administrators only (the /admin panel). */
export async function requirePlatformAdmin(): Promise<AppSession> {
  const s = await requireSession();
  if (!s.isPlatformAdmin) redirect("/dashboard?err=" + encodeURIComponent("Administrator access required."));
  return s;
}
