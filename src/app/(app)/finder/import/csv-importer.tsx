"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import Papa from "papaparse";
import { importChunkAction, type ImportChunkResult } from "@/app/actions/finder";

const FIELDS: { key: string; label: string; hints: string[] }[] = [
  { key: "fullName", label: "Full name *", hints: ["full name", "name", "contact", "contact name", "person"] },
  { key: "firstName", label: "First name (joined with last name)", hints: ["first name", "firstname", "given name"] },
  { key: "lastName", label: "Last name (joined with first name)", hints: ["last name", "lastname", "surname", "family name"] },
  { key: "jobTitle", label: "Job title", hints: ["job title", "title", "designation", "position", "role"] },
  { key: "email", label: "Email", hints: ["email", "e-mail", "email address", "mail"] },
  { key: "phone", label: "Phone", hints: ["phone", "mobile", "telephone", "tel", "whatsapp", "contact number"] },
  { key: "linkedinUrl", label: "LinkedIn URL", hints: ["linkedin", "linkedin url", "linkedin profile"] },
  { key: "companyName", label: "Company", hints: ["company", "company name", "organisation", "organization", "business", "firm"] },
  { key: "companyWebsite", label: "Website", hints: ["website", "web", "url", "domain", "site"] },
  { key: "industry", label: "Industry", hints: ["industry", "sector", "business type"] },
  { key: "companySize", label: "Company size", hints: ["company size", "size", "employees", "headcount"] },
  { key: "country", label: "Country", hints: ["country", "nation"] },
  { key: "location", label: "City / location", hints: ["city", "location", "address", "region", "state"] },
  { key: "interests", label: "What they buy", hints: ["interests", "products", "product", "buys", "notes", "commodity"] },
];

const SAMPLE = "Full name,Job title,Email,Phone,Company,Website,Industry,Country,What they buy\nJane Example,Procurement Manager,jane@example-foods.com,+971 4 000 0000,Example Foods LLC,https://example-foods.com,Food Import,United Arab Emirates,basmati rice; turmeric\n";

const norm = (s: string) => s.toLowerCase().replace(/[_-]/g, " ").trim();

