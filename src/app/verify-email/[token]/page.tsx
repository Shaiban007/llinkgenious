import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { consumeAuthToken, markEmailVerified } from "@/lib/auth-tokens";
import { logAudit } from "@/lib/audit";

export const metadata = { title: "Verify email" };
export const dynamic = "force-dynamic";

export default async function VerifyPage({ params }: { params: { token: string } }) {
  const userId = await consumeAuthToken("VERIFY_EMAIL", params.token);
  if (userId) {
    await markEmailVerified(userId);
    await logAudit({ userId, action: "EMAIL_VERIFIED" });
  }
  return (
    <AuthShell title={userId ? "Email verified" : "Link not valid"}>
      <p className="text-sm text-navy-600">
        {userId ? "Thank you — your email address is confirmed." : "This verification link is invalid or has expired. Log in and request a new one from the banner at the top of the dashboard."}
      </p>
      <Link href="/login?verified=1" className="btn-primary mt-6 inline-flex">
        Go to log in
      </Link>
    </AuthShell>
  );
}
