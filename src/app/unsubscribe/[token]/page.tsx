import { AuthShell } from "@/components/auth-shell";
import { parseUnsubscribeToken } from "@/lib/outreach";
import { unsubscribeAction } from "@/app/actions/unsubscribe";

export const metadata = { title: "Unsubscribe" };
export const dynamic = "force-dynamic";

export default function UnsubscribePage({ params, searchParams }: { params: { token: string }; searchParams: { done?: string; bad?: string } }) {
  const token = decodeURIComponent(params.token);
  const t = parseUnsubscribeToken(token);
  if (!t || searchParams.bad)
    return (
      <AuthShell title="Link not valid">
        <p className="text-sm text-navy-600">This unsubscribe link is not valid. If you keep receiving emails you don’t want, reply to the message and ask to be removed.</p>
      </AuthShell>
    );
  if (searchParams.done)
    return (
      <AuthShell title="You are unsubscribed">
        <p className="text-sm text-navy-600">
          <strong>{t.email}</strong> will not receive any more emails from this sender.
        </p>
      </AuthShell>
    );
  return (
    <AuthShell title="Unsubscribe">
      <p className="text-sm text-navy-600">
        Stop all emails to <strong>{t.email}</strong> from this sender?
      </p>
      <form action={unsubscribeAction} className="mt-5">
        <input type="hidden" name="token" value={token} />
        <button className="btn-primary">Yes, unsubscribe me</button>
      </form>
    </AuthShell>
  );
}
