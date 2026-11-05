import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ size = 28, dark = false }: { size?: number; dark?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
        <defs>
          <linearGradient id="lg-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4a7dff" />
            <stop offset="1" stopColor="#8b5cf6" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill="url(#lg-grad)" />
        <path d="M9 22V10h3v9h6v3H9Zm11-12h3v12h-3V10Z" fill="#fff" />
      </svg>
      <span className={cn("text-[15px] font-bold tracking-tight", dark ? "text-white" : "text-navy-900")}>
        LinkGenius <span className="text-violet-500">AI</span>
      </span>
    </span>
  );
}

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("card", className)}>{children}</section>;
}

export function CardHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-navy-100 px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-navy-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-xs text-navy-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-navy-900">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-navy-500">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({ tone = "bg-slate-100 text-slate-700", children }: { tone?: string; children: React.ReactNode }) {
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-semibold", tone)}>{children}</span>;
}

export function LinkButton({
  href,
  variant = "secondary",
  size,
  children,
  className,
}: {
  href: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm";
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <Link href={href} className={cn(`btn-${variant}`, size === "sm" && "btn-sm", className)}>
      {children}
    </Link>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-navy-400">{hint}</span>}
    </label>
  );
}

export function Flash({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  return (
    <div
      role="status"
      className={cn(
        "mb-5 rounded-xl border px-4 py-3 text-sm",
        err ? "border-rose-200 bg-rose-50 text-rose-800" : "border-emerald-200 bg-emerald-50 text-emerald-800"
      )}
    >
      {err ?? ok}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 h-10 w-10 rounded-full bg-gradient-to-br from-brand-100 to-violet-400/30" />
      <p className="text-sm font-semibold text-navy-800">{title}</p>
      {body && <p className="mt-1 max-w-md text-sm text-navy-500">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  change,
  previous,
  hint,
  invert = false,
}: {
  label: string;
  value: string;
  change?: number | null;
  previous?: string;
  hint?: string;
  invert?: boolean; // when lower is better
}) {
  const up = (change ?? 0) > 0;
  const down = (change ?? 0) < 0;
  const good = invert ? down : up;
  const bad = invert ? up : down;
  return (
    <div className="card p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">{label}</p>
      <p className="mt-2 text-2xl font-bold tracking-tight text-navy-900">{value}</p>
      <div className="mt-2 flex items-center gap-2 text-xs">
        {change === undefined ? null : change === null ? (
          <span className="text-navy-400">New this period</span>
        ) : (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold",
              good && "bg-emerald-50 text-emerald-700",
              bad && "bg-rose-50 text-rose-700",
              !good && !bad && "bg-slate-100 text-slate-600"
            )}
          >
            {up ? <ArrowUpRight size={12} /> : down ? <ArrowDownRight size={12} /> : <Minus size={12} />}
            {Math.abs(change).toFixed(1)}%
          </span>
        )}
        {previous !== undefined && <span className="text-navy-400">vs {previous} before</span>}
        {hint && <span className="text-navy-400">{hint}</span>}
      </div>
    </div>
  );
}

export function ProgressBar({ pct, tone }: { pct: number; tone?: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  const color = tone ?? (pct > 100 ? "bg-emerald-500" : pct >= 80 ? "bg-brand-500" : pct >= 50 ? "bg-amber-500" : "bg-rose-500");
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-navy-100">
      <div className={cn("h-full rounded-full transition-all", color)} style={{ width: `${clamped}%` }} />
    </div>
  );
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-violet-500 font-semibold text-white"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials || "?"}
    </span>
  );
}

export function Pagination({
  page,
  pages,
  makeHref,
}: {
  page: number;
  pages: number;
  makeHref: (page: number) => string;
}) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between border-t border-navy-100 px-4 py-3 text-sm text-navy-500">
      <span>
        Page {page} of {pages}
      </span>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link className="btn-secondary btn-sm" href={makeHref(page - 1)}>
            Previous
          </Link>
        ) : null}
        {page < pages ? (
          <Link className="btn-secondary btn-sm" href={makeHref(page + 1)}>
            Next
          </Link>
        ) : null}
      </div>
    </div>
  );
}
