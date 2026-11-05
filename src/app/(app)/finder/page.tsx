import Link from "next/link";
import { and, count, desc, eq } from "drizzle-orm";
import { ExternalLink, Trash2, Upload, UserPlus } from "lucide-react";
import { db, leadListItems, leadLists, savedSearches } from "@/db";
import { requireSession } from "@/lib/session";
import { parseFilters, queryLeads } from "@/lib/lead-query";
import { getLists, getMembers } from "@/lib/members";
import { Card, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { FilterBar } from "@/components/filter-bar";
import { LeadsTable } from "@/components/leads-table";
import { SubmitButton } from "@/components/submit-button";
import { deleteListAction, deleteSearchAction, saveSearchAction } from "@/app/actions/finder";
import { BUSINESS_TYPES, COUNTRIES } from "@/lib/constants";
import { fmtNumber } from "@/lib/utils";

export const metadata = { title: "Lead Finder" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function FinderPage({ searchParams }: { searchParams: SP }) {
  const s = await requireSession();
  const f = parseFilters(searchParams, "pool");
  const [{ rows, total, pages }, members, lists, searches, listCounts] = await Promise.all([
    queryLeads(s.workspace.id, f, s.workspace.settings.scoring, s.user.id),
    getMembers(s.workspace.id),
    getLists(s.workspace.id),
    db.select().from(savedSearches).where(and(eq(savedSearches.workspaceId, s.workspace.id), eq(savedSearches.userId, s.user.id))).orderBy(desc(savedSearches.createdAt)),
    db.select({ id: leadListItems.listId, n: count() }).from(leadListItems).innerJoin(leadLists, eq(leadLists.id, leadListItems.listId)).where(eq(leadLists.workspaceId, s.workspace.id)).groupBy(leadListItems.listId),
  ]);
  const counts = new Map(listCounts.map((c) => [c.id, Number(c.n)]));
  const filtersActive = ["q", "category", "verification", "hasEmail", "industry", "country", "source", "list", "from", "to"].some((k) => one(searchParams[k]));

  // Search helper: builds links the person opens and reads themselves. Nothing is scraped.
  const product = one(searchParams.product).trim().slice(0, 60);
  const place = one(searchParams.place).trim().slice(0, 60);
  const kind = one(searchParams.kind).trim().slice(0, 40);
  const q = [product, kind || "importer", place].filter(Boolean).join(" ");
  const enc = encodeURIComponent;

  return (
    <>
      <PageHeader
        title="Lead Finder"
        subtitle="A holding area for leads you have found but not yet decided to work on. Review, score and enrich them here, then add the good ones to your CRM."
        actions={
          <>
            <Link href="/finder/import" className="btn-primary">
              <Upload size={15} /> Import CSV
            </Link>
            <Link href="/leads/new?pool=1" className="btn-secondary">
              <UserPlus size={15} /> Add one by hand
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Find new buyers" subtitle="Authorized sources only — you open the search yourself, copy the details you find, and add them here." />
          <form method="get" className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-4">
            <label className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">
              Product
              <input name="product" defaultValue={product} placeholder="basmati rice, turmeric" className="input mt-1 normal-case" />
            </label>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">
              Buyer type
              <select name="kind" defaultValue={kind} className="input mt-1 normal-case">
                <option value="">Importer</option>
                {BUSINESS_TYPES.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </label>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">
              Country or city
              <input name="place" list="finder-countries" defaultValue={place} placeholder="Dubai, UAE" className="input mt-1 normal-case" />
              <datalist id="finder-countries">
                {COUNTRIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
            <div className="flex items-end">
              <button className="btn-secondary w-full">Build search links</button>
            </div>
          </form>
          {q && (product || place) && (
            <div className="flex flex-wrap gap-2 border-t border-navy-100 px-5 py-4 text-sm">
              <a className="btn-secondary btn-sm" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/search?q=${enc(q)}`}>
                Google <ExternalLink size={12} />
              </a>
              <a className="btn-secondary btn-sm" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/maps/search/${enc(q)}`}>
                Google Maps <ExternalLink size={12} />
              </a>
              <a className="btn-secondary btn-sm" target="_blank" rel="noopener noreferrer" href={`https://www.linkedin.com/search/results/companies/?keywords=${enc(q)}`}>
                LinkedIn companies <ExternalLink size={12} />
              </a>
              <a className="btn-secondary btn-sm" target="_blank" rel="noopener noreferrer" href={`https://www.google.com/search?q=${enc(q + " contact email")}`}>
                Find contact pages <ExternalLink size={12} />
              </a>
              <p className="w-full text-xs text-navy-400">Searching “{q}”. Real buyers have a website, address and a named buyer or purchasing contact — add only those. Use “Add one by hand”, or collect several in a spreadsheet and import it.</p>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader title="Saved searches" subtitle="Reuse a set of filters in one click" />
          <ul className="divide-y divide-navy-100">
            {searches.length === 0 && <li className="px-5 py-4 text-sm text-navy-400">None yet. Set some filters below, then save them.</li>}
            {searches.map((sv) => (
              <li key={sv.id} className="flex items-center justify-between gap-2 px-5 py-2.5">
                <Link href={`/finder?${new URLSearchParams(sv.filters).toString()}`} className="truncate text-sm font-semibold text-brand-600 hover:underline">
                  {sv.name}
                </Link>
                <form action={deleteSearchAction}>
                  <input type="hidden" name="id" value={sv.id} />
                  <button className="text-navy-300 hover:text-rose-600" aria-label={`Delete saved search ${sv.name}`}>
                    <Trash2 size={14} />
                  </button>
                </form>
              </li>
            ))}
          </ul>
          {filtersActive && (
            <form action={saveSearchAction} className="flex gap-2 border-t border-navy-100 p-4">
              {(["q", "category", "verification", "hasEmail", "industry", "country", "source", "list", "from", "to"] as const).map((k) => (f[k] ? <input key={k} type="hidden" name={k} value={f[k]} /> : null))}
              <input name="name" required placeholder="Name this search" className="input" maxLength={80} aria-label="Saved search name" />
              <SubmitButton variant="secondary">Save</SubmitButton>
            </form>
          )}
          {lists.length > 0 && (
            <>
              <div className="border-t border-navy-100 px-5 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-navy-400">Lists</div>
              <ul className="divide-y divide-navy-100">
                {lists.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-2 px-5 py-2.5">
                    <Link href={`/finder?list=${l.id}`} className="truncate text-sm font-semibold text-navy-800 hover:text-brand-600">
                      {l.name} <span className="font-normal text-navy-400">({counts.get(l.id) ?? 0})</span>
                    </Link>
                    <form action={deleteListAction}>
                      <input type="hidden" name="id" value={l.id} />
                      <SubmitButton variant="ghost" size="sm" confirm={`Delete the list “${l.name}”? The leads stay.`}>
                        <Trash2 size={13} />
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      <Card className="mt-5">
        <CardHeader title="Discovered leads" subtitle="Waiting for your decision. Highest score first." />
        <FilterBar filters={f} basePath="/finder" members={members} lists={lists} showStatus={false} />
        <p className="border-b border-navy-100 px-4 py-2 text-xs text-navy-500">
          {fmtNumber(total)} discovered lead{total === 1 ? "" : "s"}
          {filtersActive ? " match your filters" : ""}
        </p>
        {rows.length === 0 ? (
          <EmptyState
            title={filtersActive ? "No discovered leads match these filters" : "Nothing waiting here yet"}
            body={filtersActive ? "Try clearing a filter." : "Import a CSV of buyers or add one by hand. They will appear here with a score, ready for you to review."}
            action={
              <Link href={filtersActive ? "/finder" : "/finder/import"} className="btn-primary">
                {filtersActive ? "Clear filters" : "Import a CSV"}
              </Link>
            }
          />
        ) : (
          <LeadsTable rows={rows} filters={f} basePath="/finder" pages={pages} members={members} lists={lists} mode="pool" />
        )}
      </Card>
    </>
  );
}
