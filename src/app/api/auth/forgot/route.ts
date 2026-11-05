import { NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db, users } from "@/db";
import { sendResetEmail } from "@/lib/auth-tokens";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { logAudit, logError } from "@/lib/audit";

const schema = z.object({ email: z.string().trim().toLowerCase().email() });

export async function POST(req: Request) {
  // Always answer the same way so nobody can use this form to discover which emails have accounts.
  const generic = NextResponse.json({ ok: true });
  try {
    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    const limited = await rateLimit(`forgot:${clientIp(req.headers)}:${parsed.data.email}`, 5, 3600);
    if (!limited.ok) return generic;
    const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${parsed.data.email}`).limit(1);
    if (user && user.isActive) {
      await sendResetEmail(user);
      await logAudit({ userId: user.id, action: "PASSWORD_RESET_REQUESTED" });
    }
    return generic;
  } catch (e) {
    await logError(e, "/api/auth/forgot");
    return generic;
  }
}
