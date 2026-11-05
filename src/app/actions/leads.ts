"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db, leadListItems, leadLists, leads, workspaceMembers } from "@/db";
import { requireSession } from "@/lib/session";
import { toCtx } from "@/lib/ctx";
import { flash } from "@/lib/flash";
import { logAudit } from "@/lib/audit";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/constants";
import { addNote, addToCrm, archiveLead, assignLead, changeStatus, createLead, setVerification, updateLead, type LeadFields } from "@/lib/leads";
import { enrichLead } from "@/lib/enrich";
import { str, strOrNull } from "@/lib/utils";

const optionalUrl = z
  .string()
  .trim()
  .max(300)
  .optional()
  .refine((v) => !v || /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/.*)?$/i.test(v), "Enter a valid web address (for example https://example.com)");

const leadSchema = z.object({
  fullName: z.string().trim().min(2, "Full name is required").max(120),
  jobTitle: z.string().trim().max(120).optional(),
  email: z.string().trim().max(200).optional().refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), "Enter a valid email address"),
  phone: z.string().trim().max(40).optional(),
  linkedinUrl: optionalUrl,
  companyName: z.string().trim().max(160).optional(),
  companyWebsite: optionalUrl,
  industry: z.string().trim().max(100).optional(),
  companySize: z.string().trim().max(40).optional(),
  country: z.string().trim().max(80).optional(),
  location: z.string().trim().max(120).optional(),
  seniority: z.string().trim().max(60).optional(),
  department: z.string().trim().max(60).optional(),
  interests: z.string().trim().max(300).optional(),
  sourceLabel: z.string().trim().max(120).optional(),
  dealValue: z.string().trim().optional().refine((v) => !v || /^\d+(\.\d{1,2})?$/.test(v), "Deal value must be a number"),
  dealCurrency: z.string().trim().max(5).optional(),
});

function readLeadForm(fd: FormData) {
  const raw: Record<string, string> = {};
  for (const k of Object.keys(leadSchema.shape)) raw[k] = str(fd.get(k));
  return leadSchema.safeParse(raw);
}

const firstError = (e: z.ZodError) => e.issues[0]?.message ?? "Please check the form.";

/* ───────────── create / edit ───────────── */
export async function createLeadAction(fd: FormData) {
  const s = await requireSession();
  const parsed = readLeadForm(fd);
  if (!parsed.success) flash("/leads/new", { err: firstError(parsed.error) });
  const ctx = toCtx(s);
  const assignedTo = strOrNull(fd.get("assignedTo"));
  if (assignedTo) {
    const [m] = await db.select({ u: workspaceMembers.userId }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, s.workspace.id), eq(workspaceMembers.userId, assignedTo))).limit(1);
    if (!m) flash("/leads/new", { err: "That person is not in this workspace." });
  }
  const data = parsed.data!;
  const toPool = str(fd.get("saveTo")) === "pool";
  const res = await createLead(ctx, { ...data, assignedTo } as LeadFields, { allowDuplicate: fd.get("allowDuplicate") === "on", inCrm: !toPool });
  if (!res.ok) {
    const d = res.duplicates[0];
    flash("/leads/new", { err: `Possible duplicate: ${d.lead.fullName} (${d.reason}). Tick “Create even if it looks like a duplicate” if this is a different person.` });
  }
  await logAudit({ workspaceId: s.workspace.id, userId: s.user.id, action: "LEAD_CREATED", entity: "lead", entityId: res.lead.id });
  revalidatePath("/leads");
  flash(`/leads/${res.lead.id}`, { ok: `${toPool ? "Saved to the Lead Finder (not in the CRM yet)" : "Lead created"}. Score ${res.lead.score}/100.` });
}

export async function updateLeadAction(fd: FormData) {
  const s = await requireSession();
  const id = str(fd.get("id"));
  const parsed = readLeadForm(fd);
  if (!parsed.success) flash(`/leads/${id}/edit`, { err: firstError(parsed.error) });
  const updated = await updateLead(toCtx(s), id, parsed.data as Partial<LeadFields>);
  if (!updated) flash("/leads", { err: "Lead not found." });
  revalidatePath(`/leads/${id}`);
  flash(`/leads/${id}`, { ok: "Lead updated and re-scored." });
}

/* ───────────── single-lead actions ───────────── */
export async function changeStatusAction(fd: FormData) {
  const s = await requireSession();
  const id = str(fd.get("id"));
  const to = str(fd.get("status")) as LeadStatus;
  if (!LEAD_STATUSES.includes(to)) flash(`/leads/${id}`, { err: "Choose a valid status." });
  const res = await changeStatus(toCtx(s), id, to, strOrNull(fd.get("note")) ?? undefined);
  if (!res) flash("/leads", { err: "Lead not found." });
  revalidatePath(`/leads/${id}`);
  const back = str(fd.get("back")) || `/leads/${id}`;
  flash(back.startsWith("/") ? back : `/leads/${id}`, { ok: "Status updated." });
}

export async function addNoteAction(fd: FormData) {
  const s = await requireSession();
  const id = str(fd.get("id"));
  const body = str(fd.get("body")).trim();
  if (!body) flash(`/leads/${id}`, { err: "Write something before saving the note." });
  if (body.length > 4000) flash(`/leads/${id}`, { err: "Notes are limited to 4000 characters." });
  if (!(await addNote(toCtx(s), id, body))) flash("/leads", { err: "Lead not found." });
  flash(`/leads/${id}`, { ok: "Note saved." });
}

