"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import * as Icons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Avatar, Logo } from "./ui";
import { FlashFromUrl } from "./flash-from-url";
import { NAV } from "@/lib/nav";
import { switchWorkspace } from "@/app/actions/workspace";
import { cn } from "@/lib/utils";

const ICONS = Icons as unknown as Record<string, LucideIcon>;

export type ShellProps = {
  userName: string;
  userEmail: string;
  emailVerified: boolean;
  isWsAdmin: boolean;
  isPlatformAdmin: boolean;
  workspaceId: string;
  workspaceName: string;
  workspaces: { id: string; name: string }[];
  unread: number;
  children: React.ReactNode;
};

export function AppShell({ userName, userEmail, emailVerified, isWsAdmin, isPlatformAdmin, workspaceId, workspaceName, workspaces, unread, children }: ShellProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [resent, setResent] = useState<string | null>(null);

  async function resend() {
    setResent("Sending…");
    const r = await fetch("/api/auth/resend", { method: "POST" });
    const d = await r.json().catch(() => ({}));
    setResent(r.ok ? (d.devMode ? "Email service is not set up yet — the link was printed in the server log." : "Verification email sent.") : (d.error ?? "Could not send."));
  }

  const groups = NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.adminOnly || isWsAdmin) }));
  const active = (href: string) => pathname === href || pathname.startsWith(href + "/");

  const sidebar = (
    <nav aria-label="Main" className="flex h-full flex-col overflow-y-auto px-3 pb-6 pt-5">
      <div className="px-2 pb-5">
        <Logo dark />
      </div>
      {groups.map((g) => (
        <div key={g.title} className="mb-4">
          <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-navy-400">{g.title}</p>
          {g.items.map((i) => {
            const Icon = ICONS[i.icon] ?? Icons.Circle;
            return (
              <Link
                key={i.href}
                href={i.href}
                onClick={() => setOpen(false)}
                aria-current={active(i.href) ? "page" : undefined}
                className={cn(
                  "mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition",
                  active(i.href) ? "bg-white/10 text-white" : "text-navy-200 hover:bg-white/5 hover:text-white"
                )}
              >
                <Icon size={16} className={active(i.href) ? "text-brand-400" : "text-navy-300"} />
                {i.label}
                {i.href === "/notifications" && unread > 0 && <span className="ml-auto rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
              </Link>
            );
          })}
        </div>
      ))}
      {isPlatformAdmin && (
        <div className="mb-4">
          <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-widest text-navy-400">Platform</p>
          <Link href="/admin" onClick={() => setOpen(false)} className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium", active("/admin") ? "bg-white/10 text-white" : "text-navy-200 hover:bg-white/5 hover:text-white")}>
            <Icons.ShieldCheck size={16} className="text-navy-300" /> Admin panel
          </Link>
        </div>
      )}
    </nav>
  );

  return (
    <div className="min-h-screen bg-navy-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-navy-900 lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-navy-950/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-navy-900 shadow-xl">{sidebar}</aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-navy-100 bg-white/90 px-4 py-3 backdrop-blur sm:px-6">
          <button className="btn-ghost lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <Icons.Menu size={18} />
          </button>

          <form action={switchWorkspace} className="flex items-center gap-2">
            <Icons.Building2 size={16} className="hidden text-navy-400 sm:block" />
            {workspaces.length > 1 ? (
              <>
                <label className="sr-only" htmlFor="ws">Workspace</label>
                <select id="ws" name="workspaceId" defaultValue={workspaceId} className="input !w-auto max-w-[200px] !py-1.5 font-semibold" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
                  {workspaces.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <span className="max-w-[220px] truncate text-sm font-semibold text-navy-800">{workspaceName}</span>
            )}
          </form>

          <div className="ml-auto flex items-center gap-1">
            <Link href="/notifications" className="btn-ghost relative !px-2.5" aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
              <Icons.Bell size={18} />
              {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-rose-500" />}
            </Link>
            <div className="relative">
              <button className="flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-navy-50" onClick={() => setMenu((v) => !v)} aria-haspopup="menu" aria-expanded={menu}>
                <Avatar name={userName} size={30} />
                <span className="hidden text-left sm:block">
                  <span className="block text-sm font-semibold leading-tight text-navy-900">{userName}</span>
                  <span className="block text-[11px] leading-tight text-navy-400">{isWsAdmin ? "Administrator" : "Team member"}</span>
                </span>
                <Icons.ChevronDown size={14} className="text-navy-400" />
              </button>
              {menu && (
                <div role="menu" className="absolute right-0 mt-2 w-60 rounded-xl border border-navy-100 bg-white p-1.5 shadow-card">
                  <p className="truncate px-3 py-2 text-xs text-navy-400">{userEmail}</p>
                  <Link role="menuitem" href="/settings" onClick={() => setMenu(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-navy-700 hover:bg-navy-50">
                    <Icons.Settings size={14} /> Settings & profile
                  </Link>
                  <button role="menuitem" onClick={() => signOut({ callbackUrl: "/login" })} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-rose-600 hover:bg-rose-50">
                    <Icons.LogOut size={14} /> Log out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {!emailVerified && (
          <div className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 sm:px-6">
            Please confirm your email address.{" "}
            <button onClick={resend} className="font-semibold underline">
              Send me the verification email
            </button>
            {resent && <span className="ml-2 text-amber-700">{resent}</span>}
          </div>
        )}

        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">
          <Suspense>
            <FlashFromUrl />
          </Suspense>
          {children}
        </main>
      </div>
    </div>
  );
}
