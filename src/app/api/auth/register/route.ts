import { NextResponse } from "next/server";
import { z } from "zod";
import { count, sql } from "drizzle-orm";
import { db, users } from "@/db";
import { hashPassword, passwordSchema } from "@/lib/password";
import { createWorkspace } from "@/lib/workspace";
import { sendVerificationEmail } from "@/lib/auth-tokens";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { logAudit, logError } from "@/lib/audit";

const schema = z
  .object({
    name: z.string().trim().min(2, "Enter your full name").max(80),
    email: z.string().trim().toLowerCase().email("Enter a valid email address").max(160),
    password: passwordSchema,
    confirmPassword: z.string(),
    company: z.string().trim().min(2, "Enter your company name").max(120),
    jobTitle: z.string().trim().min(2, "Enter your job designation").max(80),
    industry: z.string().trim().min(2, "Choose an industry").max(80),
    country: z.string().trim().min(2, "Choose a country").max(80),
  })
  .refine((d) => d.password === d.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

export async function POST(req: Request) {
  try {
    const limited = await rateLimit(`register:${clientIp(req.headers)}`, 10, 3600);
    if (!limited.ok) return NextResponse.json({ error: "Too many sign-ups from this network. Try again later." }, { status: 429 });

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json({ error: first.message, field: first.path[0] }, { status: 400 });
    }
    const d = parsed.data;

    const [existing] = await db.select({ id: users.id }).from(users).where(sql`lower(${users.email}) = ${d.email}`).limit(1);
    if (existing) return NextResponse.json({ error: "An account with this email already exists. Try logging in.", field: "email" }, { status: 409 });

    const passwordHash = await hashPassword(d.password);
    const result = await db.transaction(async (tx) => {
      const [{ value: total }] = await tx.select({ value: count() }).from(users);
      const [user] = await tx
        .insert(users)
        .values({
          name: d.name,
          email: d.email,
          passwordHash,
          jobTitle: d.jobTitle,
          industry: d.industry,
          country: d.country,
          role: Number(total) === 0 ? "ADMIN" : "USER", // the very first account becomes the platform administrator
        })
        .returning();
      const ws = await createWorkspace(tx, { name: d.company, companyName: d.company, industry: d.industry, ownerId: user.id });
      return { user, ws };
    });

    await logAudit({ workspaceId: result.ws.id, userId: result.user.id, action: "REGISTER", entity: "user", entityId: result.user.id });
    const mail = await sendVerificationEmail(result.user).catch((e) => {
      void logError(e, "/api/auth/register");
      return { delivered: false, devMode: false };
    });
    return NextResponse.json({ ok: true, emailDelivered: mail.delivered, devMode: mail.devMode });
  } catch (e) {
    await logError(e, "/api/auth/register");
    return NextResponse.json({ error: "Something went wrong creating your account. Please try again." }, { status: 500 });
  }
}
