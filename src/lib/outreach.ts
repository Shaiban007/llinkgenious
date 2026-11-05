/**
 * Email outreach engine. SAFETY RULES (all enforced here, on the server, at send time):
 *  1. Nothing is ever sent automatically from a draft. A person must approve each email first.
 *  2. A workspace SMTP account must be configured and verified (we never pretend to send).
 *  3. The workspace must have a postal address in the footer (required by anti-spam laws).
 *  4. Every email carries a signed one-click unsubscribe link. Unsubscribed addresses go on a
 *     suppression list and can never be emailed again.
 *  5. A daily sending limit protects your domain reputation.
 */
import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { db, campaigns, emailSuppressions, leads, outreachEmails, type Lead } from "@/db";
import type { Ctx } from "./leads";
import { addActivity, changeStatus } from "./leads";
import { getWorkspaceSmtp, sendWorkspaceMail } from "./mailer";
import { safeEqual, signValue } from "./crypto";
import { startOfDayTz } from "./utils";
import { notify } from "./notifications";
import { logAudit } from "./audit";

export const appUrl = () => (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");

/* ───────────── unsubscribe tokens ───────────── */
export function makeUnsubscribeToken(workspaceId: string, email: string): string {
  const payload = `${workspaceId}|${email.toLowerCase()}`;
  return `${Buffer.from(payload).toString("base64url")}.${signValue(payload).slice(0, 32)}`;
}

export function parseUnsubscribeToken(token: string): { workspaceId: string; email: string } | null {
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return null;
  let payload: string;
  try {
    payload = Buffer.from(b64, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!safeEqual(signValue(payload).slice(0, 32), sig)) return null;
  const [workspaceId, email] = payload.split("|");
  return workspaceId && email ? { workspaceId, email } : null;
}

/* ───────────── templates ───────────── */
/** Supports {{firstName}} and fallbacks like {{firstName|there}}. Missing values never leak as "undefined". */
export function renderTemplate(tpl: string, vars: Record<string, string | null | undefined>): string {
  return tpl.replace(/\{\{\s*(\w+)\s*(?:\|([^}]*))?\}\}/g, (_m, key: string, fallback?: string) => {
    const v = vars[key];
    return v && v.trim() ? v.trim() : (fallback ?? "").trim();
  });
}

export function leadVars(lead: Lead, senderName: string, senderCompany: string) {
  return {
    firstName: lead.firstName,
    lastName: lead.lastName,
    fullName: lead.fullName,
    company: lead.companyName,
    jobTitle: lead.jobTitle,
    industry: lead.industry,
    country: lead.country,
    senderName,
    senderCompany,
  };
}

export const DEFAULT_SUBJECT = "Rice & turmeric supply from India — {{company|your business}}";
export const DEFAULT_BODY = `Hello {{firstName|there}},

I'm {{senderName}} from {{senderCompany}}, an Indian exporter of rice and turmeric. I'm getting in touch because {{company|your company}} may be sourcing these products.

If useful, I can share specifications, packaging options and current pricing for your market. Would you be open to a short reply or call?

Kind regards,
{{senderName}}
{{senderCompany}}`;

export function buildFooter(settings: Ctx["settings"], unsubscribeUrl: string) {
  const e = settings.email;
  const lines = [e.signature?.trim(), "—", e.unsubscribeFooter?.trim() || "If you do not want to receive emails from us, you can unsubscribe at any time:", unsubscribeUrl, e.physicalAddress?.trim()].filter(Boolean);
  return lines.join("\n");
}

/* ───────────── drafts ───────────── */
export type DraftSkip = { leadId: string; name: string; reason: string };

export async function isSuppressed(workspaceId: string, email: string) {
  const [r] = await db
    .select({ id: emailSuppressions.id })
    .from(emailSuppressions)
    .where(and(eq(emailSuppressions.workspaceId, workspaceId), sql`lower(${emailSuppressions.email}) = ${email.toLowerCase()}`))
    .limit(1);
  return Boolean(r);
}

export async function createDrafts(
  ctx: Ctx & { userName: string; companyName: string },
  input: { leadIds: string[]; subject: string; body: string; campaignId?: string | null }
) {
  const rows = input.leadIds.length
    ? await db.select().from(leads).where(and(eq(leads.workspaceId, ctx.workspaceId), inArray(leads.id, input.leadIds), eq(leads.inCrm, true), sql`${leads.archivedAt} is null`))
    : [];
  const skipped: DraftSkip[] = [];
  let created = 0;
  for (const l of rows) {
    if (!l.email) {
      skipped.push({ leadId: l.id, name: l.fullName, reason: "No email address on this lead" });
      continue;
    }
    if (l.emailOptOut) {
      skipped.push({ leadId: l.id, name: l.fullName, reason: "Marked as do-not-email" });
      continue;
    }
    if (await isSuppressed(ctx.workspaceId, l.email)) {
      skipped.push({ leadId: l.id, name: l.fullName, reason: "Unsubscribed — cannot be emailed" });
      continue;
    }
    const [existing] = await db
      .select({ id: outreachEmails.id })
      .from(outreachEmails)
      .where(
        and(
          eq(outreachEmails.workspaceId, ctx.workspaceId),
          eq(outreachEmails.leadId, l.id),
          input.campaignId ? eq(outreachEmails.campaignId, input.campaignId) : sql`${outreachEmails.campaignId} is null`,
          inArray(outreachEmails.status, ["DRAFT", "APPROVED", "SENT"])
        )
      )
      .limit(1);
    if (existing) {
      skipped.push({ leadId: l.id, name: l.fullName, reason: "Already has a draft or sent email for this campaign" });
      continue;
    }
    const vars = leadVars(l, ctx.userName, ctx.companyName);
    await db.insert(outreachEmails).values({
      workspaceId: ctx.workspaceId,
      campaignId: input.campaignId ?? null,
      leadId: l.id,
      toEmail: l.email,
      subject: renderTemplate(input.subject, vars),
      body: renderTemplate(input.body, vars),
      status: "DRAFT",
      createdBy: ctx.userId,
    });
    created++;
  }
  if (created) await notify({ workspaceId: ctx.workspaceId, userId: ctx.userId, type: "EMAIL_PENDING", title: `${created} email draft${created > 1 ? "s" : ""} waiting for your approval`, link: "/outbox" });
  return { created, skipped };
}

/* ───────────── sending ───────────── */
export async function sentToday(workspaceId: string, tz: string, campaignId?: string | null) {
  const from = startOfDayTz(new Date(), tz);
  const [r] = await db
    .select({ n: count() })
    .from(outreachEmails)
    .where(and(eq(outreachEmails.workspaceId, workspaceId), eq(outreachEmails.status, "SENT"), gte(outreachEmails.sentAt, from), campaignId ? eq(outreachEmails.campaignId, campaignId) : undefined));
  return Number(r.n);
}

export type SendResult = { ok: true } | { ok: false; error: string; fatal?: boolean };

const SENDING = "__sending__";

export async function sendApprovedEmail(ctx: Ctx & { tz: string }, emailId: string): Promise<SendResult> {
  const [mail] = await db.select().from(outreachEmails).where(and(eq(outreachEmails.id, emailId), eq(outreachEmails.workspaceId, ctx.workspaceId))).limit(1);
  if (!mail) return { ok: false, error: "Email not found." };
  if (mail.status !== "APPROVED" || !mail.approvedBy) return { ok: false, error: "This email has not been approved by a person yet." };

  const e = ctx.settings.email;
  const smtp = await getWorkspaceSmtp(ctx.workspaceId);
  if (!smtp) return { ok: false, fatal: true, error: "Email sending is not set up. Add your SMTP details in Integrations first." };
  if (!e.physicalAddress?.trim()) return { ok: false, fatal: true, error: "Add your business postal address in Settings → Email before sending (required in every outreach email)." };
  const fromEmail = e.fromEmail?.trim() || smtp.user;

  const [target] = await db.select({ optOut: leads.emailOptOut }).from(leads).where(eq(leads.id, mail.leadId)).limit(1);
  if (target?.optOut || (await isSuppressed(ctx.workspaceId, mail.toEmail))) {
    await db.update(outreachEmails).set({ status: "REJECTED", error: "Recipient is unsubscribed or marked do-not-email." }).where(eq(outreachEmails.id, mail.id));
    return { ok: false, error: "Recipient has unsubscribed or is marked do-not-email — email cancelled." };
  }
  if ((await sentToday(ctx.workspaceId, ctx.tz)) >= e.dailyLimit) return { ok: false, fatal: true, error: `Daily limit of ${e.dailyLimit} emails reached. Remaining approved emails will go out tomorrow.` };
  if (mail.campaignId) {
    const [c] = await db.select({ lim: campaigns.dailySendLimit, status: campaigns.status }).from(campaigns).where(eq(campaigns.id, mail.campaignId)).limit(1);
    if (c && c.status === "PAUSED") return { ok: false, error: "The campaign is paused." };
    if (c && (await sentToday(ctx.workspaceId, ctx.tz, mail.campaignId)) >= c.lim) return { ok: false, error: `This campaign's daily limit of ${c.lim} has been reached.` };
  }

  // Claim the email so two clicks / two workers can never send it twice.
  const claimed = await db
    .update(outreachEmails)
    .set({ error: SENDING })
    .where(and(eq(outreachEmails.id, mail.id), eq(outreachEmails.status, "APPROVED"), sql`(${outreachEmails.error} is null or ${outreachEmails.error} <> ${SENDING})`))
    .returning({ id: outreachEmails.id });
  if (!claimed.length) return { ok: false, error: "This email is already being sent." };

  const unsubUrl = `${appUrl()}/unsubscribe/${makeUnsubscribeToken(ctx.workspaceId, mail.toEmail)}`;
  const text = `${mail.body}\n\n${buildFooter(ctx.settings, unsubUrl)}`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#111">${escapeHtml(mail.body).replace(/\n/g, "<br>")}<hr style="border:none;border-top:1px solid #ddd;margin:20px 0"><div style="font-size:12px;color:#666">${escapeHtml(e.signature ?? "").replace(/\n/g, "<br>")}${e.signature ? "<br>" : ""}${escapeHtml(e.unsubscribeFooter?.trim() || "If you do not want to receive emails from us, you can")} <a href="${unsubUrl}">unsubscribe</a>.<br>${escapeHtml(e.physicalAddress).replace(/\n/g, "<br>")}</div></div>`;

  try {
    const sent = await sendWorkspaceMail(smtp, {
      from: e.fromName ? `"${e.fromName.replace(/"/g, "")}" <${fromEmail}>` : fromEmail,
      replyTo: e.replyTo || undefined,
      to: mail.toEmail,
      subject: mail.subject,
      text,
      html,
      headers: { "List-Unsubscribe": `<${unsubUrl}>` },
    });
    await db.update(outreachEmails).set({ status: "SENT", sentAt: new Date(), messageId: sent.messageId, error: null }).where(eq(outreachEmails.id, mail.id));
    await addActivity(ctx, mail.leadId, "EMAIL_SENT", `Email sent: “${mail.subject}”.`, { emailId: mail.id });
    const [lead] = await db.select({ status: leads.status }).from(leads).where(eq(leads.id, mail.leadId));
    if (lead && ["NEW", "RESEARCHING", "QUALIFIED"].includes(lead.status)) await changeStatus(ctx, mail.leadId, "CONTACTED", "email sent");
    await logAudit({ workspaceId: ctx.workspaceId, userId: ctx.userId, action: "EMAIL_SENT", entity: "outreach_email", entityId: mail.id });
    return { ok: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown sending error";
    await db.update(outreachEmails).set({ status: "FAILED", error: msg.slice(0, 500) }).where(eq(outreachEmails.id, mail.id));
    return { ok: false, error: `Could not send: ${msg}` };
  }
}

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Sends every approved email (oldest first) until the daily limit is hit. Used by the "Send approved" button and the cron tick. */
export async function sendAllApproved(ctx: Ctx & { tz: string }, max = 50) {
  const rows = await db
    .select({ id: outreachEmails.id })
    .from(outreachEmails)
    .where(and(eq(outreachEmails.workspaceId, ctx.workspaceId), eq(outreachEmails.status, "APPROVED")))
    .orderBy(outreachEmails.approvedAt)
    .limit(max);
  let sent = 0;
  const errors: string[] = [];
  for (const r of rows) {
    const res = await sendApprovedEmail(ctx, r.id);
    if (res.ok) sent++;
    else {
      errors.push(res.error);
      if (res.fatal) break;
    }
  }
  return { sent, errors, attempted: rows.length };
}
