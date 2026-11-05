"use server";

import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, leads, users, workspaces } from "@/db";
import { requireSession, requireWsAdmin } from "@/lib/session";
import { toCtx } from "@/lib/ctx";
import { flash } from "@/lib/flash";
import { logAudit } from "@/lib/audit";
import { hashPassword, passwordSchema, verifyPassword } from "@/lib/password";
import { getSettings, splitList, type WorkspaceSettings } from "@/lib/workspace-settings";
import { scoreAndSave } from "@/lib/leads";
import { rateLimit } from "@/lib/rate-limit";
import { str, strOrNull } from "@/lib/utils";

const tabPath = (tab: string) => `/settings?tab=${tab}`;

async function saveSettings(workspaceId: string, mutate: (s: WorkspaceSettings) => void, extra: Partial<typeof workspaces.$inferInsert> = {}) {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const s = getSettings(ws.settings);
  mutate(s);
  await db.update(workspaces).set({ settings: s as unknown as Record<string, unknown>, ...extra }).where(eq(workspaces.id, workspaceId));
}

/* ───────────── profile & security (everyone) ───────────── */
export async function updateProfileAction(fd: FormData) {
  const s = await requireSession();
  const name = str(fd.get("name")).trim();
  if (name.length < 2) flash(tabPath("profile"), { err: "Please enter your name." });
  await db.update(users).set({ name: name.slice(0, 100), jobTitle: strOrNull(fd.get("jobTitle"))?.slice(0, 100), country: strOrNull(fd.get("country"))?.slice(0, 80) }).where(eq(users.id, s.user.id));
  flash(tabPath("profile"), { ok: "Profile saved." });
}

export async function changePasswordAction(fd: FormData) {
  const s = await requireSession();
  const lim = await rateLimit(`chpw:${s.user.id}`, 8, 3600);
  if (!lim.ok) flash(tabPath("security"), { err: "Too many attempts. Try again in an hour." });
  const [u] = await db.select().from(users).where(eq(users.id, s.user.id)).limit(1);
  if (!(await verifyPassword(str(fd.get("current")), u.passwordHash))) flash(tabPath("security"), { err: "Your current password is not correct." });
  const parsed = passwordSchema.safeParse(str(fd.get("password")));
  if (!parsed.success) flash(tabPath("security"), { err: parsed.error.issues[0].message });
  if (str(fd.get("password")) !== str(fd.get("confirm"))) flash(tabPath("security"), { err: "The new passwords do not match." });
  // Bumping sessionVersion signs out every device (including this one) so an old stolen session stops working.
  await db.update(users).set({ passwordHash: await hashPassword(parsed.data!), sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, s.user.id));
  await logAudit({ workspaceId: s.workspace.id, userId: s.user.id, action: "PASSWORD_CHANGED" });
  redirect("/login?reset=1");
}

export async function signOutEverywhereAction() {
  const s = await requireSession();
  await db.update(users).set({ sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, s.user.id));
  await logAudit({ workspaceId: s.workspace.id, userId: s.user.id, action: "SIGN_OUT_EVERYWHERE" });
  redirect("/login");
}

/* ───────────── personal preferences ───────────── */
export async function updatePrefsAction(fd: FormData) {
  const s = await requireWsAdmin();
  const stale = Number.parseInt(str(fd.get("staleLeadDays")), 10);
  const range = str(fd.get("dashboardRange"));
  await saveSettings(s.workspace.id, (x) => {
    x.prefs.notifyFollowUps = fd.get("notifyFollowUps") === "on";
    x.prefs.notifyTasks = fd.get("notifyTasks") === "on";
    x.prefs.notifyCampaigns = fd.get("notifyCampaigns") === "on";
    x.prefs.staleLeadDays = Math.min(120, Math.max(3, stale || 14));
    x.prefs.dashboardRange = ["today", "7d", "30d", "90d"].includes(range) ? range : "30d";
  });
  flash(tabPath("notifications"), { ok: "Notification settings saved." });
}

