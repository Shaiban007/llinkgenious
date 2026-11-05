"use server";

import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { db, emailSuppressions, leadActivities, leads } from "@/db";
import { parseUnsubscribeToken } from "@/lib/outreach";
import { rateLimit } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { clientIp } from "@/lib/rate-limit";

/** Public (no login). The token is signed, so only the real recipient's link works. */
export async function unsubscribeAction(fd: FormData) {
  const token = String(fd.get("token") ?? "");
  const lim = await rateLimit(`unsub:${clientIp(headers())}`, 30, 3600);
  const t = lim.ok ? parseUnsubscribeToken(token) : null;
  if (!t) redirect(`/unsubscribe/${encodeURIComponent(token)}?bad=1`);
  await db.insert(emailSuppressions).values({ workspaceId: t.workspaceId, email: t.email, reason: "UNSUBSCRIBED" }).onConflictDoNothing();
  const affected = await db.update(leads).set({ emailOptOut: true }).where(and(eq(leads.workspaceId, t.workspaceId), sql`lower(${leads.email}) = ${t.email}`)).returning({ id: leads.id });
  for (const l of affected) await db.insert(leadActivities).values({ leadId: l.id, workspaceId: t.workspaceId, type: "UPDATED", summary: "Recipient unsubscribed from emails." });
  redirect(`/unsubscribe/${encodeURIComponent(token)}?done=1`);
}
