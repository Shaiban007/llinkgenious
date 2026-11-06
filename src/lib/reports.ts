/** Builds report datasets from real records, then renders them as CSV, Excel or PDF. */
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { campaigns, db, leads, outreachEmails, users } from "@/db";
import type { AppSession } from "./session";
import { csvEscape, fmtDate, resolveRange } from "./utils";
import { STATUS_LABEL, PIPELINE_COLUMNS } from "./constants";
import { kpiScore, kraScore, listMembers, loadKpiRows, loadKraRows, overallScore, resolvePeriod } from "./performance";
import { fmtKpi } from "./format";
import { KPI_BY_KEY } from "./kpi-catalog";

export type Cell = string | number | null;
export type Dataset = { title: string; subtitle: string; columns: string[]; rows: Cell[][] };

export const REPORT_TYPES = [
  { key: "leads", label: "Lead list", desc: "Every CRM lead added in the period, with score, status and owner.", range: "dates" },
  { key: "pipeline", label: "Pipeline summary", desc: "How many leads sit in each stage right now, with deal values.", range: "none" },
  { key: "kpi", label: "KPI report", desc: "Every KPI with actual, target and achievement.", range: "period" },
  { key: "kra", label: "KRA report", desc: "Each person’s key result areas with achievement and review notes.", range: "which" },
  { key: "performance", label: "Employee performance", desc: "Activity, KPI score, KRA score and overall rating per person.", range: "period" },
  { key: "campaigns", label: "Campaign report", desc: "Leads, drafts, approvals and sent emails per campaign.", range: "none" },
  { key: "emails", label: "Email log", desc: "Every outreach email created in the period with its status.", range: "dates" },
] as const;
export type ReportKey = (typeof REPORT_TYPES)[number]["key"];

const tzDate = (d: Date | null | undefined, s: AppSession) => (d ? new Intl.DateTimeFormat("en-GB", { timeZone: s.workspace.timezone, dateStyle: "medium" }).format(d) : null);

