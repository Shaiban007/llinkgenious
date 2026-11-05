/**
 * Core lead logic shared by the Lead Finder, CSV import, CRM, pipeline, campaigns and AI assistant.
 * Every function takes a Ctx (workspace + user) and ONLY touches rows of that workspace — this is
 * how one customer's leads are kept away from another's.
 *
 * "Discovered" leads (found via search or CSV import) have inCrm = false. They wait in the Lead Finder
 * until someone adds them to the CRM; only CRM leads are counted in dashboards, KPIs and KRAs.
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, companies, leadActivities, leadNotes, leadScores, leads, leadSources, salesPipeline, type Lead } from "@/db";
import { CONTACTED_OR_LATER, STATUS_LABEL, type LeadStatus } from "./constants";
import { scoreLead, type ScoreResult } from "./scoring";
import type { WorkspaceSettings } from "./workspace-settings";
import { domainFromUrl, normalizeLinkedin, splitName } from "./utils";
import { notify } from "./notifications";

export type Ctx = { workspaceId: string; userId: string; settings: WorkspaceSettings };

export type LeadFields = {
  fullName: string;
  jobTitle?: string | null;
  seniority?: string | null;
  department?: string | null;
  email?: string | null;
  phone?: string | null;
  linkedinUrl?: string | null;
  location?: string | null;
  country?: string | null;
  companyName?: string | null;
  companyWebsite?: string | null;
  industry?: string | null;
  companySize?: string | null;
  interests?: string | null;
  sourceLabel?: string | null;
  assignedTo?: string | null;
  dealValue?: string | null;
  dealCurrency?: string | null;
};

const clean = (v?: string | null) => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

export function normalizeFields(f: LeadFields): LeadFields {
  return {
    ...f,
    fullName: f.fullName.trim(),
    jobTitle: clean(f.jobTitle),
    seniority: clean(f.seniority),
    department: clean(f.department),
    email: clean(f.email)?.toLowerCase() ?? null,
    phone: clean(f.phone),
    linkedinUrl: clean(f.linkedinUrl),
    location: clean(f.location),
    country: clean(f.country),
    companyName: clean(f.companyName),
    companyWebsite: clean(f.companyWebsite),
    industry: clean(f.industry),
    companySize: clean(f.companySize),
    interests: clean(f.interests),
    sourceLabel: clean(f.sourceLabel),
    assignedTo: clean(f.assignedTo),
    dealValue: clean(f.dealValue),
    dealCurrency: clean(f.dealCurrency),
  };
}

/* ───────────── duplicate detection ───────────── */
export type DuplicateMatch = { lead: Lead; reason: string };

const linkedinSql = (col: unknown) =>
  sql`lower(regexp_replace(regexp_replace(${col}, '^https?://(www\\.)?', ''), '/+$', ''))`;

export async function findDuplicates(workspaceId: string, f: LeadFields, excludeId?: string): Promise<DuplicateMatch[]> {
  const found = new Map<string, DuplicateMatch>();
  const base = (extra: ReturnType<typeof sql>) =>
    db
      .select()
      .from(leads)
      .where(and(eq(leads.workspaceId, workspaceId), sql`${leads.archivedAt} is null`, extra, excludeId ? sql`${leads.id} <> ${excludeId}` : sql`true`))
      .limit(5);

  const email = clean(f.email)?.toLowerCase();
  if (email) for (const l of await base(sql`lower(${leads.email}) = ${email}`)) found.set(l.id, { lead: l, reason: "Same email address" });

  const li = normalizeLinkedin(f.linkedinUrl);
  if (li) for (const l of await base(sql`${linkedinSql(leads.linkedinUrl)} = ${li}`)) if (!found.has(l.id)) found.set(l.id, { lead: l, reason: "Same LinkedIn profile" });

  const name = clean(f.fullName)?.toLowerCase();
  const company = clean(f.companyName)?.toLowerCase();
  if (name && company) {
    for (const l of await base(sql`lower(${leads.fullName}) = ${name} and lower(${leads.companyName}) = ${company}`))
      if (!found.has(l.id)) found.set(l.id, { lead: l, reason: "Same name at the same company" });
  }
  return [...found.values()];
}

