import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "./login-form";
import { getSession } from "@/lib/session";

export const metadata = { title: "Log in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: { registered?: string; reset?: string; verified?: string } }) {
  if (await getSession()) redirect("/dashboard");
  const notice = searchParams.reset
    ? "Password updated. Log in with your new password."
    : searchParams.registered
      ? "Account created. Log in to continue."
      : searchParams.verified
        ? "Email verified. You can log in now."
        : "";
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to your LinkGenius AI workspace."
      footer={
        <>
          New here?{" "}
          <Link href="/register" className="font-semibold text-brand-600 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <LoginForm notice={notice} />
    </AuthShell>
  );
}