export function CsvImporter() {
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [map, setMap] = useState<Record<string, string>>({});
  const [dest, setDest] = useState<"pool" | "crm">("pool");
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ imported: number; duplicates: number; invalid: number; problems: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function onFile(f: File | undefined) {
    setErr("");
    setResult(null);
    if (!f) return;
    if (!/\.csv$/i.test(f.name)) return setErr("Please choose a .csv file. In Excel use File → Save As → CSV.");
    if (f.size > 5 * 1024 * 1024) return setErr("That file is larger than 5 MB. Split it into smaller files.");
    Papa.parse<Record<string, string>>(f, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (r) => {
        const hs = (r.meta.fields ?? []).filter(Boolean);
        if (!hs.length || !r.data.length) return setErr("The file looks empty. The first row must contain column names.");
        if (r.data.length > 5000) return setErr("A maximum of 5,000 rows per file is supported. Split the file and import it in parts.");
        setFileName(f.name);
        setHeaders(hs);
        setRows(r.data);
        const m: Record<string, string> = {};
        for (const fld of FIELDS) {
          const hit = hs.find((h) => fld.hints.includes(norm(h)));
          if (hit) m[fld.key] = hit;
        }
        setMap(m);
      },
      error: () => setErr("Could not read that file."),
    });
  }

  const mapped = (row: Record<string, string>) => {
    const o: Record<string, string> = {};
    for (const fld of FIELDS) {
      if (fld.key === "firstName" || fld.key === "lastName") continue;
      const col = map[fld.key];
      if (col) o[fld.key] = (row[col] ?? "").trim();
    }
    if (!o.fullName) o.fullName = [map.firstName && row[map.firstName], map.lastName && row[map.lastName]].filter(Boolean).join(" ").trim();
    return o;
  };

  const canImport = rows.length > 0 && (map.fullName || map.firstName) && ok && !busy;

  async function run() {
    setBusy(true);
    setErr("");
    setProgress(0);
    const total = { imported: 0, duplicates: 0, invalid: 0, problems: [] as string[] };
    const payload = rows.map(mapped);
    const SIZE = 200;
    for (let i = 0; i < payload.length; i += SIZE) {
      let r: ImportChunkResult;
      try {
        r = await importChunkAction({ rows: payload.slice(i, i + SIZE), fileName, destination: dest, rowOffset: i, confirmed: ok });
      } catch {
        setErr("The connection was interrupted. Rows imported so far are saved — re-importing is safe because duplicates are skipped.");
        break;
      }
      if (!r.ok) {
        setErr(r.error ?? "Import failed.");
        break;
      }
      total.imported += r.imported;
      total.duplicates += r.duplicates;
      total.invalid += r.invalid;
      total.problems.push(...r.problems);
      setProgress(Math.min(100, Math.round(((i + SIZE) / payload.length) * 100)));
    }
    setResult({ ...total, problems: total.problems.slice(0, 25) });
    setBusy(false);
  }

  if (result)
    return (
      <div className="card p-6">
        <h2 className="text-lg font-bold text-navy-900">Import finished</h2>
        <ul className="mt-3 space-y-1 text-sm text-navy-700">
          <li>
            <strong>{result.imported}</strong> new lead{result.imported === 1 ? "" : "s"} saved {dest === "crm" ? "to the CRM" : "to the Lead Finder"}
          </li>
          <li>
            <strong>{result.duplicates}</strong> skipped as duplicates
          </li>
          <li>
            <strong>{result.invalid}</strong> skipped because of problems
          </li>
        </ul>
        {result.problems.length > 0 && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-semibold text-navy-700">See what was skipped</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-navy-600">
              {result.problems.map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </details>
        )}
        {err && <p className="mt-3 text-sm text-rose-700">{err}</p>}
        <div className="mt-5 flex gap-2">
          <Link href={dest === "crm" ? "/leads" : "/finder"} className="btn-primary">
            View the leads
          </Link>
          <button className="btn-secondary" onClick={() => { setResult(null); setRows([]); setHeaders([]); setFileName(""); if (fileRef.current) fileRef.current.value = ""; }}>
            Import another file
          </button>
        </div>
      </div>
    );

  return (
    <div className="space-y-5">
      {err && <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{err}</div>}

      <section className="card p-5">
        <h2 className="text-sm font-semibold text-navy-900">1. Choose your CSV file</h2>
        <p className="mt-1 text-xs text-navy-400">The first row must be column names. Maximum 5 MB / 5,000 rows. The file is read in your browser; only the cleaned rows are sent to the server.</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={(e) => onFile(e.target.files?.[0])} className="text-sm" aria-label="CSV file" />
          <a className="text-xs font-semibold text-brand-600 hover:underline" href={`data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE)}`} download="leads-template.csv">
            Download a sample template
          </a>
        </div>
      </section>

      {rows.length > 0 && (
        <>
          <section className="card p-5">
            <h2 className="text-sm font-semibold text-navy-900">2. Match your columns</h2>
            <p className="mt-1 text-xs text-navy-400">
              We found <strong>{rows.length}</strong> rows in “{fileName}”. Check that each field points at the right column.
            </p>
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {FIELDS.map((f) => (
                <label key={f.key} className="block text-xs font-semibold text-navy-500">
                  {f.label}
                  <select className="input mt-1" value={map[f.key] ?? ""} onChange={(e) => setMap({ ...map, [f.key]: e.target.value })}>
                    <option value="">— don’t import —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {!map.fullName && !map.firstName && <p className="mt-3 text-sm font-semibold text-rose-700">Choose which column holds the person’s name.</p>}
          </section>

          <section className="card overflow-x-auto">
            <h2 className="px-5 pt-5 text-sm font-semibold text-navy-900">Preview (first 5 rows, as they will be saved)</h2>
            <table className="mt-3 w-full min-w-[700px]">
              <thead>
                <tr>
                  {["fullName", "jobTitle", "email", "companyName", "country"].map((k) => (
                    <th key={k} className="th">
                      {FIELDS.find((f) => f.key === k)?.label.replace(" *", "")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 5).map((r, i) => {
                  const m = mapped(r);
                  return (
                    <tr key={i}>
                      {["fullName", "jobTitle", "email", "companyName", "country"].map((k) => (
                        <td key={k} className="td">
                          {m[k] || <span className="text-navy-300">—</span>}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section className="card space-y-4 p-5">
            <h2 className="text-sm font-semibold text-navy-900">3. Where should they go?</h2>
            <div className="space-y-2 text-sm text-navy-700">
              <label className="flex items-start gap-2">
                <input type="radio" checked={dest === "pool"} onChange={() => setDest("pool")} className="mt-1" />
                <span>
                  <strong>Lead Finder (recommended)</strong> — review and score them first, then add the good ones to the CRM. They are not counted in reports until you do.
                </span>
              </label>
              <label className="flex items-start gap-2">
                <input type="radio" checked={dest === "crm"} onChange={() => setDest("crm")} className="mt-1" />
                <span>
                  <strong>CRM right away</strong> — use this for contacts you already know and want to work on today.
                </span>
              </label>
            </div>
            <label className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>I confirm this data comes from my own contacts, a list I have the right to use, or public business information — and that I will honour unsubscribe requests.</span>
            </label>
            <div className="flex items-center gap-3">
              <button className="btn-primary" disabled={!canImport} onClick={run}>
                {busy ? `Importing… ${progress}%` : `Import ${rows.length} rows`}
              </button>
              {busy && <span className="text-xs text-navy-400">Please keep this page open.</span>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
