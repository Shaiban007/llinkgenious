/**
 * Automated tests. Run with:  npm test
 * Needs the local database running (npm run db:local). Creates throw-away users/workspaces and deletes them again.
 */
import "../scripts/_env";
import assert from "node:assert/strict";
import { eq, inArray } from "drizzle-orm";
import { db, emailSuppressions, integrations, leads, outreachEmails, users, workspaces } from "@/db";
import { askAssistant } from "@/lib/assistant";
import type { AppSession } from "@/lib/session";
import { scoreLead } from "@/lib/scoring";
import { DEFAULT_SETTINGS, getSettings } from "@/lib/workspace-settings";
import { achievementPct } from "@/lib/kpi-catalog";
import { csvEscape, resolveRange } from "@/lib/utils";
import { decrypt, encrypt } from "@/lib/crypto";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createLead, changeStatus, archiveLead, addToCrm } from "@/lib/leads";
import { parseFilters, queryLeads } from "@/lib/lead-query";
import { computeMetrics } from "@/lib/metrics";
import { createDrafts, makeUnsubscribeToken, parseUnsubscribeToken, renderTemplate, sendApprovedEmail } from "@/lib/outreach";
import { createWorkspace } from "@/lib/workspace";

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
    console.log(`  ✔ ${name}`);
  } catch (e) {
    failed++;
    console.log(`  ✘ ${name}\n      ${e instanceof Error ? e.message : e}`);
  }
}

const S = DEFAULT_SETTINGS.scoring;

