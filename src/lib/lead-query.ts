/** One filter + sort + paginate engine used by the Lead list, Lead Finder, exports and the AI assistant. */
import { and, asc, count, desc, eq, gte, ilike, lt, or, sql, type SQL } from "drizzle-orm";
import { db, leadListItems, leads, users } from "@/db";
import type { ScoringConfig } from "./workspace-settings";

export type LeadFilters = {
  scope: "crm" | "pool";
  q: string;
  status: string;
  category: string;
  industry: string;
  country: string;
  assigned: string;
  source: string;
  verification: string;
  list: string;
  hasEmail: string;
  from: string;
  to: string;
  sort: string;
  dir: "asc" | "desc";
  page: number;
  pageSize: number;
};

type Sp = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseFilters(sp: Sp, scope: "crm" | "pool", pageSize = 25): LeadFilters {
  const page = Math.max(1, Number.parseInt(one(sp.page), 10) || 1);
  return {
    scope,
    q: one(sp.q).trim().slice(0, 100),
    status: one(sp.status),
    category: one(sp.category),
    industry: one(sp.industry).trim(),
    country: one(sp.country).trim(),
    assigned: one(sp.assigned),
    source: one(sp.source).trim(),
    verification: one(sp.verification),
    list: one(sp.list),
    hasEmail: one(sp.hasEmail),
    from: one(sp.from),
    to: one(sp.to),
    sort: one(sp.sort) || (scope === "pool" ? "score" : "created"),
    dir: one(sp.dir) === "asc" ? "asc" : "desc",
    page,
    pageSize,
  };
}

const SORTS = {
  name: leads.fullName,
  company: leads.companyName,
  score: leads.score,
  status: leads.status,
  created: leads.crmAddedAt,
  found: leads.createdAt,
  activity: leads.lastActivityAt,
} as const;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => "\\" + m);

export function buildWhere(workspaceId: string, f: LeadFilters, scoring: ScoringConfig, currentUserId?: string): SQL {
  const t = scoring.thresholds;
  const c: (SQL | undefined)[] = [eq(leads.workspaceId, workspaceId), sql`${leads.archivedAt} is null`, eq(leads.inCrm, f.scope === "crm")];
  if (f.q) {
    const like = `%${escapeLike(f.q)}%`;
    c.push(or(ilike(leads.fullName, like), ilike(leads.companyName, like), ilike(leads.email, like), ilike(leads.jobTitle, like), ilike(leads.industry, like), ilike(leads.country, like)));
  }
  if (f.status) c.push(sql`${leads.status} = ${f.status}`);
  if (f.category === "high") c.push(sql`${leads.score} >= ${t.high}`);
  else if (f.category === "good") c.push(sql`${leads.score} >= ${t.good} and ${leads.score} < ${t.high}`);
  else if (f.category === "medium") c.push(sql`${leads.score} >= ${t.medium} and ${leads.score} < ${t.good}`);
  else if (f.category === "low") c.push(sql`${leads.score} < ${t.medium}`);
  if (f.industry) c.push(ilike(leads.industry, `%${escapeLike(f.industry)}%`));
  if (f.country) c.push(ilike(leads.country, `%${escapeLike(f.country)}%`));
  if (f.assigned === "me" && currentUserId) c.push(eq(leads.assignedTo, currentUserId));
  else if (f.assigned === "none") c.push(sql`${leads.assignedTo} is null`);
  else if (/^[0-9a-f-]{36}$/i.test(f.assigned)) c.push(eq(leads.assignedTo, f.assigned));
  if (f.source) c.push(ilike(leads.sourceLabel, `%${escapeLike(f.source)}%`));
  if (f.verification) c.push(sql`${leads.verification} = ${f.verification}`);
  if (f.hasEmail === "yes") c.push(sql`${leads.email} is not null`);
  if (f.hasEmail === "no") c.push(sql`${leads.email} is null`);
  if (/^[0-9a-f-]{36}$/i.test(f.list)) c.push(sql`exists (select 1 from ${leadListItems} li where li.lead_id = ${leads.id} and li.list_id = ${f.list})`);
  const dateCol = f.scope === "crm" ? leads.crmAddedAt : leads.createdAt;
  if (f.from && !Number.isNaN(Date.parse(f.from))) c.push(gte(dateCol, new Date(f.from + "T00:00:00Z")));
  if (f.to && !Number.isNaN(Date.parse(f.to))) c.push(lt(dateCol, new Date(Date.parse(f.to) + 86400000)));
  return and(...c) as SQL;
}

export async function queryLeads(workspaceId: string, f: LeadFilters, scoring: ScoringConfig, currentUserId?: string, opts: { unpaged?: boolean } = {}) {
  const where = buildWhere(workspaceId, f, scoring, currentUserId);
  const col = SORTS[f.sort as keyof typeof SORTS] ?? SORTS.created;
  const order = f.dir === "asc" ? asc(col) : desc(col);
  const [{ n }] = await db.select({ n: count() }).from(leads).where(where);
  const total = Number(n);
  const base = db
    .select({ lead: leads, assigneeName: users.name })
    .from(leads)
    .leftJoin(users, eq(users.id, leads.assignedTo))
    .where(where)
    .orderBy(order, desc(leads.createdAt));
  const rows = opts.unpaged ? await base.limit(10000) : await base.limit(f.pageSize).offset((f.page - 1) * f.pageSize);
  return { rows, total, pages: Math.max(1, Math.ceil(total / f.pageSize)) };
}

/** Rebuilds a query string from the active filters (for pagination, sort links and exports). */
export function filterQuery(f: LeadFilters, overrides: Record<string, string | number | undefined> = {}) {
  const p = new URLSearchParams();
  const entries: Record<string, string | number | undefined> = {
    q: f.q,
    status: f.status,
    category: f.category,
    industry: f.industry,
    country: f.country,
    assigned: f.assigned,
    source: f.source,
    verification: f.verification,
    list: f.list,
    hasEmail: f.hasEmail,
    from: f.from,
    to: f.to,
    sort: f.sort,
    dir: f.dir,
    page: f.page > 1 ? f.page : undefined,
    ...overrides,
  };
  for (const [k, v] of Object.entries(entries)) if (v !== undefined && v !== "") p.set(k, String(v));
  return p.toString();
}
