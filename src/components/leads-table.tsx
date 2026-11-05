import Link from "next/link";
import { ArrowDown, ArrowUp, Mail } from "lucide-react";
import type { Lead } from "@/db";
import { Badge, Pagination } from "./ui";
import { SelectAll } from "./select-all";
import { BulkBar } from "./bulk-bar";
import { bulkLeadsAction } from "@/app/actions/leads";
import { filterQuery, type LeadFilters } from "@/lib/lead-query";
import { STATUS_LABEL, STATUS_TONE, VERIFICATION_LABEL, VERIFICATION_TONE } from "@/lib/constants";
import { CATEGORY_TONE, type ScoreCategory } from "@/lib/scoring";
import { fmtDate } from "@/lib/utils";

type Row = { lead: Lead; assigneeName: string | null };

export function ScoreBadge({ score, category }: { score: number | null; category: string | null }) {
  if (score === null) return <span className="text-navy-300">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="w-7 text-right font-semibold tabular-nums text-navy-900">{score}</span>
      <Badge tone={CATEGORY_TONE[(category as ScoreCategory) ?? "Low Priority"] ?? CATEGORY_TONE["Low Priority"]}>{category ?? "—"}</Badge>
    </span>
  );
}

export function LeadsTable({
  rows,
  filters,
  basePath,
  pages,
  members,
  lists,
  mode,
}: {
  rows: Row[];
  filters: LeadFilters;
  basePath: string;
  pages: number;
  members: { id: string; name: string }[];
  lists: { id: string; name: string }[];
  mode: "crm" | "pool";
}) {
  const back = `${basePath}?${filterQuery(filters)}`;
  const sortLink = (key: string, label: string) => {
    const active = filters.sort === key;
    const dir = active && filters.dir === "desc" ? "asc" : "desc";
    return (
      <Link href={`${basePath}?${filterQuery(filters, { sort: key, dir, page: undefined })}`} className="inline-flex items-center gap-1 hover:text-navy-900">
        {label}
        {active && (filters.dir === "desc" ? <ArrowDown size={11} /> : <ArrowUp size={11} />)}
      </Link>
    );
  };
  const ops =
    mode === "pool"
      ? [
          { value: "addToCrm", label: "Add to CRM" },
          { value: "enrich", label: "Enrich from company website" },
          { value: "addToList", label: "Add to a list" },
          { value: "assign", label: "Assign to…" },
          { value: "archive", label: "Archive (remove)" },
        ]
      : [
          { value: "status", label: "Change status" },
          { value: "assign", label: "Assign to…" },
          { value: "addToList", label: "Add to a list" },
          { value: "archive", label: "Archive" },
        ];

  return (
    <form>
      <BulkBar action={bulkLeadsAction} back={back} ops={ops} members={members} lists={lists} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr>
              <th className="th w-10">
                <SelectAll />
              </th>
              <th className="th">{sortLink("name", "Lead")}</th>
              <th className="th">{sortLink("company", "Company")}</th>
              <th className="th">Country</th>
              <th className="th">{sortLink("score", "Score")}</th>
              <th className="th">{mode === "crm" ? sortLink("status", "Status") : "Verification"}</th>
              <th className="th">Owner</th>
              <th className="th">{mode === "crm" ? sortLink("created", "Added") : sortLink("found", "Found")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ lead: l, assigneeName }) => (
              <tr key={l.id} className="hover:bg-navy-50/50">
                <td className="td">
                  <input type="checkbox" name="ids" value={l.id} aria-label={`Select ${l.fullName}`} className="h-4 w-4 rounded border-navy-300" />
                </td>
                <td className="td">
                  <Link href={`/leads/${l.id}`} className="font-semibold text-navy-900 hover:text-brand-600">
                    {l.fullName}
                  </Link>
                  <p className="flex items-center gap-1 text-xs text-navy-400">
                    {l.jobTitle ?? "No job title"}
                    {l.email && <Mail size={11} aria-label="Has email" />}
                    {l.isDemo && <Badge tone="bg-amber-100 text-amber-800">Demo</Badge>}
                  </p>
                </td>
                <td className="td">
                  {l.companyName ?? "—"}
                  {l.industry && <p className="text-xs text-navy-400">{l.industry}</p>}
                </td>
                <td className="td">{l.country ?? "—"}</td>
                <td className="td">
                  <ScoreBadge score={l.score} category={l.scoreCategory} />
                </td>
                <td className="td">
                  {mode === "crm" ? (
                    <Badge tone={STATUS_TONE[l.status]}>{STATUS_LABEL[l.status]}</Badge>
                  ) : (
                    <Badge tone={VERIFICATION_TONE[l.verification]}>{VERIFICATION_LABEL[l.verification]}</Badge>
                  )}
                </td>
                <td className="td text-navy-500">{assigneeName ?? "—"}</td>
                <td className="td whitespace-nowrap text-navy-500">{fmtDate(mode === "crm" ? l.crmAddedAt : l.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={filters.page} pages={pages} makeHref={(p) => `${basePath}?${filterQuery(filters, { page: p })}`} />
    </form>
  );
}
