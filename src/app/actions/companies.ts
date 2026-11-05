"use server";

import { and, eq } from "drizzle-orm";
import { companies, db } from "@/db";
import { requireSession } from "@/lib/session";
import { flash } from "@/lib/flash";
import { domainFromUrl, str, strOrNull } from "@/lib/utils";

export async function updateCompanyAction(fd: FormData) {
  const s = await requireSession();
  const id = str(fd.get("id"));
  const name = str(fd.get("name")).trim();
  if (name.length < 2) flash(`/companies/${id}`, { err: "Company name is required." });
  const website = strOrNull(fd.get("website"));
  const res = await db
    .update(companies)
    .set({ name: name.slice(0, 160), website, domain: domainFromUrl(website), industry: strOrNull(fd.get("industry")), size: strOrNull(fd.get("size")), country: strOrNull(fd.get("country")), location: strOrNull(fd.get("location")), businessType: strOrNull(fd.get("businessType")) })
    .where(and(eq(companies.id, id), eq(companies.workspaceId, s.workspace.id)))
    .returning({ id: companies.id });
  if (!res.length) flash("/companies", { err: "Company not found." });
  flash(`/companies/${id}`, { ok: "Company saved." });
}
