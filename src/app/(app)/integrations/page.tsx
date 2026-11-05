import { eq } from "drizzle-orm";
import { CheckCircle2, CircleSlash, XCircle } from "lucide-react";
import { db, integrations } from "@/db";
import { requireWsAdmin } from "@/lib/session";
import { fmtDateTime } from "@/lib/utils";
import { Card, CardHeader, PageHeader } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { PasswordInput } from "@/components/password-input";
import { removeIntegrationAction, saveAnthropicAction, saveSmtpAction } from "@/app/actions/integrations";

export const metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

function Status({ status, error }: { status?: string; error?: string | null }) {
  if (status === "CONFIGURED") return <span className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700"><CheckCircle2 size={15} /> Connected</span>;
  if (status === "ERROR") return <span className="inline-flex items-center gap-1 text-sm font-semibold text-rose-700"><XCircle size={15} /> Not working{error ? `: ${error}` : ""}</span>;
  return <span className="inline-flex items-center gap-1 text-sm text-navy-400"><CircleSlash size={15} /> Not connected</span>;
}

export default async function IntegrationsPage() {
  const s = await requireWsAdmin();
  const rows = await db.select().from(integrations).where(eq(integrations.workspaceId, s.workspace.id));
  const smtp = rows.find((r) => r.provider === "SMTP");
  const ai = rows.find((r) => r.provider === "ANTHROPIC");
  return (
    <>
      <PageHeader title="Integrations" subtitle="Connect only what you need. Secrets are stored encrypted and are never shown again." />
      <div className="grid max-w-5xl grid-cols-1 gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Email account (SMTP)" subtitle="Needed to send outreach emails." action={<Status status={smtp?.status} error={smtp?.lastError} />} />
          <form action={saveSmtpAction} className="space-y-3 p-5">
            <div className="grid grid-cols-3 gap-3">
              <label className="col-span-2 block"><span className="label">Server</span><input name="host" required defaultValue={smtp?.config.host ?? ""} placeholder="smtp.gmail.com" className="input" /></label>
              <label className="block"><span className="label">Port</span><input name="port" defaultValue={smtp?.config.port ?? "587"} className="input" /></label>
            </div>
            <label className="block"><span className="label">Username (usually your email)</span><input name="user" required defaultValue={smtp?.config.user ?? ""} autoComplete="off" className="input" /></label>
            <label className="block"><span className="label">Password {smtp?.secretEnc && <span className="normal-case text-navy-400">(saved — leave blank to keep)</span>}</span><PasswordInput name="pass" autoComplete="new-password" /></label>
            <p className="text-xs text-navy-400">Gmail / Google Workspace: turn on 2-step verification, then create an <strong>App Password</strong> and paste it here. Port 587 (or 465). We test the connection before marking it connected.</p>
            <div className="flex gap-2">
              <SubmitButton pendingText="Testing connection…">Save & test</SubmitButton>
            </div>
          </form>
          {smtp && (
            <form action={removeIntegrationAction} className="border-t border-navy-100 p-4">
              <input type="hidden" name="provider" value="SMTP" />
              <SubmitButton variant="ghost" size="sm" confirm="Delete the saved email account?">Disconnect</SubmitButton>
              {smtp.lastCheckedAt && <span className="ml-3 text-xs text-navy-400">Last tested {fmtDateTime(smtp.lastCheckedAt)}</span>}
            </form>
          )}
        </Card>

        <Card>
          <CardHeader title="AI assistant (Anthropic)" subtitle="Needed for the AI Assistant page." action={<Status status={ai?.status} error={ai?.lastError} />} />
          <form action={saveAnthropicAction} className="space-y-3 p-5">
            <label className="block"><span className="label">API key {ai?.secretEnc && <span className="normal-case text-navy-400">(saved — leave blank to keep)</span>}</span><PasswordInput name="key" autoComplete="off" placeholder="sk-ant-…" /></label>
            <label className="block"><span className="label">Model</span><input name="model" defaultValue={ai?.config.model ?? "claude-sonnet-5-5"} className="input" /></label>
            <p className="text-xs text-navy-400">Create a key at console.anthropic.com. Usage is billed to your Anthropic account. Only the lead data needed for your question is sent.</p>
            <SubmitButton pendingText="Checking key…">Save & test</SubmitButton>
          </form>
          {ai && (
            <form action={removeIntegrationAction} className="border-t border-navy-100 p-4">
              <input type="hidden" name="provider" value="ANTHROPIC" />
              <SubmitButton variant="ghost" size="sm" confirm="Delete the saved API key?">Disconnect</SubmitButton>
            </form>
          )}
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Not included in this version" />
          <ul className="space-y-2 p-5 text-sm text-navy-600">
            <li><strong>Lead-data providers</strong> (Hunter, Apollo and similar): not connected. Bring leads in with CSV import or by hand. Nothing is faked.</li>
            <li><strong>LinkedIn</strong>: deliberately not supported. Scraping LinkedIn breaks its terms. You can paste a profile link on a lead and open it yourself.</li>
          </ul>
        </Card>
      </div>
    </>
  );
}
