import nodemailer from "nodemailer";
import { and, eq } from "drizzle-orm";
import { db, integrations } from "@/db";
import { decrypt } from "./crypto";

type Mail = { to: string; subject: string; text: string; html?: string; headers?: Record<string, string> };

/** System emails (verification, password reset). Falls back to console output when SMTP is not configured. */
export async function sendSystemMail(mail: Mail): Promise<{ delivered: boolean; devMode: boolean }> {
  const host = process.env.SMTP_HOST;
  if (!host) {
    console.log(`\n[DEV MAIL — no SMTP configured]\nTo: ${mail.to}\nSubject: ${mail.subject}\n\n${mail.text}\n`);
    return { delivered: false, devMode: true };
  }
  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: Number(process.env.SMTP_PORT ?? 587) === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
  });
  await transport.sendMail({ from: process.env.SMTP_FROM ?? process.env.SMTP_USER, ...mail });
  return { delivered: true, devMode: false };
}

export type WorkspaceSmtp = {
  host: string;
  port: number;
  user: string;
  pass: string;
};

/** Returns the workspace's own SMTP settings (decrypted), or null when not configured. */
export async function getWorkspaceSmtp(workspaceId: string): Promise<WorkspaceSmtp | null> {
  const [row] = await db
    .select()
    .from(integrations)
    .where(and(eq(integrations.workspaceId, workspaceId), eq(integrations.provider, "SMTP")))
    .limit(1);
  if (!row || row.status !== "CONFIGURED" || !row.secretEnc || !row.config.host || !row.config.user) return null;
  return {
    host: row.config.host,
    port: Number(row.config.port || 587),
    user: row.config.user,
    pass: decrypt(row.secretEnc),
  };
}

export async function sendWorkspaceMail(
  smtp: WorkspaceSmtp,
  mail: Mail & { from: string; replyTo?: string }
): Promise<{ messageId: string }> {
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });
  const info = await transport.sendMail(mail);
  return { messageId: String(info.messageId ?? "") };
}

export async function verifySmtp(smtp: WorkspaceSmtp): Promise<{ ok: boolean; error?: string }> {
  try {
    const transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass },
    });
    await transport.verify();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
