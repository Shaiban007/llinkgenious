"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { moveLeadAction } from "@/app/actions/pipeline";
import { LEAD_STATUSES, STATUS_LABEL, type LeadStatus } from "@/lib/constants";
import { cn } from "@/lib/utils";

export type BoardCard = { id: string; name: string; company: string | null; score: number | null; category: string | null; status: LeadStatus; owner: string | null; days: number; value: string | null; stale: boolean };
export type BoardColumn = { key: string; label: string; dropStatus: LeadStatus; total: number; shown: number; valueLabel: string; cards: BoardCard[] };

export function Board({ columns }: { columns: BoardColumn[] }) {
  const [cols, setCols] = useState(columns);
  const [over, setOver] = useState<string | null>(null);
  const [msg, setMsg] = useState("");
  const [, start] = useTransition();

  function move(cardId: string, toKey: string, status: LeadStatus) {
    const from = cols.find((c) => c.cards.some((x) => x.id === cardId));
    const to = cols.find((c) => c.key === toKey);
    if (!from || !to) return;
    const card = from.cards.find((x) => x.id === cardId)!;
    if (from.key === to.key && card.status === status) return;
    const snapshot = cols;
    setCols(
      cols.map((c) => {
        if (c.key === from.key && c.key === to.key) return { ...c, cards: c.cards.map((x) => (x.id === cardId ? { ...x, status, days: 0 } : x)) };
        if (c.key === from.key) return { ...c, total: c.total - 1, shown: c.shown - 1, cards: c.cards.filter((x) => x.id !== cardId) };
        if (c.key === to.key) return { ...c, total: c.total + 1, shown: c.shown + 1, cards: [{ ...card, status, days: 0 }, ...c.cards] };
        return c;
      })
    );
    start(async () => {
      const r = await moveLeadAction(cardId, status);
      if (!r.ok) {
        setCols(snapshot);
        setMsg(r.error ?? "Could not move the lead.");
      } else setMsg(`Moved ${card.name} to ${STATUS_LABEL[status]}.`);
    });
  }

  return (
    <>
      <p role="status" aria-live="polite" className="mb-2 h-5 text-xs text-navy-500">
        {msg}
      </p>
      <div className="flex gap-3 overflow-x-auto pb-4">
        {cols.map((c) => (
          <section
            key={c.key}
            aria-label={c.label}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(c.key);
            }}
            onDragLeave={() => setOver((o) => (o === c.key ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              setOver(null);
              const id = e.dataTransfer.getData("text/plain");
              if (id) move(id, c.key, c.dropStatus);
            }}
            className={cn("w-64 shrink-0 rounded-2xl border bg-navy-50 p-2 transition", over === c.key ? "border-brand-500 bg-brand-50" : "border-navy-100")}
          >
            <header className="flex items-baseline justify-between px-2 pb-2 pt-1">
              <h2 className="text-xs font-bold uppercase tracking-wide text-navy-700">{c.label}</h2>
              <span className="text-xs font-semibold text-navy-500">{c.total}</span>
            </header>
            {c.valueLabel && <p className="px-2 pb-2 text-[11px] text-navy-400">{c.valueLabel}</p>}
            <ul className="space-y-2">
              {c.cards.map((x) => (
                <li
                  key={x.id}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/plain", x.id)}
                  className="cursor-grab rounded-xl border border-navy-100 bg-white p-3 shadow-sm active:cursor-grabbing"
                >
                  <Link href={`/leads/${x.id}`} className="block text-sm font-semibold text-navy-900 hover:text-brand-600">
                    {x.name}
                  </Link>
                  <p className="truncate text-xs text-navy-400">{x.company ?? "No company"}</p>
                  <div className="mt-2 flex items-center justify-between text-[11px] text-navy-500">
                    <span className="rounded-full bg-navy-100 px-2 py-0.5 font-semibold tabular-nums">{x.score ?? "—"}</span>
                    {x.value && <span className="font-semibold text-navy-700">{x.value}</span>}
                    <span className={cn(x.stale && "font-semibold text-rose-600")}>{x.days}d here</span>
                  </div>
                  {x.owner && <p className="mt-1 truncate text-[11px] text-navy-400">{x.owner}</p>}
                  <label className="sr-only" htmlFor={`mv-${x.id}`}>
                    Move {x.name} to
                  </label>
                  <select
                    id={`mv-${x.id}`}
                    value={x.status}
                    onChange={(e) => {
                      const st = e.target.value as LeadStatus;
                      move(x.id, statusToCol(st), st);
                    }}
                    className="mt-2 w-full rounded-md border border-navy-100 bg-navy-50 px-1.5 py-1 text-[11px] text-navy-600"
                  >
                    {LEAD_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {STATUS_LABEL[st]}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
              {c.cards.length === 0 && <li className="rounded-xl border border-dashed border-navy-200 px-3 py-6 text-center text-xs text-navy-400">Drop a lead here</li>}
            </ul>
            {c.total > c.shown && <p className="px-2 pt-2 text-[11px] text-navy-400">Showing the {c.shown} most recent of {c.total}. Use All Leads to see the rest.</p>}
          </section>
        ))}
      </div>
    </>
  );
}

// Mirrors PIPELINE_COLUMNS (kept inline so this client file stays light).
function statusToCol(st: LeadStatus): string {
  if (st === "NEW" || st === "RESEARCHING") return "NEW";
  if (st === "CONTACTED" || st === "FOLLOW_UP_REQUIRED") return "CONTACTED";
  if (st === "NOT_INTERESTED" || st === "DISQUALIFIED") return "LOST";
  if (st === "MEETING_SCHEDULED") return "MEETING";
  if (st === "PROPOSAL_SENT") return "PROPOSAL";
  return st;
}
