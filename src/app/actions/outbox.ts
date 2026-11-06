"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray } from "drizzle-orm";
import { db, outreachEmails } from "@/db";
import { requireSession } from "@/lib/session";
import { toCtx } from "@/lib/ctx";
import { flash } from "@/lib/flash";
import { logAudit } from "@/lib/audit";
import { createDrafts, sendAllApproved, sendApprovedEmail } from "@/lib/outreach";
import { str } from "@/lib/utils";

const back = (fd: FormData, fallback = "/outbox") => (str(fd.get("back")).startsWith("/") ? str(fd.get("back")) : fallback);

export async function createDraftAction(fd: FormData) {
  const s = await requireSession();
  const subject = str(fd.get("subject")).trim();
  const body = str(fd.get("body")).trim();
  const leadIds = fd.getAll("leadId").map(String).filter(Boolean);
  if (!leadIds.length) flash("/outbox/new", { err: "Choose a lead." });
  if (subject.length < 3 || body.length < 10) flash(`/outbox/new?lead=${leadIds[0]}`, { err: "Write a subject and a message." });
  const r = await createDrafts(toCtx(s), { leadIds, subject, body });
  if (!r.created) flash("/outbox/new", { err: r.skipped[0]?.reason ?? "Nothing was created." });
  flash("/outbox", { ok: "Draft saved. Review it and approve it — nothing is sent until you do." });
}

/** Per-email buttons pass the email id with .bind(null, id): a submit button's own name/value is not sent to server actions. */
export async function updateDraftAction(id: string, fd: FormData) {
  const s = await requireSession();
  const subject = str(fd.get(`subject_${id}`)).trim();
  const body = str(fd.get(`body_${id}`)).trim();
  if (subject.length < 3 || body.length < 10) flash(back(fd), { err: "Subject and message cannot be empty." });
  const res = await db
    .update(outreachEmails)
    .set({ subject: subject.slice(0, 200), body: body.slice(0, 8000) })
    .where(and(eq(outreachEmails.id, id), eq(outreachEmails.workspaceId, s.workspace.id), eq(outreachEmails.status, "DRAFT")))
    .returning({ id: outreachEmails.id });
  if (!res.length) flash(back(fd), { err: "Only drafts can be edited." });
  flash(back(fd), { ok: "Draft updated." });
}

/** Approval is the human gate. Only DRAFT emails can be approved, and the approver is recorded. */
export async function approveAction(fd: FormData) {
  const s = await requireSession();
  const ids = fd.getAll("ids").map(String).filter((v) => /^[0-9a-f-]{36}$/i.test(v));
  if (!ids.length) flash(back(fd), { err: "Tick at least one draft." });
  const res = await db
    .update(outreachEmails)
    .set({ status: "APPROVED", approvedBy: s.user.id, approvedAt: new Date(), error: null })
    .where(and(eq(outreachEmails.workspaceId, s.workspace.id), inArray(outreachEmails.id, ids), eq(outreachEmails.status, "DRAFT")))
    .returning({ id: outreachEmails.id });
  await logAudit({ workspaceId: s.workspace.id, userId: s.user.id, action: "EMAIL_APPROVED", meta: { count: res.length } });
  revalidatePath("/outbox");
  flash(back(fd), { ok: `${res.length} email${res.length === 1 ? "" : "s"} approved. Use “Send approved emails” when you are ready.` });
}

export async function rejectAction(fd: FormData) {
  const s = await requireSession();
  const ids = fd.getAll("ids").map(String).filter((v) => /^[0-9a-f-]{36}$/i.test(v));
  if (!ids.length) flash(back(fd), { err: "Tick at least one email." });
  const res = await db
    .update(outreachEmails)
    .set({ status: "REJECTED", error: "Rejected by a person before sending." })
    .where(and(eq(outreachEmails.workspaceId, s.workspace.id), inArray(outreachEmails.id, ids), inArray(outreachEmails.status, ["DRAFT", "APPROVED"])))
    .returning({ id: outreachEmails.id });
  flash(back(fd), { ok: `${res.length} email${res.length === 1 ? "" : "s"} rejected.` });
}

export async function deleteEmailAction(id: string, fd: FormData) {
  const s = await requireSession();
  await db.delete(outreachEmails).where(and(eq(outreachEmails.id, id), eq(outreachEmails.workspaceId, s.workspace.id), inArray(outreachEmails.status, ["DRAFT", "REJECTED", "FAILED"])));
  flash(back(fd), { ok: "Deleted." });
}

export async function sendOneAction(id: string, fd: FormData) {
  const s = await requireSession();
  const r = await sendApprovedEmail(toCtx(s), id);
  revalidatePath("/outbox");
  flash(back(fd), r.ok ? { ok: "Email sent." } : { err: r.error });
}

export async function sendAllApprovedAction(fd: FormData) {
  const s = await requireSession();
  const r = await sendAllApproved(toCtx(s), 50);
  revalidatePath("/outbox");
  if (!r.attempted) flash(back(fd), { err: "There are no approved emails to send." });
  flash(back(fd), r.errors.length ? { err: `${r.sent} sent. ${r.errors[0]}${r.errors.length > 1 ? ` (+${r.errors.length - 1} more problems)` : ""}` } : { ok: `${r.sent} email${r.sent === 1 ? "" : "s"} sent.` });
}

export async function retryFailedAction(id: string, fd: FormData) {
  const s = await requireSession();
  await db.update(outreachEmails).set({ status: "DRAFT", error: null }).where(and(eq(outreachEmails.id, id), eq(outreachEmails.workspaceId, s.workspace.id), eq(outreachEmails.status, "FAILED")));
  flash(back(fd), { ok: "Moved back to drafts. Review and approve it again." });
}