export async function buildReport(key: ReportKey, s: AppSession, q: Record<string, string>): Promise<Dataset> {
  const ws = s.workspace.id;
  const sc = s.workspace.settings.scoring;
  const company = s.workspace.name;

  if (key === "leads" || key === "emails") {
    const range = resolveRange({ range: q.range === "7d" || q.range === "90d" || q.range === "custom" ? q.range : q.range ?? "30d", from: q.from, to: q.to }, s.workspace.timezone);
    const sub = `${company} · ${range.label} (${fmtDate(range.from)} – ${fmtDate(new Date(range.to.getTime() - 1))})`;
    if (key === "leads") {
      const rows = await db
        .select({ l: leads, owner: users.name })
        .from(leads)
        .leftJoin(users, eq(users.id, leads.assignedTo))
        .where(and(eq(leads.workspaceId, ws), sql`${leads.archivedAt} is null`, eq(leads.inCrm, true), gte(leads.crmAddedAt, range.from), lt(leads.crmAddedAt, range.to)))
        .orderBy(desc(leads.crmAddedAt))
        .limit(20000);
      return {
        title: "Lead list",
        subtitle: sub,
        columns: ["Name", "Job title", "Company", "Country", "Industry", "Email", "Phone", "Status", "Score", "Priority", "Verification", "Source", "Owner", "Added"],
        rows: rows.map(({ l, owner }) => [l.fullName, l.jobTitle, l.companyName, l.country, l.industry, l.email, l.phone, STATUS_LABEL[l.status], l.score, l.scoreCategory, l.verification, l.sourceLabel, owner, tzDate(l.crmAddedAt, s)]),
      };
    }
    const rows = await db
      .select({ m: outreachEmails, lead: leads.fullName, by: users.name })
      .from(outreachEmails)
      .innerJoin(leads, eq(leads.id, outreachEmails.leadId))
      .leftJoin(users, eq(users.id, outreachEmails.approvedBy))
      .where(and(eq(outreachEmails.workspaceId, ws), gte(outreachEmails.createdAt, range.from), lt(outreachEmails.createdAt, range.to)))
      .orderBy(desc(outreachEmails.createdAt))
      .limit(20000);
    return { title: "Email log", subtitle: sub, columns: ["Lead", "To", "Subject", "Status", "Approved by", "Created", "Sent", "Error"], rows: rows.map(({ m, lead, by }) => [lead, m.toEmail, m.subject, m.status, by, tzDate(m.createdAt, s), tzDate(m.sentAt, s), m.error === "__sending__" ? null : m.error]) };
  }

  if (key === "pipeline") {
    const rows = await db
      .select({ status: leads.status, n: sql<number>`count(*)`, v: sql<string>`coalesce(sum(${leads.dealValue}), 0)`, cur: leads.dealCurrency })
      .from(leads)
      .where(and(eq(leads.workspaceId, ws), sql`${leads.archivedAt} is null`, eq(leads.inCrm, true)))
      .groupBy(leads.status, leads.dealCurrency);
    const out: Cell[][] = [];
    for (const col of PIPELINE_COLUMNS) for (const st of col.statuses) {
      const mine = rows.filter((r) => r.status === st);
      const total = mine.reduce((a, r) => a + Number(r.n), 0);
      out.push([col.label, STATUS_LABEL[st], total, mine.filter((r) => Number(r.v) > 0).map((r) => `${Number(r.v).toLocaleString("en-US")} ${r.cur ?? ""}`.trim()).join(" + ") || null]);
    }
    return { title: "Pipeline summary", subtitle: `${company} · as of ${tzDate(new Date(), s)}`, columns: ["Pipeline column", "Status", "Leads", "Deal value"], rows: out };
  }

  if (key === "campaigns") {
    const rows = await db
      .select({
        c: campaigns,
        leadCount: sql<number>`(select count(*) from campaign_leads cl where cl.campaign_id = ${campaigns.id})`,
        draft: sql<number>`(select count(*) from outreach_emails e where e.campaign_id = ${campaigns.id} and e.status = 'DRAFT')`,
        approved: sql<number>`(select count(*) from outreach_emails e where e.campaign_id = ${campaigns.id} and e.status = 'APPROVED')`,
        sent: sql<number>`(select count(*) from outreach_emails e where e.campaign_id = ${campaigns.id} and e.status = 'SENT')`,
        failed: sql<number>`(select count(*) from outreach_emails e where e.campaign_id = ${campaigns.id} and e.status in ('FAILED','REJECTED'))`,
      })
      .from(campaigns)
      .where(eq(campaigns.workspaceId, ws))
      .orderBy(desc(campaigns.createdAt));
    return { title: "Campaign report", subtitle: `${company} · as of ${tzDate(new Date(), s)}`, columns: ["Campaign", "Status", "Leads", "Drafts", "Approved", "Sent", "Failed / rejected", "Created"], rows: rows.map((r) => [r.c.name, r.c.status, Number(r.leadCount), Number(r.draft), Number(r.approved), Number(r.sent), Number(r.failed), tzDate(r.c.createdAt, s)]) };
  }

  // performance-family reports: members only ever get their own rows
  const members = await listMembers(ws);
  const visible = s.isWsAdmin ? members : members.filter((m) => m.id === s.user.id);
  if (key === "kpi") {
    const period = resolvePeriod(q.period ?? "this_month", s.workspace.timezone);
    const userId = s.isWsAdmin ? (members.some((m) => m.id === q.who) ? q.who : null) : s.user.id;
    const { rows } = await loadKpiRows({ workspaceId: ws, userId, period, scoring: sc, teamSize: members.length });
    const who = userId ? members.find((m) => m.id === userId)?.name : "Whole team";
    return { title: "KPI report", subtitle: `${company} · ${who} · ${period.label} (${fmtDate(period.from)} – ${fmtDate(new Date(period.to.getTime() - 1))})`, columns: ["Category", "KPI", "Actual", "Target", "Achievement %", "Status"], rows: rows.map((r) => [r.def.category, r.def.name, fmtKpi(r.def, r.actual), r.target === null ? "not set" : fmtKpi(r.def, r.target), r.pct === null ? null : Math.round(r.pct), r.status]) };
  }
  if (key === "kra") {
    const which = q.which === "previous" ? "previous" : "current";
    const rows = await loadKraRows({ workspaceId: ws, userId: s.isWsAdmin ? null : s.user.id, which, scoring: sc, tz: s.workspace.timezone, teamSize: members.length });
    return { title: "KRA report", subtitle: `${company} · ${which === "current" ? "current" : "previous"} month / quarter`, columns: ["Person", "Key result area", "Measured by", "Period", "Weight", "Target", "Actual", "Achievement %", "Status", "Review notes"], rows: rows.map((r) => [r.userName, r.name, r.metricKey ? KPI_BY_KEY[r.metricKey]?.name ?? r.metricKey : r.measurement ?? "Manual review", r.period, r.weightage, r.target, r.actual, r.pct === null ? null : Math.round(r.pct), r.status, r.reviewNotes]) };
  }
  // performance
  const period = resolvePeriod(q.period ?? "this_month", s.workspace.timezone);
  const kraAll = await loadKraRows({ workspaceId: ws, userId: s.isWsAdmin ? null : s.user.id, which: period.key.startsWith("last") ? "previous" : "current", scoring: sc, tz: s.workspace.timezone, teamSize: members.length });
  const out: Cell[][] = [];
  for (const m of visible) {
    const { rows, metrics: x } = await loadKpiRows({ workspaceId: ws, userId: m.id, period, scoring: sc, teamSize: members.length });
    const kpi = kpiScore(rows);
    const kra = kraScore(kraAll.filter((r) => r.userId === m.id));
    const overall = overallScore(kpi, kra);
    out.push([m.name, x.leadsGenerated, x.qualified, x.contacted, x.followUpsCompleted, x.meetings, x.proposals, x.converted, Number(x.conversionRate.toFixed(1)), x.tasksCompleted, x.overdueFollowUps, kpi === null ? null : Math.round(kpi), kra === null ? null : Math.round(kra), overall === null ? null : Math.round(overall)]);
  }
  return { title: "Employee performance", subtitle: `${company} · ${period.label} (${fmtDate(period.from)} – ${fmtDate(new Date(period.to.getTime() - 1))})`, columns: ["Person", "Leads", "Qualified", "Contacted", "Follow-ups done", "Meetings", "Proposals", "Converted", "Conv. rate %", "Tasks done", "Overdue follow-ups", "KPI score %", "KRA score %", "Overall %"], rows: out };
}