/* ───────────── activity log ───────────── */
export async function addActivity(
  ctx: Pick<Ctx, "workspaceId" | "userId">,
  leadId: string,
  type: string,
  summary: string,
  meta: Record<string, unknown> = {}
) {
  await db.insert(leadActivities).values({ leadId, workspaceId: ctx.workspaceId, userId: ctx.userId, type, summary, meta });
  await db.update(leads).set({ lastActivityAt: new Date() }).where(and(eq(leads.id, leadId), eq(leads.workspaceId, ctx.workspaceId)));
}

/* ───────────── companies ───────────── */
async function upsertCompany(ctx: Ctx, f: LeadFields): Promise<string | null> {
  if (!f.companyName) return null;
  const domain = domainFromUrl(f.companyWebsite);
  const [existing] = await db
    .select({ id: companies.id })
    .from(companies)
    .where(
      and(
        eq(companies.workspaceId, ctx.workspaceId),
        domain ? sql`(${companies.domain} = ${domain} or lower(${companies.name}) = ${f.companyName.toLowerCase()})` : sql`lower(${companies.name}) = ${f.companyName.toLowerCase()}`
      )
    )
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(companies)
    .values({
      workspaceId: ctx.workspaceId,
      name: f.companyName,
      website: f.companyWebsite,
      domain,
      industry: f.industry,
      size: f.companySize,
      location: f.location,
      country: f.country,
      source: f.sourceLabel,
      createdBy: ctx.userId,
    })
    .returning({ id: companies.id });
  return created.id;
}

/* ───────────── sources ───────────── */
export async function getOrCreateSource(ctx: Pick<Ctx, "workspaceId">, name: string, type: "MANUAL" | "CSV_IMPORT" | "PROVIDER" | "OTHER") {
  const [existing] = await db
    .select()
    .from(leadSources)
    .where(and(eq(leadSources.workspaceId, ctx.workspaceId), eq(leadSources.name, name), eq(leadSources.type, type)))
    .limit(1);
  if (existing) return existing;
  const [created] = await db.insert(leadSources).values({ workspaceId: ctx.workspaceId, name, type }).returning();
  return created;
}

/* ───────────── scoring ───────────── */
export async function scoreAndSave(ctx: Ctx, lead: Lead): Promise<ScoreResult> {
  const result = scoreLead(lead, ctx.settings.scoring);
  await db.update(leads).set({ score: result.total, scoreCategory: result.category }).where(and(eq(leads.id, lead.id), eq(leads.workspaceId, ctx.workspaceId)));
  await db.insert(leadScores).values({ leadId: lead.id, workspaceId: ctx.workspaceId, score: result.total, category: result.category, breakdown: { criteria: result.breakdown } });
  return result;
}

/* ───────────── create / update ───────────── */
export type CreateResult =
  | { ok: true; lead: Lead; duplicates: DuplicateMatch[] }
  | { ok: false; duplicate: true; duplicates: DuplicateMatch[] };

export async function createLead(
  ctx: Ctx,
  input: LeadFields,
  opts: { sourceId?: string | null; allowDuplicate?: boolean; isDemo?: boolean; createdAtOverride?: Date; inCrm?: boolean } = {}
): Promise<CreateResult> {
  const f = normalizeFields(input);
  const duplicates = await findDuplicates(ctx.workspaceId, f);
  if (duplicates.length && !opts.allowDuplicate) return { ok: false, duplicate: true, duplicates };

  const inCrm = opts.inCrm ?? true;
  const stamp = opts.createdAtOverride;
  const companyId = await upsertCompany(ctx, f);
  const { firstName, lastName } = splitName(f.fullName);
  const [row] = await db
    .insert(leads)
    .values({
      workspaceId: ctx.workspaceId,
      companyId,
      sourceId: opts.sourceId ?? null,
      firstName,
      lastName,
      fullName: f.fullName,
      jobTitle: f.jobTitle,
      seniority: f.seniority,
      department: f.department,
      email: f.email,
      phone: f.phone,
      linkedinUrl: f.linkedinUrl,
      location: f.location,
      country: f.country,
      companyName: f.companyName,
      companyWebsite: f.companyWebsite,
      industry: f.industry,
      companySize: f.companySize,
      interests: f.interests,
      sourceLabel: f.sourceLabel ?? "Manual entry",
      assignedTo: f.assignedTo ?? ctx.userId,
      createdBy: ctx.userId,
      dealValue: f.dealValue,
      dealCurrency: f.dealCurrency ?? ctx.settings.prefs.defaultCurrency,
      isDemo: opts.isDemo ?? false,
      inCrm,
      crmAddedAt: inCrm ? (stamp ?? new Date()) : null,
      ...(stamp ? { createdAt: stamp, stageEnteredAt: stamp, lastActivityAt: stamp } : {}),
    })
    .returning();

  const score = await scoreAndSave(ctx, row);
  await db.insert(salesPipeline).values({ workspaceId: ctx.workspaceId, leadId: row.id, fromStatus: null, toStatus: "NEW", userId: ctx.userId, enteredAt: row.createdAt });
  await addActivity(
    ctx,
    row.id,
    "CREATED",
    `${inCrm ? "Lead created" : "Lead discovered"} from ${row.sourceLabel}. Score ${score.total}/100 (${score.category}).`,
    { source: row.sourceLabel }
  );
  if (inCrm && row.assignedTo && row.assignedTo !== ctx.userId)
    await notify({ workspaceId: ctx.workspaceId, userId: row.assignedTo, type: "LEAD_ASSIGNED", title: `New lead assigned: ${row.fullName}`, link: `/leads/${row.id}` });

  const [fresh] = await db.select().from(leads).where(eq(leads.id, row.id));
  return { ok: true, lead: fresh, duplicates };
}

