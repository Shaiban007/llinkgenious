import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { db, integrations } from "@/db";
import { requireSession } from "@/lib/session";
import { EmptyState, PageHeader } from "@/components/ui";
import { Chat } from "./chat";

export const metadata = { title: "AI Assistant" };
export const dynamic = "force-dynamic";

export default async function AssistantPage() {
  const s = await requireSession();
  const [ai] = await db.select({ status: integrations.status }).from(integrations).where(and(eq(integrations.workspaceId, s.workspace.id), eq(integrations.provider, "ANTHROPIC"))).limit(1);
  return (
    <>
      <PageHeader title="AI Assistant" subtitle="Ask questions in plain English. It reads your real data and can write email drafts for you to approve." />
      {ai?.status === "CONFIGURED" ? (
        <Chat suggestions={["How did we do this month?", "Which leads should I contact first?", "Show my high-priority leads that have an email", "Why did my top lead score so high?", "Which KPIs are behind target?"]} />
      ) : (
        <EmptyState
          title="The AI assistant is not connected yet"
          body="It uses your own Anthropic API key, so nothing is shared or faked. An admin can add the key on the Integrations page; it takes about two minutes."
          action={s.isWsAdmin ? <Link href="/integrations" className="btn-primary">Open Integrations</Link> : undefined}
        />
      )}
    </>
  );
}
