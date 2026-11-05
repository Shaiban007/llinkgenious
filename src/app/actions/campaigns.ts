"use server";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { campaignLeads, campaigns, db, leadListItems, leadLists, leads, outreachEmails } from "@/db";
import { requireSession } from "@/lib/session";
import { toCtx } from "@/lib/ctx";
import { flash } from "@/lib/flash";
import { createDrafts, DEFAULT_BODY, DEFAULT_SUBJECT } from "@/lib/outreach";
import { str, strOrNull } from "@/lib/utils";
import { logAudit } from "@/lib/audit";

function dateOrNull(v: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + "T00:00:00Z") : null;
}

function readCampaign(fd: FormData) {
  return {
    name: str(fd.get("name")).trim(),
    description: strOrNull(fd.get("description")),
    targetIndustry: strOrNull(fd.get("targetIndustry")),
    targetLocation: strOrNull(fd.get("targetLocation")),
    targetTitles: strOrNull(fd.get("targetTitles")),
    startDate: dateOrNull(str(fd.get("startDate"))),
    endDate: dateOrNull(str(fd.get("endDate"))),
    subjectTemplate: str(fd.get("subjectTemplate")).trim() || DEFAULT_SUBJECT,
    bodyTemplate: str(fd.get("bodyTemplate")).trim() || DEFAULT_BODY,
    dailySendLimit: Math.max(1, Math.min(500, Number.parseInt(str(fd.get("dailySendLimit")), 10) || 20)),
  };
}

export async function createCampaignAction(fd: FormData) {
  const s = await requireSession();
  const c = readCampaign(fd);
  if (c.name.length < 3) flash("/campaigns/new", { err: "Give the campaign a name (at least 3 letters)." });
  if (c.startDate && c.endDate && c.endDate < c.startDate) flash("/campaigns/new", { err: "The end date cannot be before the start date." });
  const [row] = await db.insert(campaigns).values({ workspaceId: s.workspace.id, ...c, createdBy: s.user.id, assignedTeam: [s.user.id] }).returning({ id: campaigns.id });
  flash(`/campaigns/${row.id}`, { ok: "Campaign created. Now add leads to it." });
}

export async function updateCampaignAction(fd: FormData) {
  const s = await requireSession();
  const id = str(fd.get("id"));
  const c = readCampaign(fd);
  if (c.name.length < 3) flash(`/campaigns/${id}`, { err: "Give the campaign a name." });
  const r = await db.update(campaigns).set(c).where(and(eq(campaigns.id, id), eq(campaigns.workspaceId, s.workspace.id))).returning({ id: campaigns.id });
  if (!r.length) flash("/campaigns", { err: "Campaign not found." });
  flash(`/campaigns/${id}`, { ok: "Campaign saved. Existing drafts keep their old wording." });
}

export async function setCampaignStatusAction(fd: FormData) {
  const s = await requireSession();
  const id = str(fd.get("id"));
  const status = str(fd.get("status"));
  if (!["DRAFT", "ACTIVE", "PAUSED", "COMPLETED"].includes(status)) flash(`/campaigns/${id}`, { err: "Unknown status." });
  await db.update(campaigns).set({ status: status as "ACTIVE" }).where(and(eq(campaigns.id, id), eq(campaigns.workspaceId, s.workspace.id)));
  await logAudit({ workspaceId: s.workspace.id, userId: s.user.id, action: "CAMPAIGN_STATUS", entity: "campaign", entityId: id, meta: { status } });
  flash(`/campaigns/${id}`, { ok: `Campaign is now ${status.toLowerCase()}.` });
}

export async function deleteCampaignAction(fd: FormData) {
  const s = await requireSession();
  if (!s.isWsAdmin) flash("/campaigns", { err: "Only administrators can delete campaigns." });
  await db.delete(campaigns).where(and(eq(campaigns.id, str(fd.get("id"))), eq(campaigns.workspaceId, s.workspace.id)));
  flash("/campaigns", { ok: "Campaign deleted. Sent emails stay in the outbox history." });
}

