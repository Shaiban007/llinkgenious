import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { and, count, desc, eq, gte, inArray, isNotNull, isNull, lt, sql, type SQL } from "drizzle-orm";
import { db, leads, salesPipeline, tasks, users, workspaceMembers } from "@/db";
import { PIPELINE_COLUMNS } from "./constants";
import { computeMetrics, daysIn, type Range } from "./metrics";
import type { AppSession } from "./session";
import { addDays, pctChange, previousRange } from "./utils";

/** Only leads that are in the CRM count on the dashboard. */
const live = (ws: string) => and(eq(leads.workspaceId, ws), isNull(leads.archivedAt), eq(leads.inCrm, true));

function dayKey(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function dayLabel(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, day: "2-digit", month: "short" }).format(d);
}
function dayFull(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, weekday: "short", day: "2-digit", month: "short", year: "numeric" }).format(d);
}

export type Card = { key: string; label: string; value: number; previous: number; change: number | null; format: "count" | "percent"; hint?: string };

export async function loadDashboard(session: AppSession, rangeIn: Range) {
  const ws = session.workspace.id;
  const tz = session.workspace.timezone;
  const scoring = session.workspace.settings.scoring;
  const now = new Date();

  // Clamp custom ranges to one year so charts stay readable.
  const maxSpan = 366 * 86400000;
  const range: Range = rangeIn.to.getTime() - rangeIn.from.getTime() > maxSpan ? { from: new Date(rangeIn.to.getTime() - maxSpan), to: rangeIn.to } : rangeIn;
  const prev = previousRange({ key: "", label: "", ...range });

  const [cur, prv, totalNow, totalBefore] = await Promise.all([
    computeMetrics({ workspaceId: ws }, range, scoring, now),
    computeMetrics({ workspaceId: ws }, prev, scoring, now),
    db.select({ n: count() }).from(leads).where(and(live(ws), lt(leads.crmAddedAt, range.to))),
    db.select({ n: count() }).from(leads).where(and(live(ws), lt(leads.crmAddedAt, range.from))),
  ]);

  const card = (key: string, label: string, value: number, previous: number, format: Card["format"] = "count", hint?: string): Card => ({
    key,
    label,
    value,
    previous,
    change: pctChange(value, previous),
    format,
    hint,
  });
  const cards: Card[] = [
    card("total", "Total leads", Number(totalNow[0].n), Number(totalBefore[0].n), "count", "vs start of period"),
    card("new", "New leads", cur.leadsGenerated, prv.leadsGenerated),
    card("qualified", "Qualified leads", cur.qualified, prv.qualified),
    card("high", "High-priority leads", cur.highPriority, prv.highPriority),
    card("contacted", "Leads contacted", cur.contacted, prv.contacted),
    card("followups", "Follow-ups due", cur.followUpsDue, prv.followUpsDue, "count", `${cur.followUpsDueOpen} still open`),
    card("converted", "Converted leads", cur.converted, prv.converted),
    card("rate", "Conversion rate", cur.conversionRate, prv.conversionRate, "percent", "converted ÷ new leads"),
  ];

  /* ── 1. leads over time (filled so days without leads show as 0) ── */
  const perDay = await db
    .select({ d: sql<string>`to_char(${leads.crmAddedAt} at time zone ${tz}, 'YYYY-MM-DD')`, n: count() })
    .from(leads)
    .where(and(live(ws), gte(leads.crmAddedAt, range.from), lt(leads.crmAddedAt, range.to)))
    .groupBy(sql`1`);
  const dayMap = new Map(perDay.map((r) => [r.d, Number(r.n)]));
  const trend: { label: string; full: string; value: number }[] = [];
  const steps = daysIn(range);
  for (let i = 0; i < steps; i++) {
    const d = new Date(range.from.getTime() + 12 * 3600000 + i * 86400000); // noon avoids DST edge cases
    if (d.getTime() > now.getTime() + 86400000) break;
    trend.push({ label: dayLabel(d, tz), full: dayFull(d, tz), value: dayMap.get(dayKey(d, tz)) ?? 0 });
  }

  /* ── 2-4. leads by industry / designation / country ── */
  async function group(col: SQL | AnyPgColumn, limit = 8) {
    const label = sql<string>`coalesce(nullif(trim(${col}), ''), 'Not specified')`;
    const rows = await db
      .select({ label, n: count() })
      .from(leads)
      .where(and(live(ws), gte(leads.crmAddedAt, range.from), lt(leads.crmAddedAt, range.to)))
      .groupBy(sql`1`)
      .orderBy(desc(count()))
      .limit(limit);
    return rows.map((r) => ({ label: r.label, value: Number(r.n) }));
  }
  const [byIndustry, byTitle, byCountry] = await Promise.all([group(leads.industry), group(leads.jobTitle), group(leads.country)]);

  /* ── 5. score bands (ordered best → worst) ── */
  const t = scoring.thresholds;
  const [bands] = await db
    .select({
      high: sql<number>`count(*) filter (where ${leads.score} >= ${t.high})`,
      good: sql<number>`count(*) filter (where ${leads.score} >= ${t.good} and ${leads.score} < ${t.high})`,
      medium: sql<number>`count(*) filter (where ${leads.score} >= ${t.medium} and ${leads.score} < ${t.good})`,
      low: sql<number>`count(*) filter (where ${leads.score} < ${t.medium})`,
    })
    .from(leads)
    .where(and(live(ws), gte(leads.crmAddedAt, range.from), lt(leads.crmAddedAt, range.to)));
  const qualification = [
    { label: `High (${t.high}–100)`, value: Number(bands.high) },
    { label: `Good (${t.good}–${t.high - 1})`, value: Number(bands.good) },
    { label: `Medium (${t.medium}–${t.good - 1})`, value: Number(bands.medium) },
    { label: `Low (0–${t.medium - 1})`, value: Number(bands.low) },
  ];

  /* ── 6. pipeline snapshot (current stage of every active lead) ── */
  const stageRows = await db.select({ status: leads.status, n: count() }).from(leads).where(live(ws)).groupBy(leads.status);
  const stageMap = new Map(stageRows.map((r) => [r.status, Number(r.n)]));
  const pipeline = PIPELINE_COLUMNS.map((c) => ({ label: c.label, value: c.statuses.reduce((s, st) => s + (stageMap.get(st) ?? 0), 0) }));

  /* ── 7. monthly conversion rate, last 6 months ── */
  const monthKeys: { key: string; label: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 30.44 * 86400000);
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit" }).format(d).slice(0, 7);
    if (!monthKeys.find((m) => m.key === key)) monthKeys.push({ key, label: new Intl.DateTimeFormat("en-GB", { timeZone: tz, month: "short", year: "2-digit" }).format(d) });
  }
  const since = new Date(now.getTime() - 190 * 86400000);
  const [createdByMonth, convertedByMonth] = await Promise.all([
    db
      .select({ m: sql<string>`to_char(${leads.crmAddedAt} at time zone ${tz}, 'YYYY-MM')`, n: count() })
      .from(leads)
      .where(and(live(ws), gte(leads.crmAddedAt, since)))
      .groupBy(sql`1`),
    db
      .select({ m: sql<string>`to_char(${salesPipeline.enteredAt} at time zone ${tz}, 'YYYY-MM')`, n: sql<number>`count(distinct ${salesPipeline.leadId})` })
      .from(salesPipeline)
      .innerJoin(leads, and(eq(leads.id, salesPipeline.leadId), isNull(leads.archivedAt), eq(leads.inCrm, true)))
      .where(and(eq(salesPipeline.workspaceId, ws), eq(salesPipeline.toStatus, "CONVERTED"), gte(salesPipeline.enteredAt, since)))
      .groupBy(sql`1`),
  ]);
  const cm = new Map(createdByMonth.map((r) => [r.m, Number(r.n)]));
  const vm = new Map(convertedByMonth.map((r) => [r.m, Number(r.n)]));
  const monthly = monthKeys.map((m) => {
    const created = cm.get(m.key) ?? 0;
    const conv = vm.get(m.key) ?? 0;
    return { label: m.label, full: `${m.label}: ${conv} converted of ${created} new`, value: created ? Math.round((conv / created) * 1000) / 10 : 0 };
  });

  /* ── 8. team performance (admins see everyone, members see only themselves) ── */
  const members = await db
    .select({ id: users.id, name: users.name })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(and(eq(workspaceMembers.workspaceId, ws), session.isWsAdmin ? undefined : eq(users.id, session.user.id)));
  const ids = members.map((m) => m.id);
  const team: { label: string; created: number; qualified: number; converted: number }[] = [];
  if (ids.length) {
    const [cRows, qRows, vRows] = await Promise.all([
      db.select({ u: leads.createdBy, n: count() }).from(leads).where(and(live(ws), gte(leads.crmAddedAt, range.from), lt(leads.crmAddedAt, range.to), inArray(leads.createdBy, ids))).groupBy(leads.createdBy),
      db
        .select({ u: salesPipeline.userId, n: sql<number>`count(distinct ${salesPipeline.leadId})` })
        .from(salesPipeline)
        .where(and(eq(salesPipeline.workspaceId, ws), eq(salesPipeline.toStatus, "QUALIFIED"), gte(salesPipeline.enteredAt, range.from), lt(salesPipeline.enteredAt, range.to), inArray(salesPipeline.userId, ids)))
        .groupBy(salesPipeline.userId),
      db
        .select({ u: salesPipeline.userId, n: sql<number>`count(distinct ${salesPipeline.leadId})` })
        .from(salesPipeline)
        .where(and(eq(salesPipeline.workspaceId, ws), eq(salesPipeline.toStatus, "CONVERTED"), gte(salesPipeline.enteredAt, range.from), lt(salesPipeline.enteredAt, range.to), inArray(salesPipeline.userId, ids)))
        .groupBy(salesPipeline.userId),
    ]);
    const mc = new Map(cRows.map((r) => [r.u, Number(r.n)]));
    const mq = new Map(qRows.map((r) => [r.u, Number(r.n)]));
    const mv = new Map(vRows.map((r) => [r.u, Number(r.n)]));
    for (const m of members) team.push({ label: m.name, created: mc.get(m.id) ?? 0, qualified: mq.get(m.id) ?? 0, converted: mv.get(m.id) ?? 0 });
  }

  /* ── recent activity ── */
  const [recentAdded, recentQualified, recentUpdated, upcoming, doneTasks] = await Promise.all([
    db.select().from(leads).where(live(ws)).orderBy(desc(leads.crmAddedAt)).limit(5),
    db.select().from(leads).where(and(live(ws), isNotNull(leads.qualifiedAt))).orderBy(desc(leads.qualifiedAt)).limit(5),
    db.select().from(leads).where(live(ws)).orderBy(desc(leads.lastActivityAt)).limit(5),
    db
      .select({ id: tasks.id, title: tasks.title, dueAt: tasks.dueAt, priority: tasks.priority, leadId: tasks.leadId, leadName: leads.fullName })
      .from(tasks)
      .leftJoin(leads, eq(leads.id, tasks.leadId))
      .where(and(eq(tasks.workspaceId, ws), isNull(tasks.completedAt), isNotNull(tasks.dueAt), session.isWsAdmin ? undefined : eq(tasks.assignedTo, session.user.id)))
      .orderBy(tasks.dueAt)
      .limit(5),
    db
      .select({ id: tasks.id, title: tasks.title, completedAt: tasks.completedAt, leadId: tasks.leadId, leadName: leads.fullName })
      .from(tasks)
      .leftJoin(leads, eq(leads.id, tasks.leadId))
      .where(and(eq(tasks.workspaceId, ws), isNotNull(tasks.completedAt), session.isWsAdmin ? undefined : eq(tasks.assignedTo, session.user.id)))
      .orderBy(desc(tasks.completedAt))
      .limit(5),
  ]);

  return {
    cards,
    trend,
    byIndustry,
    byTitle,
    byCountry,
    qualification,
    pipeline,
    monthly,
    team,
    recent: { added: recentAdded, qualified: recentQualified, updated: recentUpdated, upcoming, doneTasks },
    totalLeads: Number(totalNow[0].n),
    range,
  };
}

export { addDays };
