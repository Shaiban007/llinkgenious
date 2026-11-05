import type { NextAuthOptions } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq, sql } from "drizzle-orm";
import { db, users } from "@/db";
import { verifyPassword } from "./password";
import { clearRateLimit, clientIp, rateLimit } from "./rate-limit";
import { logAudit } from "./audit";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  pages: { signIn: "/login" },
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        remember: { label: "Remember me", type: "text" },
      },
      async authorize(credentials, req) {
        const email = credentials?.email?.trim().toLowerCase();
        const password = credentials?.password ?? "";
        if (!email || !password) throw new Error("Enter your email and password.");

        const headers = new Headers();
        for (const [k, v] of Object.entries(req?.headers ?? {})) if (typeof v === "string") headers.set(k, v);
        const ip = clientIp(headers);

        const byEmail = await rateLimit(`login:email:${email}`, 8, 15 * 60);
        const byIp = await rateLimit(`login:ip:${ip}`, 40, 15 * 60);
        if (!byEmail.ok || !byIp.ok) throw new Error("Too many attempts. Please wait a few minutes and try again.");

        const [user] = await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
        // Same message for unknown email and wrong password, so attackers cannot discover which emails exist.
        if (!user || !(await verifyPassword(password, user.passwordHash))) {
          await logAudit({ userId: user?.id, action: "LOGIN_FAILED", meta: { email } });
          throw new Error("Incorrect email or password.");
        }
        if (!user.isActive) throw new Error("This account has been deactivated. Contact your administrator.");
        if (process.env.REQUIRE_EMAIL_VERIFICATION === "true" && !user.emailVerifiedAt) {
          throw new Error("Please verify your email first. Check your inbox for the verification link.");
        }

        await clearRateLimit(`login:email:${email}`);
        await db.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
        await logAudit({ userId: user.id, action: "LOGIN" });

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          sv: user.sessionVersion,
          remember: credentials?.remember === "true",
        } as never;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.sv = (user as { sv?: number }).sv ?? 1;
        token.remember = Boolean((user as { remember?: boolean }).remember);
        token.loginAt = Date.now();
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid as string;
        session.user.sv = token.sv as number;
        session.user.remember = token.remember as boolean;
        session.user.loginAt = token.loginAt as number;
      }
      return session;
    },
  },
};
