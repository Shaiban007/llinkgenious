import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db, outreachEmails, workspaces } from "@/db";
import { safeEqual } from "@/lib/crypto";
import { getSettings } from "@/lib/workspace-settings";
import { runReminders } from "@/lib/reminders";
import { sendAllApproved } from "@/lib/outreach";
import { logError } from "@/lib/audit";
import { and, sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

/**
 * Call this every 5–15 minutes from any scheduler (cron-job.org, Vercel Cron, Windows Task Scheduler…):
 *   curl -X POST -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-app/api/cron/tick
 * It creates reminder notifications and sends emails that a person has ALREADY approved (within daily limits).
 */
async function tick(req: Request) {
  const secret = process.env.CRON_SECRET;
  const given = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "") || req.headers.get("x-cron-secret") || "";
  if (!secret || !safeEqual(secret, given)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const all = await db.select().from(workspaces);
  const out: { workspace: string; reminders: number; emailsSent: number }[] = [];
  for (const ws of all) {
    try {
      const settings = getSettings(ws.settings);
      const r = await runReminders(ws.id, settings);
      let sent = 0;
      const [next] = await db
        .select({ approvedBy: outreachEmails.approvedBy })
        .from(outreachEmails)
        .where(and(eq(outreachEmails.workspaceId, ws.id), eq(outreachEmails.status, "APPROVED"), sql`${outreachEmails.approvedBy} is not null`))
        .limit(1);
      if (next?.approvedBy) {
        const res = await sendAllApproved({ workspaceId: ws.id, userId: next.approvedBy, settings, tz: ws.timezone }, 25);
        sent = res.sent;
      }
      out.push({ workspace: ws.name, reminders: r.created, emailsSent: sent });
    } catch (e) {
      await logError(e, "/api/cron/tick");
    }
  }
  return NextResponse.json({ ok: true, ran: out.length, results: out });
}

export const POST = tick;
export const GET = tick;
