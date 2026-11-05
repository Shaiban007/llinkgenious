import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function fmtDate(d: Date | string | null | undefined, pattern = "dd MMM yyyy") {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, pattern);
}

export function fmtDateTime(d: Date | string | null | undefined) {
  return fmtDate(d, "dd MMM yyyy, HH:mm");
}

export function fmtNumber(n: number | string | null | undefined, digits = 0) {
  if (n === null || n === undefined || n === "") return "—";
  const v = typeof n === "string" ? Number(n) : n;
  if (Number.isNaN(v)) return "—";
  return v.toLocaleString("en-IN", { maximumFractionDigits: digits });
}

export function fmtMoney(n: number | string | null | undefined, currency = "USD") {
  if (n === null || n === undefined || n === "") return "—";
  const v = typeof n === "string" ? Number(n) : n;
  if (Number.isNaN(v)) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
}

export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export function splitName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0] ?? "", lastName: parts.slice(1).join(" ") };
}

export function domainFromUrl(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.startsWith("http") ? url : `https://${url}`);
    return u.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function normalizeLinkedin(url?: string | null): string | null {
  if (!url) return null;
  const t = url.trim().toLowerCase().replace(/\/+$/, "").replace(/^https?:\/\/(www\.)?/, "");
  return t || null;
}

export function str(v: FormDataEntryValue | null | undefined): string {
  return typeof v === "string" ? v.trim() : "";
}

export function strOrNull(v: FormDataEntryValue | null | undefined): string | null {
  const s = str(v);
  return s ? s : null;
}

/* ───────────── date ranges (timezone aware, no extra library) ───────────── */
function tzOffsetMs(date: Date, tz: string) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const p: Record<string, string> = {};
  for (const part of dtf.formatToParts(date)) p[part.type] = part.value;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  // Compare at whole-second precision: Intl drops milliseconds, which would otherwise leak into the offset.
  return asUTC - Math.floor(date.getTime() / 1000) * 1000;
}

export function startOfDayTz(date: Date, tz: string) {
  const off = tzOffsetMs(date, tz);
  const local = new Date(date.getTime() + off);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - off);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86400000);
}

export function startOfMonthTz(date: Date, tz: string) {
  const off = tzOffsetMs(date, tz);
  const local = new Date(date.getTime() + off);
  local.setUTCDate(1);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() - off);
}

export type DateRange = { key: string; label: string; from: Date; to: Date };

export function resolveRange(
  params: { range?: string; from?: string; to?: string },
  tz = "Asia/Kolkata",
  now = new Date()
): DateRange {
  const key = params.range ?? "30d";
  const today = startOfDayTz(now, tz);
  const tomorrow = addDays(today, 1);
  switch (key) {
    case "today":
      return { key, label: "Today", from: today, to: tomorrow };
    case "7d":
      return { key, label: "Last 7 days", from: addDays(today, -6), to: tomorrow };
    case "90d":
      return { key, label: "Last 90 days", from: addDays(today, -89), to: tomorrow };
    case "custom": {
      const f = params.from ? new Date(params.from + "T00:00:00Z") : null;
      const t = params.to ? new Date(params.to + "T00:00:00Z") : null;
      if (f && t && !Number.isNaN(f.getTime()) && !Number.isNaN(t.getTime()) && f <= t) {
        const from = new Date(f.getTime() - tzOffsetMs(f, tz));
        const to = addDays(new Date(t.getTime() - tzOffsetMs(t, tz)), 1);
        return { key, label: `${params.from} → ${params.to}`, from, to };
      }
      return { key: "30d", label: "Last 30 days", from: addDays(today, -29), to: tomorrow };
    }
    default:
      return { key: "30d", label: "Last 30 days", from: addDays(today, -29), to: tomorrow };
  }
}

export function previousRange(r: DateRange): { from: Date; to: Date } {
  const span = r.to.getTime() - r.from.getTime();
  return { from: new Date(r.from.getTime() - span), to: new Date(r.from.getTime()) };
}

export function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : String(v);
  // Neutralise spreadsheet formula injection (=, +, -, @ at the start of a cell).
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
