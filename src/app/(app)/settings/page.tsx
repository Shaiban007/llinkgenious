import Link from "next/link";
import { eq } from "drizzle-orm";
import { db, users } from "@/db";
import { requireSession } from "@/lib/session";
import { COUNTRIES, INDUSTRIES } from "@/lib/constants";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { PasswordInput } from "@/components/password-input";
import { changePasswordAction, rescoreAllAction, signOutEverywhereAction, updateEmailSettingsAction, updatePrefsAction, updateProfileAction, updateScoringAction, updateWorkspaceAction } from "@/app/actions/settings";
import { cn } from "@/lib/utils";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

const TABS = [
  ["profile", "Profile"],
  ["security", "Password & security"],
  ["workspace", "Workspace"],
  ["scoring", "Scoring & ideal customer"],
  ["email", "Email sending"],
  ["notifications", "Notifications"],
] as const;
const ADMIN_TABS = ["workspace", "scoring", "email", "notifications"];

export default async function SettingsPage({ searchParams }: { searchParams: { tab?: string } }) {
  const s = await requireSession();
  const tab = TABS.some(([k]) => k === searchParams.tab) ? searchParams.tab! : "profile";
  const [u] = await db.select().from(users).where(eq(users.id, s.user.id)).limit(1);
  const st = s.workspace.settings;
  const adminOnly = ADMIN_TABS.includes(tab) && !s.isWsAdmin;

  return (
    <>
      <PageHeader title="Settings" subtitle="Your profile and how this workspace works." />
      <div className="mb-5 flex flex-wrap gap-1">
        {TABS.map(([k, label]) => (
          <Link key={k} href={`/settings?tab=${k}`} className={cn("rounded-lg px-3 py-2 text-sm font-semibold", tab === k ? "bg-navy-900 text-white" : "bg-white text-navy-600 hover:bg-navy-100")}>
            {label}
          </Link>
        ))}
      </div>

      {adminOnly && <Card><div className="p-6 text-sm text-navy-600">Only workspace administrators can change these settings. Ask your administrator.</div></Card>}

      {tab === "profile" && (
        <Card className="max-w-2xl">
          <CardHeader title="Your profile" />
          <form action={updateProfileAction} className="space-y-4 p-5">
            <label className="block"><span className="label">Name</span><input name="name" defaultValue={u.name} required className="input" /></label>
            <label className="block"><span className="label">Email (cannot be changed here)</span><input value={u.email} disabled className="input" readOnly /></label>
            <label className="block"><span className="label">Job title</span><input name="jobTitle" defaultValue={u.jobTitle ?? ""} className="input" /></label>
            <label className="block"><span className="label">Country</span><input name="country" list="set-countries" defaultValue={u.country ?? ""} className="input" /><datalist id="set-countries">{COUNTRIES.map((c) => <option key={c} value={c} />)}</datalist></label>
            <SubmitButton>Save profile</SubmitButton>
          </form>
        </Card>
      )}

      {tab === "security" && (
        <div className="grid max-w-4xl grid-cols-1 gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title="Change password" subtitle="You will be logged out everywhere afterwards." />
            <form action={changePasswordAction} className="space-y-4 p-5">
              <label className="block"><span className="label">Current password</span><PasswordInput name="current" required autoComplete="current-password" /></label>
              <label className="block"><span className="label">New password</span><PasswordInput name="password" required minLength={10} autoComplete="new-password" /></label>
              <label className="block"><span className="label">Confirm new password</span><PasswordInput name="confirm" required autoComplete="new-password" /></label>
              <p className="text-xs text-navy-400">At least 10 characters with an uppercase letter, a lowercase letter and a number.</p>
              <SubmitButton>Change password</SubmitButton>
            </form>
          </Card>
          <Card>
            <CardHeader title="Sessions" subtitle="Lost a laptop or used a shared computer?" />
            <form action={signOutEverywhereAction} className="p-5">
              <SubmitButton variant="danger" confirm="Log out of every device, including this one?">Log out of all devices</SubmitButton>
            </form>
          </Card>
        </div>
      )}

      {tab === "workspace" && s.isWsAdmin && (
        <Card className="max-w-2xl">
          <CardHeader title="Workspace" />
          <form action={updateWorkspaceAction} className="space-y-4 p-5">
            <label className="block"><span className="label">Workspace name</span><input name="name" defaultValue={s.workspace.name} required className="input" /></label>
            <label className="block"><span className="label">Company name</span><input name="companyName" defaultValue={s.workspace.companyName ?? ""} className="input" /><span className="mt-1 block text-xs text-navy-400">Used as {"{{senderCompany}}"} in email templates.</span></label>
            <label className="block"><span className="label">Industry</span><input name="industry" list="set-ind" defaultValue={s.workspace.industry ?? ""} className="input" /><datalist id="set-ind">{INDUSTRIES.map((c) => <option key={c} value={c} />)}</datalist></label>
            <div className="grid grid-cols-2 gap-4">
              <label className="block"><span className="label">Timezone</span><input name="timezone" defaultValue={s.workspace.timezone} className="input" /></label>
              <label className="block"><span className="label">Default currency</span><input name="currency" defaultValue={st.prefs.defaultCurrency} maxLength={3} className="input" /></label>
            </div>
            <SubmitButton>Save workspace</SubmitButton>
          </form>
        </Card>
      )}

      {tab === "scoring" && s.isWsAdmin && (
        <form action={updateScoringAction} className="max-w-4xl space-y-5">
          <Card>
            <CardHeader title="Score weights (must add up to 100)" subtitle="How many of the 100 points each question is worth." />
            <div className="grid grid-cols-2 gap-4 p-5 md:grid-cols-4">
              {([["industry", "Industry match"], ["designation", "Job title match"], ["companySize", "Company size"], ["location", "Location"], ["icp", "Ideal-customer fit"], ["information", "Complete information"], ["freshness", "Data freshness"]] as const).map(([k, label]) => (
                <label key={k} className="block"><span className="label">{label}</span><input type="number" min={0} max={100} name={`w_${k}`} defaultValue={st.scoring.weights[k]} className="input" /></label>
              ))}
            </div>
          </Card>
          <Card>
            <CardHeader title="Priority bands" subtitle="Score at or above → label" />
            <div className="grid grid-cols-2 gap-4 p-5 md:grid-cols-4">
              <label className="block"><span className="label">High priority from</span><input type="number" name="t_high" defaultValue={st.scoring.thresholds.high} className="input" /></label>
              <label className="block"><span className="label">Good prospect from</span><input type="number" name="t_good" defaultValue={st.scoring.thresholds.good} className="input" /></label>
              <label className="block"><span className="label">Medium from</span><input type="number" name="t_medium" defaultValue={st.scoring.thresholds.medium} className="input" /></label>
              <label className="block"><span className="label">Data counts as fresh for (days)</span><input type="number" name="freshnessDays" defaultValue={st.scoring.freshnessDays} className="input" /></label>
            </div>
          </Card>
          <Card>
            <CardHeader title="Your ideal customer" subtitle="Comma-separated words. A lead scores when its details contain one of them. Edit these to describe the buyers you want." />
            <div className="space-y-4 p-5">
              {([["industries", "Industries / business types", st.scoring.icp.industries], ["titles", "Job titles", st.scoring.icp.titles], ["sizes", "Company sizes", st.scoring.icp.sizes], ["locations", "Countries / cities", st.scoring.icp.locations], ["keywords", "Interest keywords (what they buy)", st.scoring.icp.keywords]] as const).map(([k, label, v]) => (
                <label key={k} className="block"><span className="label">{label}</span><textarea name={`icp_${k}`} rows={2} defaultValue={v.join(", ")} className="input" /></label>
              ))}
            </div>
          </Card>
          <div className="flex gap-2">
            <SubmitButton>Save scoring rules</SubmitButton>
          </div>
        </form>
      )}
      {tab === "scoring" && s.isWsAdmin && (
        <form action={rescoreAllAction} className="mt-3">
          <SubmitButton variant="secondary" pendingText="Re-scoring…" confirm="Re-calculate the score of every lead with the saved rules?">Re-score all leads with the saved rules</SubmitButton>
        </form>
      )}

      {tab === "email" && s.isWsAdmin && (
        <Card className="max-w-3xl">
          <CardHeader title="Email sending" subtitle="Used in every outreach email. The postal address and unsubscribe link are legally required in most countries." />
          <form action={updateEmailSettingsAction} className="space-y-4 p-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block"><span className="label">From name</span><input name="fromName" defaultValue={st.email.fromName} className="input" placeholder="Asif Halari — Midas Trading House" /></label>
              <label className="block"><span className="label">From email</span><input name="fromEmail" defaultValue={st.email.fromEmail} className="input" placeholder="Must be allowed by your email account" /></label>
              <label className="block"><span className="label">Reply-to email</span><input name="replyTo" defaultValue={st.email.replyTo} className="input" /></label>
              <label className="block"><span className="label">Emails per day (all campaigns)</span><input type="number" min={1} max={500} name="dailyLimit" defaultValue={st.email.dailyLimit} className="input" /></label>
            </div>
            <label className="block"><span className="label">Signature</span><textarea name="signature" rows={3} defaultValue={st.email.signature} className="input" /></label>
            <label className="block"><span className="label">Unsubscribe sentence</span><input name="unsubscribeFooter" defaultValue={st.email.unsubscribeFooter} className="input" /></label>
            <label className="block"><span className="label">Business postal address *</span><textarea name="physicalAddress" rows={2} defaultValue={st.email.physicalAddress} className="input" placeholder="Street, city, PIN, country" /></label>
            <SubmitButton>Save email settings</SubmitButton>
            <p className="text-xs text-navy-400">Connect the email account itself under <Link href="/integrations" className="font-semibold text-brand-600">Integrations</Link>. Start with a low daily limit (20–50) so your domain builds a good reputation.</p>
          </form>
        </Card>
      )}

      {tab === "notifications" && s.isWsAdmin && (
        <Card className="max-w-2xl">
          <CardHeader title="Notifications & reminders" subtitle="Workspace-wide." />
          <form action={updatePrefsAction} className="space-y-4 p-5">
            {([["notifyFollowUps", "Remind about follow-ups and meetings", st.prefs.notifyFollowUps], ["notifyTasks", "Remind about tasks that are due or overdue", st.prefs.notifyTasks], ["notifyCampaigns", "Tell me when a campaign completes", st.prefs.notifyCampaigns]] as const).map(([k, label, v]) => (
              <label key={k} className="flex items-center gap-2 text-sm text-navy-700"><input type="checkbox" name={k} defaultChecked={v} className="h-4 w-4 rounded" /> {label}</label>
            ))}
            <label className="block"><span className="label">Flag a lead as stale after (days without activity)</span><input type="number" min={3} max={120} name="staleLeadDays" defaultValue={st.prefs.staleLeadDays} className="input" /></label>
            <label className="block"><span className="label">Dashboard opens with</span>
              <select name="dashboardRange" defaultValue={st.prefs.dashboardRange} className="input"><option value="today">Today</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="90d">Last 90 days</option></select>
            </label>
            <SubmitButton>Save</SubmitButton>
          </form>
        </Card>
      )}
    </>
  );
}
