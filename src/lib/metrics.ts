/**
 * ONE place that turns database records into numbers. The dashboard, KPI page, performance page,
 * KRA achievement, reports and the AI assistant all call computeMetrics(), so they always agree.
 *
 * Definitions (documented on the KPI page too):
 *  - Only leads that are IN THE CRM count. Discovered-but-not-added leads never inflate any number.
 *  - Leads generated      = unique (non-archived) leads added to the CRM in the period, by creator.
 *                           Duplicates are blocked at entry, so they can never inflate this number.
 *  - Qualified / Meetings / Proposals / Converted = distinct leads that ENTERED that stage in the period
 *                           (taken from the stage-history table, attributed to who moved them).
 *  - Contacted            = leads whose first contact happened in the period (by assignee).
 *  - Conversion rate      = converted ÷ leads generated × 100.
 */
import { and, avg, count, countDistinct, eq, gte, inArray, isNotNull, isNull, lt, notInArray, sql, type SQL } from "drizzle-orm";
import { db, leads, salesPipeline, tasks } from "@/db";
import type { LeadStatus } from "./constants";
import type { ScoringConfig } from "./workspace-settings";

export type Range = { from: Date; to: Date };
export type Scope = { workspaceId: string; userId?: string | null };

export type Metrics = {
  leadsGenerated: number;
  qualified: number;
  qualificationRate: number;
  highPriority: number;
  avgScore: number | null;
  verifiedPct: number | null;
  contacted: number;
  followUpsCompleted: number;
  meetings: number;
  proposals: number;
  converted: number;
  conversionRate: number;
  tasksCompleted: number;
  overdueFollowUps: number;
  followUpsDue: number; // follow-ups with a due date inside the period
  followUpsDueOpen: number; // …of which are still open
  avgProcessingHours: number | null;
  avgQualificationHours: number | null;
  crmUpdateRate: number | null;
  assignedLeads: number;
};

const num = (v: unknown) => Number(v ?? 0);
const live = (ws: string) => and(eq(leads.workspaceId, ws), isNull(leads.archivedAt), eq(leads.inCrm, true));
const iso = (d: Date) => sql`${d.toISOString()}::timestamptz`;

async function stageEntered(scope: Scope, range: Range, statuses: LeadStatus[]) {
  const [r] = await db
    .select({ n: countDistinct(salesPipeline.leadId) })
    .from(salesPipeline)
    .innerJoin(leads, and(eq(leads.id, salesPipeline.leadId), isNull(leads.archivedAt), eq(leads.inCrm, true)))
    .where(
      and(
        eq(salesPipeline.workspaceId, scope.workspaceId),
        inArray(salesPipeline.toStatus, statuses),
        gte(salesPipeline.enteredAt, range.from),
        lt(salesPipeline.enteredAt, range.to),
        scope.userId ? eq(salesPipeline.userId, scope.userId) : undefined
      )
    );
  return num(r.n);
}

