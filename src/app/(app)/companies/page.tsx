import Link from "next/link";
import { and, asc, count, eq, ilike, sql } from "drizzle-orm";
import { companies, db, leads } from "@/db";
import { requireSession } from "@/lib/session";
import { Card, EmptyState, PageHeader, Pagination } from "@/components/ui";
import { fmtDate } from "@/lib/utils";

export const metadata = { title: "Companies" };
export const dynamic = "force-dynamic";

export default async function CompaniesPage({ searchParams }: { searchParams: { q?: string; page?: string } }) {
  const s = await requireSession();
  const page = Math.max(1, Number(searchParams.page) || 1);
  const q = (searchParams.q ?? "").trim().slice(0, 80);
  const where = and(eq(companies.workspaceId, s.workspace.id), q ? ilike(companies.name, `%${q.replace(/[\\%_]/g, "\\$&")}%`) : undefined);
  const [{ n }] = await db.select({ n: count() }).from(companies).where(where);
  const rows = await db
    .select({ c: companies, leadCount: sql<number>`count(${leads.id}) filter (where ${leads.archivedAt} is null)` })
    .from(companies)
    .leftJoin(leads, eq(leads.companyId, companies.id))
    .where(where)
    .groupBy(companies.id)
    .orderBy(asc(companies.name))
    .limit(25)
    .offset((page - 1) * 25);
  const pages = Math.max(1, Math.ceil(Number(n) / 25));

  return (
    <>
      <PageHeader title="Companies" subtitle="Companies are created automatically from your leads. Open one to see everyone you know there." />
      <Card>
        <form method="get" className="flex gap-2 border-b border-navy-100 p-4">
          <input name="q" defaultValue={q} placeholder="Search company name" className="input max-w-sm" aria-label="Search companies" />
          <button className="btn-primary">Search</button>
          {q && (
            <Link href="/companies" className="btn-secondary">
              Clear
            </Link>
          )}
        </form>
        {rows.length === 0 ? (
          <EmptyState title={q ? "No companies match" : "No companies yet"} body="A company appears here as soon as a lead with a company name is added." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr>
                  <th className="th">Company</th>
                  <th className="th">Industry</th>
                  <th className="th">Country</th>
                  <th className="th">Size</th>
                  <th className="th text-right">Leads</th>
                  <th className="th">Added</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ c, leadCount }) => (
                  <tr key={c.id} className="hover:bg-navy-50/50">
                    <td className="td">
                      <Link href={`/companies/${c.id}`} className="font-semibold text-navy-900 hover:text-brand-600">
                        {c.name}
                      </Link>
                      {c.website && <p className="text-xs text-navy-400">{c.domain ?? c.website}</p>}
                    </td>
                    <td className="td">{c.industry ?? "—"}</td>
                    <td className="td">{c.country ?? "—"}</td>
                    <td className="td">{c.size ?? "—"}</td>
                    <td className="td text-right tabular-nums">{Number(leadCount)}</td>
                    <td className="td text-navy-500">{fmtDate(c.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination page={page} pages={pages} makeHref={(p) => `/companies?${new URLSearchParams({ ...(q ? { q } : {}), page: String(p) })}`} />
      </Card>
    </>
  );
}
