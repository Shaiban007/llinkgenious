import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { parseFilters, queryLeads } from "@/lib/lead-query";
import { csvEscape } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const COLS = ["Full name", "Job title", "Email", "Phone", "LinkedIn", "Company", "Website", "Industry", "Company size", "Country", "Location", "Status", "Score", "Priority", "Verification", "Source", "Owner", "Added"] as const;

export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const sp = Object.fromEntries(new URL(req.url).searchParams.entries());
  const scope = sp.scope === "pool" ? "pool" : "crm";
  const f = parseFilters(sp, scope);
  const { rows } = await queryLeads(s.workspace.id, f, s.workspace.settings.scoring, s.user.id, { unpaged: true });
  const lines = [COLS.join(",")];
  for (const { lead: l, assigneeName } of rows) {
    lines.push([l.fullName, l.jobTitle, l.email, l.phone, l.linkedinUrl, l.companyName, l.companyWebsite, l.industry, l.companySize, l.country, l.location, l.status, l.score, l.scoreCategory, l.verification, l.sourceLabel, assigneeName, scope === "crm" ? l.crmAddedAt : l.createdAt].map(csvEscape).join(","));
  }
  await logAudit({ workspaceId: s.workspace.id, userId: s.user.id, action: "EXPORT_LEADS", meta: { rows: rows.length, scope } });
  return new NextResponse("﻿" + lines.join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"` },
  });
}