export async function computeMetrics(scope: Scope, range: Range, scoring: ScoringConfig, now = new Date()): Promise<Metrics> {
  const ws = scope.workspaceId;
  const createdInRange: SQL | undefined = and(live(ws), gte(leads.crmAddedAt, range.from), lt(leads.crmAddedAt, range.to), scope.userId ? eq(leads.createdBy, scope.userId) : undefined);
  const taskScope = (extra: SQL | undefined) => and(eq(tasks.workspaceId, ws), scope.userId ? eq(tasks.assignedTo, scope.userId) : undefined, extra);

  const [
    generated,
    quality,
    contacted,
    qualified,
    meetings,
    proposals,
    converted,
    fuDone,
    tasksDone,
    overdue,
    fuDue,
    fuDueOpen,
    processing,
    qualTime,
    activeLeads,
    freshLeads,
    assigned,
  ] = await Promise.all([
    db.select({ n: count() }).from(leads).where(createdInRange),
    db
      .select({
        high: sql<number>`count(*) filter (where ${leads.score} >= ${scoring.thresholds.high})`,
        avgScore: avg(leads.score),
        verified: sql<number>`count(*) filter (where ${leads.verification} in ('VERIFIED','PARTIALLY_VERIFIED'))`,
        total: count(),
      })
      .from(leads)
      .where(createdInRange),
    db
      .select({ n: count() })
      .from(leads)
      .where(and(live(ws), isNotNull(leads.firstContactedAt), gte(leads.firstContactedAt, range.from), lt(leads.firstContactedAt, range.to), scope.userId ? eq(leads.assignedTo, scope.userId) : undefined)),
    stageEntered(scope, range, ["QUALIFIED"]),
    stageEntered(scope, range, ["MEETING_SCHEDULED"]),
    stageEntered(scope, range, ["PROPOSAL_SENT"]),
    stageEntered(scope, range, ["CONVERTED"]),
    db.select({ n: count() }).from(tasks).where(taskScope(and(eq(tasks.kind, "FOLLOW_UP"), isNotNull(tasks.completedAt), gte(tasks.completedAt, range.from), lt(tasks.completedAt, range.to)))),
    db.select({ n: count() }).from(tasks).where(taskScope(and(isNotNull(tasks.completedAt), gte(tasks.completedAt, range.from), lt(tasks.completedAt, range.to)))),
    db.select({ n: count() }).from(tasks).where(taskScope(and(eq(tasks.kind, "FOLLOW_UP"), isNull(tasks.completedAt), lt(tasks.dueAt, now)))),
    db.select({ n: count() }).from(tasks).where(taskScope(and(eq(tasks.kind, "FOLLOW_UP"), isNotNull(tasks.dueAt), gte(tasks.dueAt, range.from), lt(tasks.dueAt, range.to)))),
    db.select({ n: count() }).from(tasks).where(taskScope(and(eq(tasks.kind, "FOLLOW_UP"), isNull(tasks.completedAt), isNotNull(tasks.dueAt), gte(tasks.dueAt, range.from), lt(tasks.dueAt, range.to)))),
    // hours from CRM entry to the first status change, for leads added in the period
    db.execute<{ h: string | null }>(sql`
      select avg(extract(epoch from (p.first_at - l.crm_added_at)) / 3600.0) as h
      from leads l
      join lateral (
        select min(entered_at) as first_at from sales_pipeline sp where sp.lead_id = l.id and sp.from_status is not null
      ) p on p.first_at is not null
      where l.workspace_id = ${ws} and l.archived_at is null and l.in_crm
        and l.crm_added_at >= ${iso(range.from)} and l.crm_added_at < ${iso(range.to)}
        ${scope.userId ? sql`and l.created_by = ${scope.userId}` : sql``}`),
    db.execute<{ h: string | null }>(sql`
      select avg(extract(epoch from (l.qualified_at - l.crm_added_at)) / 3600.0) as h
      from leads l
      where l.workspace_id = ${ws} and l.archived_at is null and l.in_crm and l.qualified_at is not null
        and l.qualified_at >= ${iso(range.from)} and l.qualified_at < ${iso(range.to)}
        ${scope.userId ? sql`and l.assigned_to = ${scope.userId}` : sql``}`),
    db
      .select({ n: count() })
      .from(leads)
      .where(and(live(ws), notInArray(leads.status, ["CONVERTED", "NOT_INTERESTED", "DISQUALIFIED"]), scope.userId ? eq(leads.assignedTo, scope.userId) : undefined)),
    db
      .select({ n: count() })
      .from(leads)
      .where(
        and(
          live(ws),
          notInArray(leads.status, ["CONVERTED", "NOT_INTERESTED", "DISQUALIFIED"]),
          gte(leads.lastActivityAt, new Date(now.getTime() - 14 * 86400000)),
          scope.userId ? eq(leads.assignedTo, scope.userId) : undefined
        )
      ),
    db.select({ n: count() }).from(leads).where(and(live(ws), scope.userId ? eq(leads.assignedTo, scope.userId) : undefined)),
  ]);

  const total = num(generated[0].n);
  const q = quality[0];
  const active = num(activeLeads[0].n);
  const procH = (processing[0] as { h: string | null } | undefined)?.h;
  const qualH = (qualTime[0] as { h: string | null } | undefined)?.h;

  return {
    leadsGenerated: total,
    qualified,
    qualificationRate: total ? (qualified / total) * 100 : 0,
    highPriority: num(q.high),
    avgScore: q.avgScore === null ? null : Number(q.avgScore),
    verifiedPct: num(q.total) ? (num(q.verified) / num(q.total)) * 100 : null,
    contacted: num(contacted[0].n),
    followUpsCompleted: num(fuDone[0].n),
    meetings,
    proposals,
    converted,
    conversionRate: total ? (converted / total) * 100 : 0,
    tasksCompleted: num(tasksDone[0].n),
    overdueFollowUps: num(overdue[0].n),
    followUpsDue: num(fuDue[0].n),
    followUpsDueOpen: num(fuDueOpen[0].n),
    avgProcessingHours: procH === null || procH === undefined ? null : Number(procH),
    avgQualificationHours: qualH === null || qualH === undefined ? null : Number(qualH),
    crmUpdateRate: active ? (num(freshLeads[0].n) / active) * 100 : null,
    assignedLeads: num(assigned[0].n),
  };
}

/** Maps computed metrics onto KPI catalog keys. */
export function kpiValues(m: Metrics, rangeDays: number, teamSize: number): Record<string, number | null> {
  const days = Math.max(1, rangeDays);
  return {
    LEADS_GENERATED: m.leadsGenerated,
    NEW_LEADS_PER_DAY: m.leadsGenerated / days,
    NEW_LEADS_PER_WEEK: (m.leadsGenerated / days) * 7,
    NEW_LEADS_PER_MONTH: (m.leadsGenerated / days) * 30,
    LEADS_PER_EMPLOYEE: teamSize > 0 ? m.leadsGenerated / teamSize : null,
    QUALIFIED_LEADS: m.qualified,
    QUALIFICATION_RATE: m.qualificationRate,
    HIGH_PRIORITY_LEADS: m.highPriority,
    AVG_LEAD_SCORE: m.avgScore,
    VERIFIED_PERCENT: m.verifiedPct,
    LEADS_CONTACTED: m.contacted,
    FOLLOWUPS_COMPLETED: m.followUpsCompleted,
    MEETINGS_SCHEDULED: m.meetings,
    PROPOSALS_SENT: m.proposals,
    LEADS_CONVERTED: m.converted,
    CONVERSION_RATE: m.conversionRate,
    TASKS_COMPLETED: m.tasksCompleted,
    OVERDUE_FOLLOWUPS: m.overdueFollowUps,
    AVG_PROCESSING_HOURS: m.avgProcessingHours,
    AVG_QUALIFICATION_HOURS: m.avgQualificationHours,
    CRM_UPDATE_RATE: m.crmUpdateRate,
  };
}

export function daysIn(range: Range) {
  return Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / 86400000));
}