async function main() {
  process.env.ENCRYPTION_KEY ||= "a".repeat(64);
  process.env.NEXTAUTH_SECRET ||= "test-secret-value-for-signing-0123456789";

  console.log("\nScoring");
  await test("a strong buyer scores high and explains why", () => {
    const r = scoreLead({ jobTitle: "Procurement Manager", industry: "Food import & distribution", companySize: "51-200", country: "United Arab Emirates", email: "a@b.com", phone: "+971 50 000 0000", companyWebsite: "https://x.com", interests: "basmati rice, turmeric", companyName: "X" }, S);
    assert.ok(r.total >= 60, `score ${r.total}`);
    assert.ok(r.breakdown.every((c) => c.reason.length > 0));
  });
  await test("missing data is never counted as a match", () => {
    const r = scoreLead({}, S);
    assert.ok(r.total <= 5, `empty lead scored ${r.total}`);
    assert.ok(r.breakdown.filter((c) => c.key !== "freshness").every((c) => c.points === 0));
  });
  await test("an off-target lead scores below a target lead", () => {
    const good = scoreLead({ jobTitle: "Buyer", industry: "Rice wholesale", country: "Qatar", companySize: "11-50" }, S).total;
    const bad = scoreLead({ jobTitle: "Intern", industry: "Consumer electronics", country: "Brazil", companySize: "1-10" }, S).total;
    assert.ok(good > bad);
  });
  await test("score is always between 0 and 100", () => {
    const r = scoreLead({ jobTitle: "CEO owner director", industry: "food rice spice import", country: "UAE", companySize: "51-200", email: "a@b.co", phone: "1", companyWebsite: "x.com", interests: "rice turmeric", linkedinUrl: "l", location: "Dubai", companyName: "c", verifiedAt: new Date() }, S);
    assert.ok(r.total >= 0 && r.total <= 100);
  });

  console.log("\nHelpers");
  await test("KPI achievement maths (higher and lower is better)", () => {
    assert.equal(achievementPct(50, 100), 50);
    assert.equal(achievementPct(0, 0), 100);
    assert.equal(achievementPct(5, null), null);
    assert.equal(achievementPct(10, 5, false), 50);
    assert.equal(achievementPct(0, 5, false), 100);
  });
  await test("CSV export neutralises spreadsheet formulas and quotes commas", () => {
    assert.equal(csvEscape("=SUM(A1)"), "'=SUM(A1)");
    assert.equal(csvEscape('a,"b"'), '"a,""b"""');
    assert.equal(csvEscape(null), "");
    assert.equal(csvEscape("+971 50 123 4567"), "+971 50 123 4567"); // real phone numbers stay readable
    assert.equal(csvEscape("+cmd|' /C calc'!A0"), "'+cmd|' /C calc'!A0");
    assert.equal(csvEscape("@SUM(1)"), "'@SUM(1)");
  });
  await test("date ranges: 7 days spans exactly 7 days", () => {
    const r = resolveRange({ range: "7d" }, "Asia/Kolkata", new Date("2026-11-05T10:00:00Z"));
    assert.equal(Math.round((r.to.getTime() - r.from.getTime()) / 86400000), 7);
  });
  await test("encryption round-trips and rejects tampering", () => {
    const c = encrypt("sk-ant-secret");
    assert.notEqual(c, "sk-ant-secret");
    assert.equal(decrypt(c), "sk-ant-secret");
    assert.throws(() => decrypt(c.slice(0, -4) + "AAAA"));
  });
  await test("passwords are hashed and verified", async () => {
    const h = await hashPassword("Correct-Horse-9");
    assert.notEqual(h, "Correct-Horse-9");
    assert.ok(await verifyPassword("Correct-Horse-9", h));
    assert.ok(!(await verifyPassword("wrong", h)));
  });
  await test("email templates fill placeholders and fallbacks", () => {
    assert.equal(renderTemplate("Hi {{firstName|there}}, {{company}}", { firstName: "Sara", company: "Acme" }), "Hi Sara, Acme");
    assert.equal(renderTemplate("Hi {{firstName|there}}", { firstName: "" }), "Hi there");
  });
  await test("unsubscribe links are signed: forged or altered ones are rejected", () => {
    const t = makeUnsubscribeToken("11111111-1111-1111-1111-111111111111", "A@B.com");
    assert.deepEqual(parseUnsubscribeToken(t), { workspaceId: "11111111-1111-1111-1111-111111111111", email: "a@b.com" });
    const [p] = t.split(".");
    assert.equal(parseUnsubscribeToken(`${p}.${"0".repeat(32)}`), null);
    assert.equal(parseUnsubscribeToken("garbage"), null);
  });

  console.log("\nDatabase (workspace isolation, CRM rules, email safety)");
  const tag = `t${Date.now()}`;
  const made: { userIds: string[]; wsIds: string[] } = { userIds: [], wsIds: [] };
  try {
    const mk = async (label: string) => {
      const [u] = await db.insert(users).values({ name: `Test ${label}`, email: `${tag}-${label}@example.invalid`, passwordHash: await hashPassword("x-Test-1234") }).returning();
      const ws = await db.transaction((tx) => createWorkspace(tx, { name: `WS ${label} ${tag}`, ownerId: u.id }));
      made.userIds.push(u.id);
      made.wsIds.push(ws.id);
      return { u, ws, ctx: { workspaceId: ws.id, userId: u.id, settings: getSettings(ws.settings), userName: u.name, companyName: "Test Co", tz: "Asia/Kolkata" } };
    };
    const A = await mk("a");
    const B = await mk("b");
    const win = { from: new Date(Date.now() - 86400000), to: new Date(Date.now() + 86400000) };

    const r1 = await createLead(A.ctx, { fullName: "Alice Buyer", email: "alice@gulf.example", companyName: "Gulf Foods", jobTitle: "Procurement Manager", country: "UAE", industry: "Food import" });
    assert.ok(r1.ok);
    const lead = r1.ok ? r1.lead : null!;

    await test("workspace B cannot see workspace A's leads", async () => {
      const f = parseFilters({}, "crm");
      assert.equal((await queryLeads(B.ws.id, f, getSettings(B.ws.settings).scoring)).total, 0);
      assert.equal((await queryLeads(A.ws.id, f, getSettings(A.ws.settings).scoring)).total, 1);
    });
    await test("duplicates (same email) are blocked", async () => {
      const dup = await createLead(A.ctx, { fullName: "A. Buyer", email: "ALICE@gulf.example" });
      assert.equal(dup.ok, false);
    });
    await test("the same email is allowed in a different workspace", async () => {
      assert.ok((await createLead(B.ctx, { fullName: "Alice Buyer", email: "alice@gulf.example" })).ok);
    });
    await test("discovered (not in CRM) leads never count in metrics until added", async () => {
      const pool = await createLead(A.ctx, { fullName: "Pool Person", email: "pool@x.example" }, { inCrm: false });
      assert.ok(pool.ok);
      let m = await computeMetrics({ workspaceId: A.ws.id }, win, getSettings(A.ws.settings).scoring);
      assert.equal(m.leadsGenerated, 1);
      await addToCrm(A.ctx, [pool.ok ? pool.lead.id : ""]);
      m = await computeMetrics({ workspaceId: A.ws.id }, win, getSettings(A.ws.settings).scoring);
      assert.equal(m.leadsGenerated, 2);
    });
    await test("status changes feed the pipeline metrics", async () => {
      await changeStatus(A.ctx, lead.id, "QUALIFIED");
      await changeStatus(A.ctx, lead.id, "CONVERTED");
      const m = await computeMetrics({ workspaceId: A.ws.id }, win, getSettings(A.ws.settings).scoring);
      assert.equal(m.qualified, 1);
      assert.equal(m.converted, 1);
      assert.ok(m.conversionRate > 0 && m.conversionRate <= 100);
    });
    await test("archived leads disappear from lists and metrics", async () => {
      const x = await createLead(A.ctx, { fullName: "To Archive", email: "arch@x.example" });
      assert.ok(x.ok);
      const before = (await computeMetrics({ workspaceId: A.ws.id }, win, getSettings(A.ws.settings).scoring)).leadsGenerated;
      await archiveLead(A.ctx, x.ok ? x.lead.id : "");
      const after = (await computeMetrics({ workspaceId: A.ws.id }, win, getSettings(A.ws.settings).scoring)).leadsGenerated;
      assert.equal(after, before - 1);
    });
    await test("drafts skip leads without email, opted-out and unsubscribed leads", async () => {
      const noMail = await createLead(A.ctx, { fullName: "No Email" });
      const optOut = await createLead(A.ctx, { fullName: "Opt Out", email: "optout@x.example" });
      const unsub = await createLead(A.ctx, { fullName: "Unsub Person", email: "unsub@x.example" });
      assert.ok(noMail.ok && optOut.ok && unsub.ok);
      await db.update(leads).set({ emailOptOut: true }).where(eq(leads.id, optOut.ok ? optOut.lead.id : ""));
      await db.insert(emailSuppressions).values({ workspaceId: A.ws.id, email: "unsub@x.example", reason: "UNSUBSCRIBED" });
      const ids = [noMail, optOut, unsub].map((r) => (r.ok ? r.lead.id : ""));
      const res = await createDrafts(A.ctx, { leadIds: [...ids, lead.id], subject: "Hello {{firstName|there}}", body: "Body for {{company|your company}}" });
      assert.equal(res.created, 1);
      assert.equal(res.skipped.length, 3);
    });
    await test("an email that no person approved can never be sent", async () => {
      const [d] = await db.select().from(outreachEmails).where(eq(outreachEmails.workspaceId, A.ws.id)).limit(1);
      assert.equal(d.status, "DRAFT");
      const r = await sendApprovedEmail(A.ctx, d.id);
      assert.equal(r.ok, false);
      const [again] = await db.select().from(outreachEmails).where(eq(outreachEmails.id, d.id));
      assert.equal(again.status, "DRAFT");
    });
    await test("workspace B cannot send workspace A's email", async () => {
      const [d] = await db.select().from(outreachEmails).where(eq(outreachEmails.workspaceId, A.ws.id)).limit(1);
      await db.update(outreachEmails).set({ status: "APPROVED", approvedBy: A.u.id }).where(eq(outreachEmails.id, d.id));
      const r = await sendApprovedEmail(B.ctx, d.id);
      assert.equal(r.ok, false);
    });
    await test("AI assistant: tool loop reads real data and saves a DRAFT only (stubbed Anthropic)", async () => {
      const bella = await createLead(A.ctx, { fullName: "Bella Importer", email: "bella@rice.example", companyName: "Bella Rice Co" });
      assert.ok(bella.ok);
      const blead = bella.ok ? bella.lead : lead;
      await db.insert(integrations).values({ workspaceId: A.ws.id, provider: "ANTHROPIC", status: "CONFIGURED", config: { model: "claude-sonnet-5-5" }, secretEnc: encrypt("sk-ant-test") });
      const session = { user: { id: A.u.id, name: A.u.name, email: A.u.email, role: "USER", image: null, emailVerified: true }, workspace: { id: A.ws.id, name: A.ws.name, companyName: "Test Co", industry: null, timezone: "Asia/Kolkata", dateFormat: "dd MMM yyyy", settings: getSettings(A.ws.settings) }, memberRole: "ADMIN", isWsAdmin: true, isPlatformAdmin: false, workspaces: [] } as unknown as AppSession;
      const realFetch = globalThis.fetch;
      let calls = 0;
      let leadSearchResult = "";
      globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
        calls++;
        const body = JSON.parse(String(init?.body));
        assert.equal((init?.headers as Record<string, string>)["x-api-key"], "sk-ant-test");
        const j = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
        if (calls === 1) return j({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "search_leads", input: { query: "Bella" } }] });
        if (calls === 2) {
          leadSearchResult = JSON.stringify(body.messages.at(-1).content[0].content);
          return j({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t2", name: "create_email_draft", input: { lead_id: blead.id, subject: "Basmati supply", body: "Hello Bella, we export basmati rice." } }] });
        }
        return j({ stop_reason: "end_turn", content: [{ type: "text", text: "Done: I saved a draft." }] });
      }) as typeof fetch;
      try {
        const r = await askAssistant(session, [{ role: "user", content: "Draft an email to Bella" }]);
        assert.ok(r.ok);
        if (r.ok) {
          assert.equal(r.reply, "Done: I saved a draft.");
          assert.equal(r.drafts.length, 1);
          assert.deepEqual(r.tools.sort(), ["create_email_draft", "search_leads"]);
        }
        assert.ok(leadSearchResult.includes("Bella Importer"), "tool result contained the real lead");
        const drafts = await db.select().from(outreachEmails).where(eq(outreachEmails.subject, "Basmati supply"));
        assert.equal(drafts.length, 1);
        assert.equal(drafts[0].status, "DRAFT");
        // workspace B's assistant can never read workspace A's lead
        const sessionB = { ...session, workspace: { ...session.workspace, id: B.ws.id, settings: getSettings(B.ws.settings) }, user: { ...session.user, id: B.u.id } } as AppSession;
        await db.insert(integrations).values({ workspaceId: B.ws.id, provider: "ANTHROPIC", status: "CONFIGURED", config: {}, secretEnc: encrypt("sk-ant-test") });
        calls = 0;
        globalThis.fetch = (async () => {
          calls++;
          if (calls === 1) return new Response(JSON.stringify({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "x", name: "get_lead", input: { lead_id: blead.id } }] }), { status: 200 });
          leadSearchResult = "";
          return new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: "ok" }] }), { status: 200 });
        }) as typeof fetch;
        let seen = "";
        const inner = globalThis.fetch;
        globalThis.fetch = (async (u: unknown, init?: RequestInit) => {
          const b = JSON.parse(String(init?.body));
          const last = b.messages.at(-1);
          if (Array.isArray(last.content) && last.content[0]?.type === "tool_result") seen = last.content[0].content;
          return inner(u as string, init);
        }) as typeof fetch;
        await askAssistant(sessionB, [{ role: "user", content: "Show that lead" }]);
        assert.ok(seen.includes("not found"), `cross-workspace read returned: ${seen}`);
      } finally {
        globalThis.fetch = realFetch;
      }
    });
  } finally {
    if (made.wsIds.length) await db.delete(workspaces).where(inArray(workspaces.id, made.wsIds));
    if (made.userIds.length) await db.delete(users).where(inArray(users.id, made.userIds));
  }

  console.log(`\n${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