export async function assignLeadAction(fd: FormData) {
  const s = await requireSession();
  const id = str(fd.get("id"));
  const userId = strOrNull(fd.get("userId"));
  if (userId) {
    const [m] = await db.select({ u: workspaceMembers.userId }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, s.workspace.id), eq(workspaceMembers.userId, userId))).limit(1);
    if (!m) flash(`/leads/${id}`, { err: "That person is not in this workspace." });
  }
  if (!(await assignLead(toCtx(s), id, userId))) flash("/leads", { err: "Lead not found." });
  flash(`/leads/${id}`, { ok: "Assignment saved." });
}

export async function verifyLeadAction(fd: FormData) {
  const s = await requireSession();
  const id = str(fd.get("id"));
  const status = str(fd.get("verification"));
  const source = str(fd.get("source")).trim();
  if (!["VERIFIED", "PARTIALLY_VERIFIED", "UNVERIFIED", "OUTDATED"].includes(status)) flash(`/leads/${id}`, { err: "Choose a verification status." });
  if ((status === "VERIFIED" || status === "PARTIALLY_VERIFIED") && !source) flash(`/leads/${id}`, { err: "Tell us how you verified this lead (for example “company website” or “phone call”). Verified data must always have a source." });
  if (!(await setVerification(toCtx(s), id, status as "VERIFIED", source || "manual"))) flash("/leads", { err: "Lead not found." });
  flash(`/leads/${id}`, { ok: "Verification saved." });
}

export async function toggleOptOutAction(fd: FormData) {
  const s = await requireSession();
  const id = str(fd.get("id"));
  const optOut = fd.get("optOut") === "1";
  await db.update(leads).set({ emailOptOut: optOut }).where(and(eq(leads.id, id), eq(leads.workspaceId, s.workspace.id)));
  flash(`/leads/${id}`, { ok: optOut ? "This lead will not be emailed." : "Emailing allowed again." });
}

export async function archiveLeadAction(fd: FormData) {
  const s = await requireSession();
  const id = str(fd.get("id"));
  if (await archiveLead(toCtx(s), id)) await logAudit({ workspaceId: s.workspace.id, userId: s.user.id, action: "LEAD_ARCHIVED", entity: "lead", entityId: id });
  revalidatePath("/leads");
  flash("/leads", { ok: "Lead archived. It no longer appears in lists or reports." });
}

/* ───────────── bulk actions (leads list and Lead Finder) ───────────── */
export async function bulkLeadsAction(fd: FormData) {
  const s = await requireSession();
  const back = str(fd.get("back")) || "/leads";
  const safeBack = back.startsWith("/") ? back : "/leads";
  const ids = fd.getAll("ids").map(String).filter((v) => /^[0-9a-f-]{36}$/i.test(v));
  const op = str(fd.get("op"));
  if (!ids.length) flash(safeBack, { err: "Tick at least one lead first." });
  const ctx = toCtx(s);
  // Only ever touch leads of this workspace.
  const owned = (await db.select({ id: leads.id }).from(leads).where(and(eq(leads.workspaceId, s.workspace.id), inArray(leads.id, ids)))).map((r) => r.id);

  if (op === "addToCrm") {
    const n = await addToCrm(ctx, owned);
    flash(safeBack, { ok: `${n} lead${n === 1 ? "" : "s"} added to the CRM.` });
  }
  if (op === "archive") {
    for (const id of owned) await archiveLead(ctx, id);
    flash(safeBack, { ok: `${owned.length} lead${owned.length === 1 ? "" : "s"} archived.` });
  }
  if (op === "assign") {
    const userId = strOrNull(fd.get("userId"));
    if (userId) {
      const [m] = await db.select({ u: workspaceMembers.userId }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, s.workspace.id), eq(workspaceMembers.userId, userId))).limit(1);
      if (!m) flash(safeBack, { err: "That person is not in this workspace." });
    }
    for (const id of owned) await assignLead(ctx, id, userId);
    flash(safeBack, { ok: `${owned.length} lead${owned.length === 1 ? "" : "s"} reassigned.` });
  }
  if (op === "status") {
    const to = str(fd.get("status")) as LeadStatus;
    if (!LEAD_STATUSES.includes(to)) flash(safeBack, { err: "Choose a status." });
    for (const id of owned) await changeStatus(ctx, id, to);
    flash(safeBack, { ok: `${owned.length} lead${owned.length === 1 ? "" : "s"} moved to the new status.` });
  }
  if (op === "enrich") {
    const rows = await db.select().from(leads).where(and(eq(leads.workspaceId, s.workspace.id), inArray(leads.id, owned.slice(0, 25))));
    let filled = 0;
    for (const l of rows) if ((await enrichLead(ctx, l)).filled.length) filled++;
    flash(safeBack, { ok: `Checked ${rows.length} lead${rows.length === 1 ? "" : "s"} (max 25 at a time); ${filled} had new public information added. Verify it before emailing.` });
  }
  if (op === "addToList") {
    const listId = str(fd.get("listId"));
    const newName = str(fd.get("newList")).trim();
    let target = listId;
    if (newName) {
      const [l] = await db.insert(leadLists).values({ workspaceId: s.workspace.id, name: newName.slice(0, 80), createdBy: s.user.id }).returning({ id: leadLists.id });
      target = l.id;
    } else {
      const [l] = await db.select({ id: leadLists.id }).from(leadLists).where(and(eq(leadLists.id, listId), eq(leadLists.workspaceId, s.workspace.id))).limit(1);
      if (!l) flash(safeBack, { err: "Pick a list or type a new list name." });
    }
    if (owned.length) await db.insert(leadListItems).values(owned.map((leadId) => ({ listId: target, leadId }))).onConflictDoNothing();
    flash(safeBack, { ok: `${owned.length} lead${owned.length === 1 ? "" : "s"} added to the list.` });
  }
  flash(safeBack, { err: "Choose an action." });
}

