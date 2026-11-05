/**
 * Enrichment from the company's OWN public website (no scraping of LinkedIn or any social network).
 * - Only fills fields that are empty — never overwrites what a person typed.
 * - Every value it fills is recorded with its source, and the lead stays "Unverified" until a human checks it.
 * - Server-side requests to private/internal addresses are blocked (SSRF protection).
 */
import dns from "node:dns/promises";
import net from "node:net";
import { and, eq } from "drizzle-orm";
import { db, leads, type Lead } from "@/db";
import { addActivity, scoreAndSave, type Ctx } from "./leads";
import { domainFromUrl } from "./utils";

const FREE_MAIL = new Set(["gmail.com", "yahoo.com", "yahoo.in", "hotmail.com", "outlook.com", "live.com", "aol.com", "icloud.com", "proton.me", "protonmail.com", "rediffmail.com", "gmx.com", "yandex.com", "mail.com"]);

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
}

async function assertPublicHost(hostname: string) {
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) throw new Error("Blocked address");
    return;
  }
  const addrs = await dns.lookup(hostname, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error("Blocked address");
}

async function fetchHtml(url: string): Promise<string> {
  let current = url;
  for (let hop = 0; hop < 3; hop++) {
    const u = new URL(current);
    if (!/^https?:$/.test(u.protocol)) throw new Error("Only web addresses can be checked");
    await assertPublicHost(u.hostname);
    const res = await fetch(u, { redirect: "manual", signal: AbortSignal.timeout(8000), headers: { "User-Agent": "LinkGeniusBot/1.0 (company-website check)", Accept: "text/html" } });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      current = new URL(res.headers.get("location")!, u).toString();
      continue;
    }
    if (!res.ok) throw new Error(`The website answered with status ${res.status}`);
    const type = res.headers.get("content-type") ?? "";
    if (!type.includes("html")) throw new Error("The website did not return a web page");
    const reader = res.body?.getReader();
    if (!reader) return "";
    let html = "";
    const dec = new TextDecoder();
    while (html.length < 400_000) {
      const { value, done } = await reader.read();
      if (done) break;
      html += dec.decode(value, { stream: true });
    }
    reader.cancel().catch(() => {});
    return html;
  }
  throw new Error("Too many redirects");
}

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();

export type EnrichOutcome = { filled: { field: string; value: string; source: string }[]; notes: string[] };

export async function enrichLead(ctx: Ctx, lead: Lead): Promise<EnrichOutcome> {
  const out: EnrichOutcome = { filled: [], notes: [] };
  const patch: Partial<Lead> = {};
  const sources = { ...lead.fieldSources };
  const now = new Date().toISOString();
  const fill = (field: keyof Lead & string, value: string, source: string) => {
    (patch as Record<string, unknown>)[field] = value;
    sources[field] = { source, verifiedAt: now };
    out.filled.push({ field, value, source });
  };

  let website = lead.companyWebsite;
  const emailDomain = lead.email?.split("@")[1]?.toLowerCase();
  if (!website && emailDomain && !FREE_MAIL.has(emailDomain)) {
    website = `https://${emailDomain}`;
    fill("companyWebsite", website, "derived from the email domain");
  } else if (!website) {
    out.notes.push("No company website and the email is a free-mail address, so there was nothing to check.");
  }

  if (website) {
    const url = /^https?:\/\//i.test(website) ? website : `https://${website}`;
    try {
      const html = await fetchHtml(url);
      const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
      const desc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] ?? html.match(/<meta[^>]+content=["']([^"']*)["'][^>]+name=["']description["']/i)?.[1];
      const host = domainFromUrl(url);
      const siteName = html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']*)["']/i)?.[1];
      if (!lead.companyName && (siteName || title)) fill("companyName", decode(siteName ?? title!).slice(0, 120), `company website (${host})`);
      if (!lead.interests && desc) fill("interests", decode(desc).slice(0, 280), `company website description (${host})`);
      if (!lead.email) {
        const mails = [...html.matchAll(/mailto:([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/gi)].map((m) => m[1].toLowerCase());
        const match = mails.find((m) => host && m.endsWith(host.replace(/^www\./, ""))) ?? mails[0];
        if (match) {
          fill("email", match, `published on the company website (${host}) — a general address, check it before emailing`);
        }
      }
      if (!lead.phone) {
        const tel = html.match(/href=["']tel:([+\d][\d\s().-]{6,})["']/i)?.[1];
        if (tel) fill("phone", decode(tel), `published on the company website (${host})`);
      }
      if (!out.filled.length) out.notes.push("The website was reachable but we found nothing new to add.");
    } catch (e) {
      out.notes.push(`Could not read the website: ${e instanceof Error ? e.message : "unknown error"}.`);
    }
  }

  if (out.filled.length) {
    await db
      .update(leads)
      .set({ ...patch, fieldSources: sources })
      .where(and(eq(leads.id, lead.id), eq(leads.workspaceId, ctx.workspaceId)));
    const [fresh] = await db.select().from(leads).where(eq(leads.id, lead.id));
    await scoreAndSave(ctx, fresh);
  }
  await addActivity(ctx, lead.id, "ENRICHED", out.filled.length ? `Enriched from public company information: ${out.filled.map((f) => f.field).join(", ")}. Needs human verification.` : `Enrichment ran — nothing new found. ${out.notes.join(" ")}`, { filled: out.filled });
  return out;
}