/** Moves discovered leads into the CRM. From this moment they count in dashboards and KPIs. */
export async function addToCrm(ctx: Ctx, leadIds: string[]) {
  if (!leadIds.length) return 0;
  const now = new Date();
  const rows = await db
    .update(leads)
    .set({ inCrm: true, crmAddedAt: now, stageEnteredAt: now })
    .where(and(eq(leads.workspaceId, ctx.workspaceId), inArray(leads.id, leadIds), eq(leads.inCrm, false), sql`${leads.archivedAt} is null`))
    .returning({ id: leads.id, assignedTo: leads.assignedTo, fullName: leads.fullName });
  for (const r of rows) {
    await addActivity(ctx, r.id, "UPDATED", "Added to the CRM.", {});
    if (r.assignedTo && r.assignedTo !== ctx.userId)
      await notify({ workspaceId: ctx.workspaceId, userId: r.assignedTo, type: "LEAD_ASSIGNED", title: `New lead assigned: ${r.fullName}`, link: `/leads/${r.id}` });
  }
  return rows.length;
}

export async function updateLead(ctx: Ctx, id: string, patch: Partial<LeadFields>) {
  const [current] = await db.select().from(leads).where(and(eq(leads.id, id), eq(leads.workspaceId, ctx.workspaceId))).limit(1);
  if (!current) return null;
  const f = normalizeFields({ ...(current as unknown as LeadFields), ...patch, fullName: patch.fullName ?? current.fullName });
  const { firstName, lastName } = splitName(f.fullName);
  const changed: string[] = [];
  for (const k of ["fullName", "jobTitle", "email", "phone", "linkedinUrl", "companyName", "companyWebsite", "industry", "companySize", "country", "location", "interests", "dealValue"] as const) {
    if ((patch as Record<string, unknown>)[k] !== undefined && (current as Record<string, unknown>)[k] !== (f as Record<string, unknown>)[k]) changed.push(k);
  }
  const companyId = f.companyName !== current.companyName ? await upsertCompany(ctx, f) : current.companyId;
  await db
    .update(leads)
    .set({
      firstName,
      lastName,
      fullName: f.fullName,
      jobTitle: f.jobTitle,
      seniority: f.seniority,
      department: f.department,
      email: f.email,
      phone: f.phone,
      linkedinUrl: f.linkedinUrl,
      location: f.location,
      country: f.country,
      companyName: f.companyName,
      companyWebsite: f.companyWebsite,
      industry: f.industry,
      companySize: f.companySize,
      interests: f.interests,
      dealValue: f.dealValue,
      dealCurrency: f.dealCurrency,
      companyId,
    })
    .where(and(eq(leads.id, id), eq(leads.workspaceId, ctx.workspaceId)));
  const [updated] = await db.select().from(leads).where(eq(leads.id, id));
  await scoreAndSave(ctx, updated);
  if (changed.length) await addActivity(ctx, id, "UPDATED", `Updated ${changed.join(", ")}.`, { fields: changed });
  const [final] = await db.select().from(leads).where(eq(leads.id, id));
  return final;
}