/* ───────────── workspace (admin) ───────────── */
export async function updateWorkspaceAction(fd: FormData) {
  const s = await requireWsAdmin();
  const name = str(fd.get("name")).trim();
  const tz = str(fd.get("timezone")).trim();
  if (name.length < 2) flash(tabPath("workspace"), { err: "Workspace name is required." });
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
  } catch {
    flash(tabPath("workspace"), { err: "That timezone is not valid. Use a name like Asia/Kolkata or Asia/Dubai." });
  }
  const cur = str(fd.get("currency")).trim().toUpperCase();
  await saveSettings(s.workspace.id, (x) => { if (/^[A-Z]{3}$/.test(cur)) x.prefs.defaultCurrency = cur; }, { name: name.slice(0, 100), companyName: strOrNull(fd.get("companyName"))?.slice(0, 160), industry: strOrNull(fd.get("industry")), timezone: tz });
  flash(tabPath("workspace"), { ok: "Workspace saved." });
}

/* ───────────── scoring & ideal customer profile (admin) ───────────── */
const KEYS = ["industry", "designation", "companySize", "location", "icp", "information", "freshness"] as const;

export async function updateScoringAction(fd: FormData) {
  const s = await requireWsAdmin();
  const w: Record<string, number> = {};
  for (const k of KEYS) {
    const v = Number.parseInt(str(fd.get(`w_${k}`)), 10);
    if (Number.isNaN(v) || v < 0 || v > 100) flash(tabPath("scoring"), { err: "Each weight must be a whole number from 0 to 100." });
    w[k] = v;
  }
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  if (total !== 100) flash(tabPath("scoring"), { err: `The weights add up to ${total}. They must add up to exactly 100.` });
  const hi = Number.parseInt(str(fd.get("t_high")), 10);
  const go = Number.parseInt(str(fd.get("t_good")), 10);
  const me = Number.parseInt(str(fd.get("t_medium")), 10);
  if (!(hi > go && go > me && me > 0 && hi <= 100)) flash(tabPath("scoring"), { err: "Thresholds must go High > Good > Medium > 0 (and High at most 100)." });
  const fresh = Number.parseInt(str(fd.get("freshnessDays")), 10);
  await saveSettings(s.workspace.id, (x) => {
    Object.assign(x.scoring.weights, w);
    x.scoring.thresholds = { high: hi, good: go, medium: me };
    x.scoring.freshnessDays = Math.min(730, Math.max(7, fresh || 90));
    x.scoring.icp = {
      industries: splitList(str(fd.get("icp_industries"))),
      titles: splitList(str(fd.get("icp_titles"))),
      sizes: splitList(str(fd.get("icp_sizes"))),
      locations: splitList(str(fd.get("icp_locations"))),
      keywords: splitList(str(fd.get("icp_keywords"))),
    };
  });
  await logAudit({ workspaceId: s.workspace.id, userId: s.user.id, action: "SCORING_UPDATED" });
  flash(tabPath("scoring"), { ok: "Scoring rules saved. Use “Re-score all leads” to apply them to existing leads." });
}

export async function rescoreAllAction() {
  const s = await requireWsAdmin();
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, s.workspace.id)).limit(1);
  const ctx = { ...toCtx(s), settings: getSettings(ws.settings) };
  const rows = await db.select().from(leads).where(and(eq(leads.workspaceId, s.workspace.id), sql`${leads.archivedAt} is null`));
  for (const l of rows) await scoreAndSave(ctx, l);
  flash(tabPath("scoring"), { ok: `Re-scored ${rows.length} lead${rows.length === 1 ? "" : "s"}.` });
}

/* ───────────── email sender settings (admin) ───────────── */
const emailSchema = z.object({
  fromName: z.string().trim().max(100),
  fromEmail: z.string().trim().max(200).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), "From address is not a valid email"),
  replyTo: z.string().trim().max(200).refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), "Reply-to is not a valid email"),
  signature: z.string().max(600),
  unsubscribeFooter: z.string().max(300),
  physicalAddress: z.string().trim().max(300),
});

export async function updateEmailSettingsAction(fd: FormData) {
  const s = await requireWsAdmin();
  const p = emailSchema.safeParse({ fromName: str(fd.get("fromName")), fromEmail: str(fd.get("fromEmail")), replyTo: str(fd.get("replyTo")), signature: str(fd.get("signature")), unsubscribeFooter: str(fd.get("unsubscribeFooter")), physicalAddress: str(fd.get("physicalAddress")) });
  if (!p.success) flash(tabPath("email"), { err: p.error.issues[0].message });
  const limit = Math.min(500, Math.max(1, Number.parseInt(str(fd.get("dailyLimit")), 10) || 20));
  await saveSettings(s.workspace.id, (x) => {
    Object.assign(x.email, p.data, { dailyLimit: limit });
  });
  flash(tabPath("email"), { ok: "Email settings saved." });
}
