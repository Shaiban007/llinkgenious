import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db, leads, users } from "@/db";
import { requireSession } from "@/lib/session";
import { PIPELINE_COLUMNS } from "@/lib/constants";
import { getMembers } from "@/lib/members";
import { fmtMoney } from "@/lib/utils";
import { PageHeader } from "@/components/ui";
import { Board, type BoardColumn } from "./board";

export const metadata = { title: "Pipeline" };
export const dynamic = "force-dynamic";
const PER_COLUMN = 40;

export default async function PipelinePage({ searchParams }: { searchParams: { owner?: string } }) {
  const s = await requireSession();
  const members = await getMembers(s.workspace.id);
  const owner = searchParams.owner === "me" ? s.user.id : members.find((m) => m.id === searchParams.owner)?.id;
  const base = and(eq(leads.workspaceId, s.workspace.id), isNull(leads.archivedAt), eq(leads.inCrm, true), owner ? eq(leads.assignedTo, owner) : undefined);
  const cur = s.workspace.settings.prefs.defaultCurrency;
  const staleDays = s.workspace.settings.prefs.staleLeadDays;

  const columns: BoardColumn[] = [];
  for (const col of PIPELINE_COLUMNS) {
    const where = and(base, sql`${leads.status} in (${sql.join(col.statuses.map((x) => sql`${x}`), sql`, `)})`);
    const [rows, agg] = await Promise.all([
      db.select({ l: leads, owner: users.name }).from(leads).leftJoin(users, eq(users.id, leads.assignedTo)).where(where).orderBy(desc(leads.stageEnteredAt)).limit(PER_COLUMN),
      db.select({ n: sql<number>`count(*)`, v: sql<string>`coalesce(sum(${leads.dealValue}) filter (where ${leads.dealCurrency} = ${cur}), 0)` }).from(leads).where(where),
    ]);
    const value = Number(agg[0].v);
    columns.push({
      key: col.key,
      label: col.label,
      dropStatus: col.dropStatus,
      total: Number(agg[0].n),
      shown: rows.length,
      valueLabel: value > 0 ? `${fmtMoney(value, cur)} in ${cur}` : "",
      cards: rows.map(({ l, owner: o }) => {
        const days = Math.floor((Date.now() - l.stageEnteredAt.getTime()) / 86400000);
        return {
          id: l.id,
          name: l.fullName,
          company: l.companyName,
          score: l.score,
          category: l.scoreCategory,
          status: l.status,
          owner: o,
          days,
          value: l.dealValue ? fmtMoney(l.dealValue, l.dealCurrency ?? cur) : null,
          stale: days >= staleDays && !["CONVERTED", "NOT_INTERESTED", "DISQUALIFIED"].includes(l.status),
        };
      }),
    });
  }

  return (
    <>
      <PageHeader title="Pipeline" subtitle="Drag a card to another column to change its status — or use the small menu on the card. Every move is saved in the lead’s history." />
      <form method="get" className="mb-4 flex items-end gap-2">
        <label className="text-xs font-semibold text-navy-500">
          Owner
          <select name="owner" defaultValue={searchParams.owner ?? ""} className="input mt-1 !w-auto">
            <option value="">Everyone</option>
            <option value="me">Me</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn-secondary">Apply</button>
      </form>
      <Board key={JSON.stringify(columns.map((c) => c.cards.map((x) => x.id + x.status)))} columns={columns} />
    </>
  );
}
