"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PasswordInput } from "@/components/password-input";
import { COUNTRIES, INDUSTRIES } from "@/lib/constants";

export function RegisterForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [field, setField] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setField("");
    const f = new FormData(e.currentTarget);
    const body = Object.fromEntries(f.entries());
    if (body.password !== body.confirmPassword) {
      setField("confirmPassword");
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Could not create the account.");
      setField(data.field ?? "");
      return;
    }
    router.push("/login?registered=1");
  }

  const ring = (n: string) => (field === n ? "border-rose-400 ring-2 ring-rose-200" : "");

  return (
    <form onSubmit={onSubmit} className="space-y-3.5">
      {error && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}
      <label className="block">
        <span className="label">Full name</span>
        <input name="name" required minLength={2} autoComplete="name" className={`input ${ring("name")}`} />
      </label>
      <label className="block">
        <span className="label">Business email</span>
        <input name="email" type="email" required autoComplete="email" className={`input ${ring("email")}`} />
      </label>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <label className="block">
          <span className="label">Password</span>
          <PasswordInput name="password" required minLength={10} autoComplete="new-password" className={ring("password")} />
        </label>
        <label className="block">
          <span className="label">Confirm password</span>
          <PasswordInput name="confirmPassword" required autoComplete="new-password" className={ring("confirmPassword")} />
        </label>
      </div>
      <p className="-mt-1 text-xs text-navy-400">At least 10 characters with an uppercase letter, a lowercase letter and a number.</p>
      <label className="block">
        <span className="label">Company name</span>
        <input name="company" required className={`input ${ring("company")}`} />
      </label>
      <label className="block">
        <span className="label">Job designation</span>
        <input name="jobTitle" required placeholder="e.g. Managing Director" className={`input ${ring("jobTitle")}`} />
      </label>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <label className="block">
          <span className="label">Industry</span>
          <select name="industry" required defaultValue="" className={`input ${ring("industry")}`}>
            <option value="" disabled>
              Choose…
            </option>
            {INDUSTRIES.map((i) => (
              <option key={i}>{i}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Country</span>
          <select name="country" required defaultValue="" className={`input ${ring("country")}`}>
            <option value="" disabled>
              Choose…
            </option>
            {COUNTRIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      <button className="btn-primary w-full py-2.5" disabled={busy}>
        {busy ? "Creating account…" : "Create account"}
      </button>
      <p className="text-center text-xs text-navy-400">By creating an account you agree to use this platform only for lawful business outreach.</p>
    </form>
  );
}
