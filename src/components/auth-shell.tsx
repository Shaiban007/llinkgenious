import { Logo } from "./ui";
import { APP_TAGLINE } from "@/lib/constants";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: React.ReactNode; footer?: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-navy-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-violet-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full bg-brand-600/30 blur-3xl" />
        <Logo size={34} dark />
        <div className="relative max-w-md">
          <p className="text-4xl font-bold leading-tight tracking-tight">{APP_TAGLINE}</p>
          <p className="mt-4 text-base text-navy-200">
            Find genuine buyers, score them honestly, follow up on time and see exactly what is working. Every lead stays in your own private workspace.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-navy-100">
            {["Lead scoring that explains itself", "CRM and pipeline in one place", "Email outreach that always waits for your approval"].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="h-1.5 w-1.5 rounded-full bg-violet-400" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-navy-300">© {new Date().getFullYear()} LinkGenius AI</p>
      </aside>
      <main className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-navy-900">{title}</h1>
          {subtitle && <p className="mt-1.5 text-sm text-navy-500">{subtitle}</p>}
          <div className="mt-6">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-navy-500">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
