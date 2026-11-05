"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PasswordInput } from "@/components/password-input";

export function ResetForm({ token }: { token: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirmPassword")) return setError("Passwords do not match.");
    setBusy(true);
    const res = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: f.get("password"), confirmPassword: f.get("confirmPassword") }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Could not reset the password.");
    router.push("/login?reset=1");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{error}</div>}
      <label className="block">
        <span className="label">New password</span>
        <PasswordInput name="password" required minLength={10} autoComplete="new-password" />
      </label>
      <label className="block">
        <span className="label">Confirm new password</span>
        <PasswordInput name="confirmPassword" required autoComplete="new-password" />
      </label>
      <p className="text-xs text-navy-400">At least 10 characters with an uppercase letter, a lowercase letter and a number.</p>
      <button className="btn-primary w-full py-2.5" disabled={busy}>
        {busy ? "Saving…" : "Update password"}
      </button>
    </form>
  );
}
