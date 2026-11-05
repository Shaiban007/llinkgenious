import { NextResponse } from "next/server";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db, users } from "@/db";
import { consumeAuthToken } from "@/lib/auth-tokens";
import { hashPassword, passwordSchema } from "@/lib/password";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { logAudit, logError } from "@/lib/audit";

const schema = z
  .object({ token: z.string().min(20), password: passwordSchema, confirmPassword: z.string() })
  .refine((d) => d.password === d.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

export async function POST(req: Request) {
  try {
    const limited = await rateLimit(`reset:${clientIp(req.headers)}`, 10, 3600);
    if (!limited.ok) return NextResponse.json({ error: "Too many attempts. Try again later." }, { status: 429 });
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });

    const userId = await consumeAuthToken("RESET_PASSWORD", parsed.data.token);
    if (!userId) return NextResponse.json({ error: "This reset link is invalid or has expired. Request a new one." }, { status: 400 });

    // sessionVersion + 1 signs the user out everywhere
    await db
      .update(users)
      .set({ passwordHash: await hashPassword(parsed.data.password), sessionVersion: sql`${users.sessionVersion} + 1` })
      .where(eq(users.id, userId));
    await logAudit({ userId, action: "PASSWORD_RESET_COMPLETED" });
    return NextResponse.json({ ok: true });
  } catch (e) {
    await logError(e, "/api/auth/reset");
    return NextResponse.json({ error: "Could not reset the password. Please try again." }, { status: 500 });
  }
}
