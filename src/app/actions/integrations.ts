"use server";

import { and, eq } from "drizzle-orm";
import { db, integrations } from "@/db";
import { requireWsAdmin } from "@/lib/session";
import { flash } from "@/lib/flash";
import { logAudit } from "@/lib/audit";
import { decrypt, encrypt } from "@/lib/crypto";
import { verifySmtp } from "@/lib/mailer";
import { str } from "@/lib/utils";

async function upsert(ws: string, provider: string, v: { status: string; config: Record<string, string>; secretEnc?: string | null; lastError?: string | null }) {
  const [cur] = await db.select().from(integrations).where(and(eq(integrations.workspaceId, ws), eq(integrations.provider, provider))).limit(1);
  const vals = { status: v.status, config: v.config, secretEnc: v.secretEnc === undefined ? cur?.secretEnc ?? null : v.secretEnc, lastCheckedAt: new Date(), lastError: v.lastError ?? null };
  if (cur) await db.update(integrations).set(vals).where(eq(integrations.id, cur.id));
  else await db.insert(integrations).values({ workspaceId: ws, provider, ...vals });
}

export async function saveSmtpAction(fd: FormData) {
  const s = await requireWsAdmin();
  const host = str(fd.get("host")).trim();
  const port = Number.parseInt(str(fd.get("port")), 10) || 587;
  const user = str(fd.get("user")).trim();
  let pass = str(fd.get("pass"));
  if (!host || !user) flash("/integrations", { err: "Enter the server and username." });
  const [cur] = await db.select().from(integrations).where(and(eq(integrations.workspaceId, s.workspace.id), eq(integrations.provider, "SMTP"))).limit(1);
  if (!pass && cur?.secretEnc) pass = decrypt(cur.secretEnc); // blank = keep the saved password
  if (!pass) flash("/integrations", { err: "Enter the password (for Gmail, use an App Password)." });
  const check = await verifySmtp({ host, port, user, pass });
  await upsert(s.workspace.id, "SMTP", { status: check.ok ? "CONFIGURED" : "ERROR", config: { host, port: String(port), user }, secretEnc: encrypt(pass), lastError: check.ok ? null : check.error ?? "Connection failed" });
  await logAudit({ workspaceId: s.workspace.id, userId: s.user.id, action: "SMTP_SAVED", meta: { host, ok: check.ok } });
  flash("/integrations", check.ok ? { ok: "Connected. Your email account works." } : { err: `Saved, but the connection failed: ${check.error}. Emails stay blocked until this works.` });
}

export async function saveAnthropicAction(fd: FormData) {
  const s = await requireWsAdmin();
  const key = str(fd.get("key")).trim();
  const model = str(fd.get("model")).trim() || "claude-sonnet-5-5";
  const [cur] = await db.select().from(integrations).where(and(eq(integrations.workspaceId, s.workspace.id), eq(integrations.provider, "ANTHROPIC"))).limit(1);
  const useKey = key || (cur?.secretEnc ? decrypt(cur.secretEnc) : "");
  if (!useKey) flash("/integrations", { err: "Paste your Anthropic API key." });
  let ok = false;
  let error = "";
  try {
    const r = await fetch("https://api.anthropic.com/v1/models?limit=1", { headers: { "x-api-key": useKey, "anthropic-version": "2023-06-01" }, signal: AbortSignal.timeout(10000) });
    ok = r.ok;
    if (!r.ok) error = r.status === 401 ? "The key was rejected (401). Check that you copied all of it." : `Anthropic answered with status ${r.status}.`;
  } catch {
    error = "Could not reach Anthropic from this server.";
  }
  await upsert(s.workspace.id, "ANTHROPIC", { status: ok ? "CONFIGURED" : "ERROR", config: { model }, secretEnc: encrypt(useKey), lastError: ok ? null : error });
  await logAudit({ workspaceId: s.workspace.id, userId: s.user.id, action: "ANTHROPIC_KEY_SAVED", meta: { ok } });
  flash("/integrations", ok ? { ok: "AI assistant connected." } : { err: `Key saved but not working: ${error}` });
}

export async function removeIntegrationAction(fd: FormData) {
  const s = await requireWsAdmin();
  const provider = str(fd.get("provider"));
  if (!["SMTP", "ANTHROPIC"].includes(provider)) flash("/integrations", { err: "Unknown integration." });
  await db.delete(integrations).where(and(eq(integrations.workspaceId, s.workspace.id), eq(integrations.provider, provider)));
  await logAudit({ workspaceId: s.workspace.id, userId: s.user.id, action: "INTEGRATION_REMOVED", meta: { provider } });
  flash("/integrations", { ok: "Removed. The saved secret was deleted." });
}
