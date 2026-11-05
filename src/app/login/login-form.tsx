"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { PasswordInput } from "@/components/password-input";

export function LoginForm({ notice }: { notice?: string }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const res = await signIn("credentials", {
      redirect: false,
      email: String(f.get("email") ?? ""),
      password: String(f.get("password") ?? ""),
      remember: f.get("remember") ? "true" : "false",
    });
    setBusy(false);
    if (res?.error) {
      setError(res.error === "CredentialsSignin" ? "Incorrect email or password." : res.error);
      return;
    }
    window.location.href = "/dashboard";
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {notice && <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{notice}</div>}
      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}
      <label className="block">
        <span className="label">Email address</span>
        <input name="email" type="email" required autoComplete="email" className="input" placeholder="you@company.com" />
      </label>
      <label className="block">
        <span className="label">Password</span>
        <PasswordInput name="password" required autoComplete="current-password" placeholder="Your password" />
      </label>
      <div className="flex items-center justify-between text-sm">
        <label className="flex items-center gap-2 text-navy-600">
          <input type="checkbox" name="remember" defaultChecked className="h-4 w-4 rounded border-navy-300" />
          Remember me
        </label>
        <Link href="/forgot-password" className="font-semibold text-brand-600 hover:underline">
          Forgot password?
        </Link>
      </div>
      <button className="btn-primary w-full py-2.5" disabled={busy}>
        {busy ? "Logging in…" : "Log in"}
      </button>
    </form>
  );
}