/** Adds CRM leads to a campaign: from a list, from the campaign's targeting, or the ticked leads. */
export async function addCampaignLeadsAction(fd: FormData) {
  const s = await requireSession();
  const id = str(fd.get("id"));
  const [c] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.workspaceId, s.workspace.id))).limit(1);
  if (!c) flash("/campaigns", { err: "Campaign not found." });
  const source = str(fd.get("source"));
  const base = and(eq(leads.workspaceId, s.workspace.id), eq(leads.inCrm, true), isNull(leads.archivedAt), sql`${leads.email} is not null`, eq(leads.emailOptOut, false));
  let ids: string[] = [];

  if (source === "list") {
    const listId = str(fd.get("listId"));
    const [l] = await db.select({ id: leadLists.id }).from(leadLists).where(and(eq(leadLists.id, listId), eq(leadLists.workspaceId, s.workspace.id))).limit(1);
    if (!l) flash(`/campaigns/${id}`, { err: "Choose a list." });
    ids = (await db.select({ id: leads.id }).from(leads).innerJoin(leadListItems, eq(leadListItems.leadId, leads.id)).where(and(base, eq(leadListItems.listId, listId)))).map((r) => r.id);
  } else if (source === "targeting") {
    const conds = [base];
    if (c.targetIndustry) conds.push(sql`${leads.industry} ilike ${"%" + c.targetIndustry.replace(/[\\%_]/g, "\\$&") + "%"}`);
    if (c.targetLocation) conds.push(sql`(${leads.country} ilike ${"%" + c.targetLocation.replace(/[\\%_]/g, "\\$&") + "%"} or ${leads.location} ilike ${"%" + c.targetLocation.replace(/[\\%_]/g, "\\$&") + "%"})`);
    const minScore = Number.parseInt(str(fd.get("minScore")), 10);
    if (minScore > 0) conds.push(sql`${leads.score} >= ${minScore}`);
    ids = (await db.select({ id: leads.id }).from(leads).where(and(...conds)).limit(1000)).map((r) => r.id);
  } else {
    const picked = fd.getAll("ids").map(String).filter((v) => /^[0-9a-f-]{36}$/i.test(v));
    if (picked.length) ids = (await db.select({ id: leads.id }).from(leads).where(and(base, inArray(leads.id, picked)))).map((r) => r.id);
  }
  if (!ids.length) flash(`/campaigns/${id}`, { err: "No matching leads with an email address were found. Leads without an email, or marked do-not-email, are never added." });
  await db.insert(campaignLeads).values(ids.map((leadId) => ({ campaignId: id, leadId }))).onConflictDoNothing();
  flash(`/campaigns/${id}`, { ok: `${ids.length} lead${ids.length === 1 ? "" : "s"} added (leads already in the campaign were skipped).` });
}

export async function removeCampaignLeadAction(fd: FormData) {
  const s = await requireSession();
  const id = str(fd.get("id"));
  const [c] = await db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.workspaceId, s.workspace.id))).limit(1);
  if (c) await db.delete(campaignLeads).where(and(eq(campaignLeads.campaignId, id), eq(campaignLeads.leadId, str(fd.get("leadId")))));
  flash(`/campaigns/${id}`, { ok: "Lead removed from the campaign." });
}

/** Writes one personalised DRAFT per campaign lead that does not have an email yet. Nothing is sent. */
export async function generateDraftsAction(fd: FormData) {
  const s = await requireSession();
  const id = str(fd.get("id"));
  const [c] = await db.select().from(campaigns).where(and(eq(campaigns.id, id), eq(campaigns.workspaceId, s.workspace.id))).limit(1);
  if (!c) flash("/campaigns", { err: "Campaign not found." });
  if (!c.subjectTemplate || !c.bodyTemplate) flash(`/campaigns/${id}`, { err: "Write the email template first." });
  const ids = (await db.select({ id: campaignLeads.leadId }).from(campaignLeads).where(eq(campaignLeads.campaignId, id))).map((r) => r.id);
  if (!ids.length) flash(`/campaigns/${id}`, { err: "Add leads to the campaign first." });
  const r = await createDrafts(toCtx(s), { leadIds: ids, subject: c.subjectTemplate!, body: c.bodyTemplate!, campaignId: id });
  const [o] = await db.select({ n: sql<number>`count(*)` }).from(outreachEmails).where(eq(outreachEmails.campaignId, id));
  void o;
  flash(`/campaigns/${id}`, { ok: `${r.created} draft${r.created === 1 ? "" : "s"} written${r.skipped.length ? `; ${r.skipped.length} skipped (${r.skipped[0].reason.toLowerCase()})` : ""}. Review them in the Email Outbox — nothing has been sent.` });
}
