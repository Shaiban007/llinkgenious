import Link from "next/link";
import { Search } from "lucide-react";
import type { LeadFilters } from "@/lib/lead-query";
import { LEAD_STATUSES, STATUS_LABEL, VERIFICATION_LABEL } from "@/lib/constants";

/** Plain GET form: every filter lives in the URL, so results can be bookmarked and shared. */
export function FilterBar({
  filters,
  basePath,
  members,
  lists,
  showStatus,
}: {
  filters: LeadFilters;
  basePath: string;
  members: { id: string; name: string }[];
  lists: { id: string; name: string }[];
  showStatus: boolean;
}) {
  return (
    <form method="get" action={basePath} className="space-y-3 border-b border-navy-100 p-4" aria-label="Filter leads">
      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[240px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-navy-300" />
          <input name="q" defaultValue={filters.q} placeholder="Search name, company, email, title, country…" className="input !pl-9" aria-label="Search" />
        </div>
        <button className="btn-primary">Search</button>
        <Link href={basePath} className="btn-secondary">
          Clear
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
        {showStatus && (
          <Sel name="status" label="Status" value={filters.status}>
            <option value="">Any</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Sel>
        )}
        <Sel name="category" label="Priority" value={filters.category}>
          <option value="">Any</option>
          <option value="high">High priority</option>
          <option value="good">Good prospect</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </Sel>
        <Sel name="verification" label="Verification" value={filters.verification}>
          <option value="">Any</option>
          {Object.entries(VERIFICATION_LABEL).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </Sel>
        <Sel name="hasEmail" label="Email" value={filters.hasEmail}>
          <option value="">Any</option>
          <option value="yes">Has email</option>
          <option value="no">No email</option>
        </Sel>
        <Sel name="assigned" label="Owner" value={filters.assigned}>
          <option value="">Anyone</option>
          <option value="me">Me</option>
          <option value="none">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Sel>
        <Sel name="list" label="List" value={filters.list}>
          <option value="">All</option>
          {lists.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Sel>
        <Txt name="industry" label="Industry" value={filters.industry} />
        <Txt name="country" label="Country" value={filters.country} />
        <Txt name="source" label="Source" value={filters.source} />
        <label className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">
          From
          <input type="date" name="from" defaultValue={filters.from} className="input mt-1 normal-case" />
        </label>
        <label className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">
          To
          <input type="date" name="to" defaultValue={filters.to} className="input mt-1 normal-case" />
        </label>
      </div>
    </form>
  );
}

function Sel({ name, label, value, children }: { name: string; label: string; value: string; children: React.ReactNode }) {
  return (
    <label className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">
      {label}
      <select name={name} defaultValue={value} className="input mt-1 normal-case">
        {children}
      </select>
    </label>
  );
}
function Txt({ name, label, value }: { name: string; label: string; value: string }) {
  return (
    <label className="text-[11px] font-semibold uppercase tracking-wide text-navy-500">
      {label}
      <input name={name} defaultValue={value} className="input mt-1 normal-case" />
    </label>
  );
}
