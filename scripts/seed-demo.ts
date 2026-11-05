/**
 * Adds CLEARLY LABELLED demo leads so you can explore the app before importing real data.
 *   npm run db:seed:demo -- you@example.com            add demo leads to that user's first workspace
 *   npm run db:seed:demo -- you@example.com --remove   delete every demo lead again
 * Demo leads are named "Demo …", use fake ".invalid" emails and show a yellow "Demo" badge.
 * They are never real people and can never be emailed (".invalid" addresses do not exist).
 */
import "./_env";
import { and, eq } from "drizzle-orm";
import { db, leads, users, workspaceMembers, workspaces } from "@/db";
import { changeStatus, createLead } from "@/lib/leads";
import { getSettings } from "@/lib/workspace-settings";
import type { LeadStatus } from "@/lib/constants";

const DEMO: { name: string; title: string; company: string; country: string; industry: string; size: string; interests: string; status: LeadStatus }[] = [
  { name: "Demo Buyer 01", title: "Procurement Manager", company: "Demo Gulf Foods LLC", country: "United Arab Emirates", industry: "Food import & distribution", size: "51-200", interests: "basmati rice, turmeric", status: "QUALIFIED" },
  { name: "Demo Buyer 02", title: "Managing Director", company: "Demo Riyadh Grains Co", country: "Saudi Arabia", industry: "Rice wholesale", size: "11-50", interests: "basmati rice", status: "CONTACTED" },
  { name: "Demo Buyer 03", title: "Sourcing Head", company: "Demo Nordic Spice AB", country: "Sweden", industry: "Spices importer", size: "11-50", interests: "turmeric, organic spices", status: "MEETING_SCHEDULED" },
  { name: "Demo Buyer 04", title: "Purchasing Director", company: "Demo Atlantic Foods Inc", country: "United States", industry: "Food distribution", size: "201-500", interests: "rice, spices", status: "PROPOSAL_SENT" },
  { name: "Demo Buyer 05", title: "Owner", company: "Demo Lagos Staples Ltd", country: "Nigeria", industry: "Rice importer", size: "11-50", interests: "parboiled rice", status: "NEW" },
  { name: "Demo Buyer 06", title: "Category Buyer", company: "Demo Euro Pantry GmbH", country: "Germany", industry: "Retail food", size: "501-1000", interests: "turmeric", status: "RESEARCHING" },
  { name: "Demo Buyer 07", title: "Import Manager", company: "Demo Doha Trading WLL", country: "Qatar", industry: "Food import & distribution", size: "11-50", interests: "basmati rice", status: "CONTACTED" },
  { name: "Demo Buyer 08", title: "Founder", company: "Demo Thames Spices Ltd", country: "United Kingdom", industry: "Spices importer", size: "1-10", interests: "turmeric, curcumin", status: "CONVERTED" },
  { name: "Demo Buyer 09", title: "Intern", company: "Demo Random Gadgets Co", country: "Brazil", industry: "Consumer electronics", size: "1-10", interests: "", status: "NEW" },
  { name: "Demo Buyer 10", title: "Procurement Lead", company: "Demo Kuwait Fresh WLL", country: "Kuwait", industry: "Rice wholesale", size: "51-200", interests: "basmati rice", status: "NOT_INTERESTED" },
  { name: "Demo Buyer 11", title: "Director", company: "Demo Bangkok Foods Co", country: "Thailand", industry: "Food import & distribution", size: "51-200", interests: "turmeric", status: "QUALIFIED" },
  { name: "Demo Buyer 12", title: "Buyer", company: "Demo Maple Grocers", country: "Canada", industry: "Retail food", size: "201-500", interests: "rice", status: "NEW" },
];

async function main() {
  const email = process.argv[2]?.toLowerCase();
  const remove = process.argv.includes("--remove");
  if (!email || email.startsWith("--")) {
    console.error("Usage: npm run db:seed:demo -- your-login-email@example.com [--remove]");
    process.exit(1);
  }
  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!u) return void console.error(`No user with email ${email}. Register in the app first.`);
  const [m] = await db.select({ ws: workspaces }).from(workspaceMembers).innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId)).where(eq(workspaceMembers.userId, u.id)).limit(1);
  if (!m) return void console.error("That user has no workspace.");
  const ws = m.ws;

  if (remove) {
    const gone = await db.delete(leads).where(and(eq(leads.workspaceId, ws.id), eq(leads.isDemo, true))).returning({ id: leads.id });
    console.log(`✔ Removed ${gone.length} demo leads from "${ws.name}".`);
    return;
  }
  const ctx = { workspaceId: ws.id, userId: u.id, settings: getSettings(ws.settings) };
  let added = 0;
  for (const [i, d] of DEMO.entries()) {
    const res = await createLead(
      ctx,
      { fullName: d.name, jobTitle: d.title, companyName: d.company, country: d.country, industry: d.industry, companySize: d.size, interests: d.interests || null, email: `demo${i + 1}@example.invalid`, sourceLabel: "DEMO DATA", assignedTo: u.id },
      { isDemo: true, createdAtOverride: new Date(Date.now() - (i + 1) * 3 * 86400000) }
    );
    if (!res.ok) continue;
    added++;
    if (d.status !== "NEW") await changeStatus(ctx, res.lead.id, d.status, "Demo data");
  }
  const demoIds = (await db.select({ id: leads.id }).from(leads).where(and(eq(leads.workspaceId, ws.id), eq(leads.isDemo, true)))).map((r) => r.id);
  console.log(`✔ Added ${added} demo leads (${demoIds.length} demo leads in total) to "${ws.name}". They show a yellow "Demo" badge.`);
  console.log(`  Remove them any time with:  npm run db:seed:demo -- ${email} --remove`);
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
