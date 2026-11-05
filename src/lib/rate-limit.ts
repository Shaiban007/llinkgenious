import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Simple database-backed rate limiter (works on serverless hosts like Vercel).
 * Example: rateLimit("login:me@x.com", 10, 900) allows 10 tries per 15 minutes.
 */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const rows = await db.execute<{ count: number; reset_at: Date }>(sql`
    insert into rate_limits (key, count, reset_at)
    values (${key}, 1, now() + (${windowSeconds} || ' seconds')::interval)
    on conflict (key) do update set
      count = case when rate_limits.reset_at < now() then 1 else rate_limits.count + 1 end,
      reset_at = case when rate_limits.reset_at < now() then excluded.reset_at else rate_limits.reset_at end
    returning count, reset_at
  `);
  const row = rows[0];
  const count = Number(row.count);
  const resetAt = new Date(row.reset_at);
  return {
    ok: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(0, Math.ceil((resetAt.getTime() - Date.now()) / 1000)),
  };
}

export async function clearRateLimit(key: string) {
  await db.execute(sql`delete from rate_limits where key = ${key}`);
}

export function clientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown";
}
