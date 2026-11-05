/**
 * The built-in list of KPIs. The numbers themselves are calculated from real database records
 * in src/lib/metrics.ts — this file only describes each KPI.
 */
export type KpiDef = {
  key: string;
  name: string;
  category: "Lead Generation" | "Lead Quality" | "Sales" | "Productivity";
  unit: "count" | "percent" | "hours" | "score";
  higherIsBetter: boolean;
  description: string;
  defaultTarget: number | null; // starting suggestion only — administrators set real targets
};

export const KPI_CATALOG: KpiDef[] = [
  { key: "LEADS_GENERATED", name: "Total Leads Generated", category: "Lead Generation", unit: "count", higherIsBetter: true, description: "New, non-duplicate leads added to the CRM in the period.", defaultTarget: 100 },
  { key: "NEW_LEADS_PER_DAY", name: "New Leads Per Day", category: "Lead Generation", unit: "count", higherIsBetter: true, description: "Leads generated divided by days in the period.", defaultTarget: 5 },
  { key: "NEW_LEADS_PER_WEEK", name: "New Leads Per Week", category: "Lead Generation", unit: "count", higherIsBetter: true, description: "Leads generated per 7 days.", defaultTarget: 25 },
  { key: "NEW_LEADS_PER_MONTH", name: "New Leads Per Month", category: "Lead Generation", unit: "count", higherIsBetter: true, description: "Leads generated, normalised to 30 days.", defaultTarget: 100 },
  { key: "LEADS_PER_EMPLOYEE", name: "Leads Generated Per Employee", category: "Lead Generation", unit: "count", higherIsBetter: true, description: "Team leads generated divided by active team members.", defaultTarget: null },
  { key: "QUALIFIED_LEADS", name: "Qualified Leads", category: "Lead Quality", unit: "count", higherIsBetter: true, description: "Leads moved to Qualified in the period.", defaultTarget: 40 },
  { key: "QUALIFICATION_RATE", name: "Qualification Rate", category: "Lead Quality", unit: "percent", higherIsBetter: true, description: "Qualified leads as a share of leads generated.", defaultTarget: 30 },
  { key: "HIGH_PRIORITY_LEADS", name: "High-Priority Leads", category: "Lead Quality", unit: "count", higherIsBetter: true, description: "Leads added in the period that scored in the High Priority band.", defaultTarget: 20 },
  { key: "AVG_LEAD_SCORE", name: "Average Lead Score", category: "Lead Quality", unit: "score", higherIsBetter: true, description: "Average score (0–100) of leads added in the period.", defaultTarget: 60 },
  { key: "VERIFIED_PERCENT", name: "Verified Lead Percentage", category: "Lead Quality", unit: "percent", higherIsBetter: true, description: "Share of leads added in the period that are Verified or Partially Verified.", defaultTarget: 50 },
  { key: "LEADS_CONTACTED", name: "Leads Contacted", category: "Sales", unit: "count", higherIsBetter: true, description: "Leads first contacted in the period.", defaultTarget: 60 },
  { key: "FOLLOWUPS_COMPLETED", name: "Follow-ups Completed", category: "Sales", unit: "count", higherIsBetter: true, description: "Follow-up tasks completed in the period.", defaultTarget: 40 },
  { key: "MEETINGS_SCHEDULED", name: "Meetings Scheduled", category: "Sales", unit: "count", higherIsBetter: true, description: "Leads moved to Meeting Scheduled in the period.", defaultTarget: 10 },
  { key: "PROPOSALS_SENT", name: "Proposals Sent", category: "Sales", unit: "count", higherIsBetter: true, description: "Leads moved to Proposal Sent in the period.", defaultTarget: 6 },
  { key: "LEADS_CONVERTED", name: "Leads Converted", category: "Sales", unit: "count", higherIsBetter: true, description: "Leads moved to Converted in the period.", defaultTarget: 2 },
  { key: "CONVERSION_RATE", name: "Conversion Rate", category: "Sales", unit: "percent", higherIsBetter: true, description: "Converted leads as a share of leads generated.", defaultTarget: 5 },
  { key: "TASKS_COMPLETED", name: "Tasks Completed", category: "Productivity", unit: "count", higherIsBetter: true, description: "Tasks of every kind completed in the period.", defaultTarget: 60 },
  { key: "OVERDUE_FOLLOWUPS", name: "Overdue Follow-ups", category: "Productivity", unit: "count", higherIsBetter: false, description: "Open follow-ups that are past their due date right now.", defaultTarget: 0 },
  { key: "AVG_PROCESSING_HOURS", name: "Avg Lead Processing Time", category: "Productivity", unit: "hours", higherIsBetter: false, description: "Average hours from lead creation to its first status change.", defaultTarget: 48 },
  { key: "AVG_QUALIFICATION_HOURS", name: "Avg Qualification Time", category: "Productivity", unit: "hours", higherIsBetter: false, description: "Average hours from lead creation to Qualified.", defaultTarget: 72 },
  { key: "CRM_UPDATE_RATE", name: "CRM Update Rate", category: "Productivity", unit: "percent", higherIsBetter: true, description: "Share of active leads with activity in the last 14 days.", defaultTarget: 80 },
];

export const KPI_BY_KEY = Object.fromEntries(KPI_CATALOG.map((k) => [k.key, k])) as Record<string, KpiDef>;

export type AchievementStatus = "Exceeding Target" | "On Track" | "Needs Improvement" | "Below Target" | "No Target";

export const ACHIEVEMENT_TONE: Record<AchievementStatus, string> = {
  "Exceeding Target": "bg-emerald-100 text-emerald-700",
  "On Track": "bg-blue-100 text-blue-700",
  "Needs Improvement": "bg-amber-100 text-amber-800",
  "Below Target": "bg-rose-100 text-rose-700",
  "No Target": "bg-slate-100 text-slate-600",
};

/** achievement % = actual / target (or target / actual when lower is better) */
export function achievementPct(actual: number, target: number | null, higherIsBetter = true): number | null {
  if (target === null || Number.isNaN(target)) return null;
  if (higherIsBetter) {
    if (target === 0) return actual === 0 ? 100 : 0;
    return (actual / target) * 100;
  }
  if (actual === 0) return 100;
  if (target === 0) return 0;
  return (target / actual) * 100;
}

export function achievementStatus(pct: number | null): AchievementStatus {
  if (pct === null) return "No Target";
  if (pct > 100) return "Exceeding Target";
  if (pct >= 80) return "On Track";
  if (pct >= 50) return "Needs Improvement";
  return "Below Target";
}