/* ───────────── renderers ───────────── */
export function toCsv(d: Dataset): string {
  return "﻿" + [d.columns.join(","), ...d.rows.map((r) => r.map(csvEscape).join(","))].join("\r\n");
}

export async function toXlsx(d: Dataset): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "LinkGenius AI";
  const ws = wb.addWorksheet(d.title.slice(0, 30));
  ws.addRow([d.title]).font = { bold: true, size: 14 };
  ws.addRow([d.subtitle]).font = { color: { argb: "FF666666" } };
  ws.addRow([]);
  const head = ws.addRow(d.columns);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF243054" } }));
  // Strings are stored as plain text cells in .xlsx (never evaluated as formulas), so no prefix is needed.
  for (const r of d.rows) ws.addRow(r);
  d.columns.forEach((c, i) => {
    const longest = Math.max(c.length, ...d.rows.slice(0, 200).map((r) => String(r[i] ?? "").length));
    ws.getColumn(i + 1).width = Math.min(48, longest + 3);
  });
  ws.views = [{ state: "frozen", ySplit: 4 }];
  if (d.rows.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: d.columns.length } };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export function toPdf(d: Dataset): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 36, bufferPages: true });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const W = doc.page.width - 72;
    doc.font("Helvetica-Bold").fontSize(16).fillColor("#0d1530").text(d.title);
    doc.font("Helvetica").fontSize(9).fillColor("#555").text(d.subtitle);
    doc.moveDown(0.8);
    const n = d.columns.length;
    const weights = d.columns.map((c, i) => Math.max(c.length + 1, 5, Math.min(26, Math.max(...d.rows.slice(0, 60).map((r) => String(r[i] ?? "").length), 0))));
    const total = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / total) * W);
    const fs = n > 11 ? 6.5 : n > 8 ? 7.5 : 8.5;
    const drawRow = (cells: string[], bold: boolean, fill?: string) => {
      const heights = cells.map((c, i) => doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(fs).heightOfString(c, { width: widths[i] - 6 }));
      const h = Math.max(...heights) + 6;
      if (doc.y + h > doc.page.height - 50) {
        doc.addPage();
        drawRow(d.columns, true, "#e6eaf4");
      }
      const y = doc.y;
      let x = 36;
      if (fill) doc.save().rect(36, y, W, h).fill(fill).restore();
      cells.forEach((c, i) => {
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(fs).fillColor("#0d1530").text(c, x + 3, y + 3, { width: widths[i] - 6 });
        x += widths[i];
      });
      doc.y = y + h;
      doc.save().moveTo(36, doc.y).lineTo(36 + W, doc.y).lineWidth(0.3).strokeColor("#c9d1e6").stroke().restore();
    };
    drawRow(d.columns, true, "#e6eaf4");
    if (!d.rows.length) doc.moveDown().font("Helvetica").fontSize(10).fillColor("#666").text("No data for this selection.", 36);
    for (const r of d.rows) drawRow(r.map((c) => (c === null || c === undefined ? "" : String(c))), false);
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(i);
      doc.font("Helvetica").fontSize(7.5).fillColor("#888").text(`Generated by LinkGenius AI · ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC · page ${i + 1} of ${range.count}`, 36, doc.page.height - 30, { width: W, align: "center", lineBreak: false });
    }
    doc.end();
  });
}
