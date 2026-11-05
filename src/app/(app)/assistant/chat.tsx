"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Send, Sparkles } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string; tools?: string[]; drafts?: { leadId: string; name: string; subject: string }[]; error?: boolean };

const TOOL_LABEL: Record<string, string> = { get_metrics: "dashboard numbers", pipeline_summary: "pipeline", search_leads: "lead search", get_lead: "a lead record", kpi_summary: "KPIs", create_email_draft: "email draft" };

export function Chat({ suggestions }: { suggestions: string[] }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), [msgs, busy]);

  async function send(q: string) {
    const question = q.trim();
    if (!question || busy) return;
    const next: Msg[] = [...msgs, { role: "user", content: question }];
    setMsgs(next);
    setText("");
    setBusy(true);
    try {
      const r = await fetch("/api/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ messages: next.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content })) }) });
      const j = await r.json();
      setMsgs([...next, j.ok ? { role: "assistant", content: j.reply, tools: j.tools, drafts: j.drafts } : { role: "assistant", content: j.error ?? "Something went wrong.", error: true }]);
    } catch {
      setMsgs([...next, { role: "assistant", content: "Could not reach the server. Check your connection.", error: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card flex h-[calc(100vh-250px)] min-h-[420px] flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-5" aria-live="polite">
        {msgs.length === 0 && (
          <div className="mx-auto max-w-xl pt-6 text-center">
            <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-violet-100 text-violet-600"><Sparkles size={20} /></span>
            <p className="mt-3 font-semibold text-navy-900">Ask about your leads, pipeline or team</p>
            <p className="mt-1 text-sm text-navy-500">Answers come from your real workspace data. Email drafts are saved in the Outbox for you to approve; nothing is sent automatically.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => <button key={s} type="button" onClick={() => send(s)} className="rounded-full border border-navy-200 px-3 py-1.5 text-sm text-navy-700 hover:bg-navy-50">{s}</button>)}
            </div>
          </div>
        )}
        {msgs.map((m, i) => (
          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === "user" ? "bg-brand-600 text-white" : m.error ? "bg-red-50 text-red-800" : "bg-navy-50 text-navy-900"}`}>
              {m.content}
              {!!m.drafts?.length && (
                <div className="mt-3 rounded-lg border border-navy-200 bg-white p-3 text-navy-800">
                  <p className="text-xs font-semibold uppercase tracking-wide text-navy-400">Drafts saved (not sent)</p>
                  <ul className="mt-1 space-y-0.5">{m.drafts.map((d, j) => <li key={j}>{d.name}: “{d.subject}”</li>)}</ul>
                  <Link href="/outbox" className="mt-2 inline-block font-semibold text-brand-600 hover:underline">Review and approve in the Outbox →</Link>
                </div>
              )}
              {!!m.tools?.length && <p className="mt-2 text-[11px] text-navy-400">Looked at: {m.tools.map((t) => TOOL_LABEL[t] ?? t).join(", ")}</p>}
            </div>
          </div>
        ))}
        {busy && <div className="flex justify-start"><div className="rounded-2xl bg-navy-50 px-4 py-2.5 text-sm text-navy-500">Looking at your data…</div></div>}
        <div ref={end} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(text); }} className="flex gap-2 border-t border-navy-100 p-3">
        <input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="Ask a question…" className="input flex-1" aria-label="Your question" />
        <button className="btn-primary" disabled={busy || !text.trim()}><Send size={15} /> Send</button>
      </form>
      {msgs.length > 0 && <button type="button" onClick={() => setMsgs([])} className="border-t border-navy-100 py-2 text-xs text-navy-400 hover:text-navy-700">Clear conversation</button>}
    </div>
  );
}
