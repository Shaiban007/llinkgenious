"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, leadLists, leads, savedSearches } from "@/db";
import { requireSession } from "@/lib/session";
import { toCtx } from "@/lib/ctx";
import { flash } from "@/lib/flash";
import { logAudit } from "@/lib/audit";
import { createLead, getOrCreateSource, type LeadFields } from "@/lib/leads";
import { enrichLead } from "@/lib/enrich";
import { str } from "@/lib/utils";

const rowSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  jobTitle: z.string().trim().max(120).optional(),
  email: z.string().trim().max(200).optional().refine((v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v), "invalid email"),
  phone: z.string().trim().max(40).optional(),
  linkedinUrl: z.string().trim().max(300).optional(),
  companyName: z.string().trim().max(160).optional(),
  companyWebsite: z.string().trim().max(300).optional(),
  industry: z.string().trim().max(100).optional(),
  companySize: z.string().trim().max(40).optional(),
  country: z.string().trim().max(80).optional(),
  location: z.string().trim().max(120).optional(),
  interests: z.string().trim().max(300).optional(),
});

export type ImportChunkResult = { ok: boolean; error?: string; imported: number; duplicates: number; invalid: number; problems: string[] };

/** Imports one chunk of already-mapped rows. The browser sends large files in chunks of ~200 rows. */
export async function importChunkAction(input: { rows: Record<string, string>[]; fileName: string; destination: "pool" | "crm"; rowOffset: number; confirmed: boolean }): Promise<ImportChunkResult> {
  const s = await requireSession();
  const empty = { imported: 0, duplicates: 0, invalid: 0, problems: [] as string[] };
  if (!input.confirmed) return { ok: false, error: "Please confirm you have the right to use this data.", ...empty };
  if (!Array.isArray(input.rows) || input.rows.length > 500) return { ok: false, error: "Too many rows in one request.", ...empty };
  const ctx = toCtx(s);
  const fileName = (input.fileName || "upload.csv").slice(0, 80).replace(/[^\w .()-]/g, "");
  const source = await getOrCreateSource(ctx, `CSV: ${fileName}`, "CSV_IMPORT");
  const res = { ...empty };
  for (let i = 0; i < input.rows.length; i++) {
    const rowNo = input.rowOffset + i + 2; // +2: header row + 1-based
    const parsed = rowSchema.safeParse(input.rows[i]);
    if (!parsed.success) {
      res.invalid++;
      if (res.problems.length < 15) res.problems.push(`Row ${rowNo}: ${parsed.error.issues[0].path.join(".") || "row"} — ${parsed.error.issues[0].message}`);
      continue;
    }
    const r = await createLead(ctx, { ...parsed.data, sourceLabel: `CSV import: ${fileName}` } as LeadFields, { sourceId: source.id, inCrm: input.destination === "crm" });
    if (r.ok) res.imported++;
    else {
      res.duplicates++;
      if (res.problems.length < 15) res.problems.push(`Row ${rowNo}: skipped — duplicate of ${r.duplicates[0].lead.fullName} (${r.duplicates[0].reason.toLowerCase()})`);
    }
  }
  if (input.rowOffset === 0) await logAudit({ workspaceId: s.workspace.id, userId: s.user.id, action: "CSV_IMPORT_STARTED", meta: { fileName, destination: input.destination, attestedRights: true } });
  return { ok: true, ...res };
}

/* ───────────── saved searches ───────────── */
const FILTER_KEYS = ["q", "category", "verification", "hasEmail", "industry", "country", "source", "list", "from", "to"] as const;

export async function saveSearchAction(fd: FormData) {
  const s = await requireSession();
  const name = str(fd.get("name")).trim();
  if (name.length < 2) flash("/finder", { err: "Give the saved search a name." });
  const filters: Record<string, string> = {};
  for (const k of FILTER_KEYS) {
    const v = str(fd.get(k)).trim();
    if (v) filters[k] = v;
  }
  if (!Object.keys(filters).length) flash("/finder", { err: "Set at least one filter before saving a search." });
  await db.insert(savedSearches).values({ workspaceId: s.workspace.id, userId: s.user.id, name: name.slice(0, 80), filters });
  flash("/finder", { ok: "Search saved." });
}

export async function deleteSearchAction(fd: FormData) {
  const s = await requireSession();
  await db.delete(savedSearches).where(and(eq(savedSearches.id, str(fd.get("id"))), eq(savedSearches.workspaceId, s.workspace.id), eq(savedSearches.userId, s.user.id)));
  flash("/finder", { ok: "Saved search deleted." });
}

export async function deleteListAction(fd: FormData) {
  const s = await requireSession();
  await db.delete(leadLists).where(and(eq(leadLists.id, str(fd.get("id"))), eq(leadLists.workspaceId, s.workspace.id)));
  flash("/finder", { ok: "List deleted. The leads in it were not deleted." });
}

/* ───────────── enrichment ───────────── */
export async function enrichLeadAction(fd: FormData) {
  const s = await requireSession();
  const id = str(fd.get("id"));
  const [lead] = await db.select().from(leads).where(and(eq(leads.id, id), eq(leads.workspaceId, s.workspace.id))).limit(1);
  if (!lead) flash("/leads", { err: "Lead not found." });
  const r = await enrichLead(toCtx(s), lead);
  flash(`/leads/${id}`, r.filled.length ? { ok: `Added ${r.filled.map((f) => f.field).join(", ")} from public company information. Please verify it.` } : { err: r.notes.join(" ") || "Nothing new found." });
}