/* ───────────── status changes (pipeline history lives here) ───────────── */
export async function changeStatus(ctx: Ctx, leadId: string, to: LeadStatus, note?: string) {
  const [lead] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.workspaceId, ctx.workspaceId))).limit(1);
  if (!lead) return null;
  if (lead.status === to) return lead;
  const now = new Date();

  await db.transaction(async (tx) => {
    await tx
      .update(salesPipeline)
      .set({ exitedAt: now })
      .where(and(eq(salesPipeline.leadId, leadId), sql`${salesPipeline.exitedAt} is null`));
    await tx.insert(salesPipeline).values({ workspaceId: ctx.workspaceId, leadId, fromStatus: lead.status, toStatus: to, userId: ctx.userId, enteredAt: now });
    await tx
      .update(leads)
      .set({
        status: to,
        stageEnteredAt: now,
        qualifiedAt: to === "QUALIFIED" && !lead.qualifiedAt ? now : lead.qualifiedAt,
        firstContactedAt: CONTACTED_OR_LATER.includes(to) && !lead.firstContactedAt ? now : lead.firstContactedAt,
      })
      .where(eq(leads.id, leadId));
  });
  await addActivity(ctx, leadId, "STATUS_CHANGE", `Status changed from ${STATUS_LABEL[lead.status]} to ${STATUS_LABEL[to]}${note ? ` — ${note}` : ""}.`, { from: lead.status, to });

  if (to === "QUALIFIED")
    await notify({ workspaceId: ctx.workspaceId, userId: lead.assignedTo ?? ctx.userId, type: "QUALIFICATION_DONE", title: `${lead.fullName} was qualified`, link: `/leads/${leadId}` });

  const [fresh] = await db.select().from(leads).where(eq(leads.id, leadId));
  return fresh;
}

export async function addNote(ctx: Ctx, leadId: string, body: string) {
  const [lead] = await db.select({ id: leads.id }).from(leads).where(and(eq(leads.id, leadId), eq(leads.workspaceId, ctx.workspaceId))).limit(1);
  if (!lead) return false;
  await db.insert(leadNotes).values({ leadId, workspaceId: ctx.workspaceId, authorId: ctx.userId, body });
  await addActivity(ctx, leadId, "NOTE", body.length > 140 ? body.slice(0, 137) + "…" : body);
  return true;
}

export async function assignLead(ctx: Ctx, leadId: string, userId: string | null) {
  const [lead] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.workspaceId, ctx.workspaceId))).limit(1);
  if (!lead) return false;
  await db.update(leads).set({ assignedTo: userId }).where(eq(leads.id, leadId));
  await addActivity(ctx, leadId, "ASSIGNED", userId ? "Lead reassigned." : "Lead unassigned.", { userId });
  if (userId && userId !== ctx.userId)
    await notify({ workspaceId: ctx.workspaceId, userId, type: "LEAD_ASSIGNED", title: `Lead assigned to you: ${lead.fullName}`, link: `/leads/${leadId}` });
  return true;
}

export async function setVerification(
  ctx: Ctx,
  leadId: string,
  status: "VERIFIED" | "PARTIALLY_VERIFIED" | "UNVERIFIED" | "OUTDATED",
  source: string
) {
  const [lead] = await db.select().from(leads).where(and(eq(leads.id, leadId), eq(leads.workspaceId, ctx.workspaceId))).limit(1);
  if (!lead) return null;
  const now = new Date();
  const stamped = status === "VERIFIED" || status === "PARTIALLY_VERIFIED";
  const fieldSources = { ...lead.fieldSources };
  if (stamped) for (const k of ["email", "jobTitle", "companyName", "companyWebsite", "industry", "linkedinUrl"] as const) if (lead[k]) fieldSources[k] = { source, verifiedAt: now.toISOString() };
  await db
    .update(leads)
    .set({ verification: status, verifiedAt: stamped ? now : lead.verifiedAt, fieldSources })
    .where(eq(leads.id, leadId));
  const [fresh] = await db.select().from(leads).where(eq(leads.id, leadId));
  await scoreAndSave(ctx, fresh);
  await addActivity(ctx, leadId, "VERIFIED", `Verification set to ${status.replace("_", " ").toLowerCase()} (source: ${source}).`, { status, source });
  return fresh;
}

/** Soft delete: the record is archived (kept for audit) and disappears from every list and metric. */
export async function archiveLead(ctx: Ctx, leadId: string) {
  const res = await db
    .update(leads)
    .set({ archivedAt: new Date() })
    .where(and(eq(leads.id, leadId), eq(leads.workspaceId, ctx.workspaceId)))
    .returning({ id: leads.id });
  return res.length > 0;
}
