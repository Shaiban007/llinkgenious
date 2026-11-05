"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/session";
import { toCtx } from "@/lib/ctx";
import { changeStatus } from "@/lib/leads";
import { LEAD_STATUSES, type LeadStatus } from "@/lib/constants";

/** Called by the Kanban board when a card is dropped on a column (or its "Move to" menu is used). */
export async function moveLeadAction(leadId: string, status: string): Promise<{ ok: boolean; error?: string }> {
  const s = await requireSession();
  if (!LEAD_STATUSES.includes(status as LeadStatus)) return { ok: false, error: "Unknown status." };
  const res = await changeStatus(toCtx(s), leadId, status as LeadStatus);
  if (!res) return { ok: false, error: "Lead not found." };
  revalidatePath("/pipeline");
  return { ok: true };
}
