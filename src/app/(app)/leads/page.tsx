import Link from "next/link";
import { Download, UserPlus, Upload } from "lucide-react";
import { requireSession } from "@/lib/session";
import { filterQuery, parseFilters, queryLeads } from "@/lib/lead-query";
import { getLists, getMembers } from "@/lib/members";
import { Card, EmptyState, PageHeader } from "@/components/ui";
import { FilterBar } from "@/components/filter-bar";
import { LeadsTable } from "@/components/leads-table";
import { fmtNumber } from "@/lib/utils";

export const metadata = { title: "All Leads" };
export const dynamic = "force-dynamic";

export default async function LeadsPage({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  const s = await requireSession();
  const f = parseFilters(searchParams, "crm");
  const [{ rows, total, pages }, members, lists] = await Promise.all([queryLeads(s.workspace.id, f, s.workspace.settings.scoring, s.user.id), getMembers(s.workspace.id), getLists(s.workspace.id)]);
  const filtered = Object.keys(searchParams).some((k) => !["page", "sort", "dir"].includes(k) && searchParams[k]);

  return (
    <>
      <PageHeader
        title="All Leads"
        subtitle="Every lead that is in your CRM. Leads you found but have not added yet are in the Lead Finder."
        actions={
          <>
            <a href={`/api/export/leads?${filterQuery(f, { page: undefined })}`} className="btn-secondary">
              <Download size={15} /> Export CSV
            </a>
            <Link href="/finder/import" className="btn-secondary">
              <Upload size={15} /> Import
            </Link>
            <Link href="/leads/new" className="btn-primary">
              <UserPlus size={15} /> Add lead
            </Link>
          </>
        }
      />
      <Card>
        <FilterBar filters={f} basePath="/leads" members={members} lists={lists} showStatus />
        <p className="border-b border-navy-100 px-4 py-2 text-xs text-navy-500">
          {fmtNumber(total)} lead{total === 1 ? "" : "s"} {filtered ? "match your filters" : "in your CRM"}
        </p>
        {rows.length === 0 ? (
          <EmptyState
            title={filtered ? "No leads match these filters" : "No leads in your CRM yet"}
            body={filtered ? "Try removing a filter or clearing the search." : "Add a lead by hand, import a CSV, or review leads waiting in the Lead Finder."}
            action={
              <Link href={filtered ? "/leads" : "/leads/new"} className="btn-primary">
                {filtered ? "Clear filters" : "Add your first lead"}
              </Link>
            }
          />
        ) : (
          <LeadsTable rows={rows} filters={f} basePath="/leads" pages={pages} members={members} lists={lists} mode="crm" />
        )}
      </Card>
    </>
  );
}
