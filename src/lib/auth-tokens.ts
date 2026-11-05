import { and, eq, gt, isNull } from "drizzle-orm";
import { db, authTokens, users } from "@/db";
import { randomToken, sha256 } from "./crypto";
import { sendSystemMail } from "./mailer";

export type TokenType = "VERIFY_EMAIL" | "RESET_PASSWORD";

export async function createAuthToken(userId: string, type: TokenType, ttlMinutes: number) {
  const raw = randomToken(32);
  await db.insert(authTokens).values({
    userId,
    type,
    tokenHash: sha256(raw),
    expiresAt: new Date(Date.now() + ttlMinutes * 60000),
  });
  return raw;
}

/** Marks a token as used and returns its user id — or null when the token is wrong, used or expired. */
export async function consumeAuthToken(type: TokenType, raw: string): Promise<string | null> {
  const [row] = await db
    .select()
    .from(authTokens)
    .where(and(eq(authTokens.tokenHash, sha256(raw)), eq(authTokens.type, type), isNull(authTokens.usedAt), gt(authTokens.expiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  await db.update(authTokens).set({ usedAt: new Date() }).where(eq(authTokens.id, row.id));
  return row.userId;
}

export function appUrl() {
  return (process.env.NEXTAUTH_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export async function sendVerificationEmail(user: { id: string; name: string; email: string }) {
  const token = await createAuthToken(user.id, "VERIFY_EMAIL", 60 * 24);
  const link = `${appUrl()}/verify-email/${token}`;
  return sendSystemMail({
    to: user.email,
    subject: "Verify your email — LinkGenius AI",
    text: `Hi ${user.name},\n\nPlease confirm your email address by opening this link (valid for 24 hours):\n${link}\n\nIf you did not create this account you can ignore this message.`,
  });
}

export async function sendResetEmail(user: { id: string; name: string; email: string }) {
  const token = await createAuthToken(user.id, "RESET_PASSWORD", 60);
  const link = `${appUrl()}/reset-password/${token}`;
  return sendSystemMail({
    to: user.email,
    subject: "Reset your password — LinkGenius AI",
    text: `Hi ${user.name},\n\nUse this link to choose a new password (valid for 1 hour):\n${link}\n\nIf you did not ask for this, ignore this message — your password stays the same.`,
  });
}

export async function markEmailVerified(userId: string) {
  await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, userId));
}
