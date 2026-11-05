import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { companies, db, leads } from "@/db";
import { requireSession } from "@/lib/session";
import { Badge, Card, CardHeader, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ScoreBadge } from "@/components/leads-table";
import { updateCompanyAction } from "@/app/actions/companies";
import { BUSINESS_TYPES, COMPANY_SIZES, COUNTRIES, INDUSTRIES, STATUS_LABEL, STATUS_TONE } from "@/lib/constants";

export const metadata = { title: "Company" };
export const dynamic = "force-dynamic";

export default async function CompanyPage({ params }: { params: { id: string } }) {
  const s = await requireSession();
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) notFound();
  const [c] = await db.select().from(companies).where(and(eq(companies.id, params.id), eq(companies.workspaceId, s.workspace.id))).limit(1);
  if (!c) notFound();
  const people = await db.select().from(leads).where(and(eq(leads.companyId, c.id), eq(leads.workspaceId, s.workspace.id), isNull(leads.archivedAt))).orderBy(desc(leads.score));

  return (
    <>
      <PageHeader title={c.name} subtitle={[c.industry, c.country].filter(Boolean).join(" · ") || "Company"} />
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title={`People at ${c.name}`} subtitle={`${people.length} lead${people.length === 1 ? "" : "s"}`} />
          <ul className="divide-y divide-navy-100">
            {people.length === 0 && <li className="px-5 py-6 text-sm text-navy-400">No active leads at this company.</li>}
            {people.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                <div>
                  <Link href={`/leads/${l.id}`} className="text-sm font-semibold text-navy-900 hover:text-brand-600">
                    {l.fullName}
                  </Link>
                  <p className="text-xs text-navy-400">{l.jobTitle ?? "No job title"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <ScoreBadge score={l.score} category={l.scoreCategory} />
                  {l.inCrm ? <Badge tone={STATUS_TONE[l.status]}>{STATUS_LABEL[l.status]}</Badge> : <Badge tone="bg-brand-100 text-brand-700">In Lead Finder</Badge>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <CardHeader title="Company details" />
          <form action={updateCompanyAction} className="space-y-3 p-5">
            <input type="hidden" name="id" value={c.id} />
            {[
              ["name", "Name", c.name, true],
              ["website", "Website", c.website, false],
              ["location", "City / location", c.location, false],
            ].map(([k, label, v, req]) => (
              <label key={String(k)} className="block">
                <span className="label">{String(label)}</span>
                <input name={String(k)} defaultValue={(v as string) ?? ""} required={Boolean(req)} className="input" />
              </label>
            ))}
            {[
              ["industry", "Industry", c.industry, INDUSTRIES],
              ["size", "Size", c.size, COMPANY_SIZES],
              ["country", "Country", c.country, COUNTRIES],
              ["businessType", "Business type", c.businessType, BUSINESS_TYPES],
            ].map(([k, label, v, opts]) => (
              <label key={String(k)} className="block">
                <span className="label">{String(label)}</span>
                <input name={String(k)} list={`co-${String(k)}`} defaultValue={(v as string) ?? ""} className="input" />
                <datalist id={`co-${String(k)}`}>
                  {(opts as string[]).map((o) => (
                    <option key={o} value={o} />
                  ))}
                </datalist>
              </label>
            ))}
            <SubmitButton className="w-full">Save company</SubmitButton>
          </form>
        </Card>
      </div>
    </>
  );
}
