import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { sendVerificationEmail } from "@/lib/auth-tokens";
import { rateLimit } from "@/lib/rate-limit";

export async function POST() {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Please log in first." }, { status: 401 });
  if (s.user.emailVerified) return NextResponse.json({ ok: true, alreadyVerified: true });
  const limited = await rateLimit(`resend:${s.user.id}`, 3, 3600);
  if (!limited.ok) return NextResponse.json({ error: "Please wait before requesting another email." }, { status: 429 });
  const mail = await sendVerificationEmail({ id: s.user.id, name: s.user.name, email: s.user.email });
  return NextResponse.json({ ok: true, devMode: mail.devMode });
}
