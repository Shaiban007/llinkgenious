"use client";

import { useState } from "react";
import { STATUS_LABEL, LEAD_STATUSES } from "@/lib/constants";

type Op = { value: string; label: string };

export function BulkBar({
  action,
  back,
  ops,
  members,
  lists,
}: {
  action: (fd: FormData) => Promise<void>;
  back: string;
  ops: Op[];
  members: { id: string; name: string }[];
  lists: { id: string; name: string }[];
}) {
  const [op, setOp] = useState(ops[0]?.value ?? "");
  return (
    <div className="flex flex-wrap items-end gap-2 border-b border-navy-100 bg-navy-50/60 px-4 py-3">
      <input type="hidden" name="back" value={back} />
      <label className="text-xs font-semibold text-navy-500">
        With the ticked leads
        <select name="op" value={op} onChange={(e) => setOp(e.target.value)} className="input mt-1 !w-auto">
          {ops.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      {op === "assign" && (
        <label className="text-xs font-semibold text-navy-500">
          Assign to
          <select name="userId" className="input mt-1 !w-auto">
            <option value="">Nobody (unassign)</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {op === "status" && (
        <label className="text-xs font-semibold text-navy-500">
          New status
          <select name="status" className="input mt-1 !w-auto">
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      )}
      {op === "addToList" && (
        <>
          <label className="text-xs font-semibold text-navy-500">
            List
            <select name="listId" className="input mt-1 !w-auto">
              <option value="">— choose —</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-navy-500">
            …or new list
            <input name="newList" placeholder="e.g. Dubai importers" className="input mt-1 !w-48" maxLength={80} />
          </label>
        </>
      )}
      <button
        formAction={action}
        className={op === "archive" ? "btn-danger" : "btn-primary"}
        onClick={(e) => {
          if (op === "archive" && !window.confirm("Archive the ticked leads? They will disappear from lists and reports.")) e.preventDefault();
        }}
      >
        Apply
      </button>
    </div>
  );
}
