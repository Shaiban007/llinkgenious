import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { askAssistant } from "@/lib/assistant";
import { rateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

const body = z.object({ messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(4000) })).min(1).max(40) });

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return NextResponse.json({ ok: false, error: "Please log in again." }, { status: 401 });
  const lim = await rateLimit(`assistant:${s.user.id}`, 30, 600);
  if (!lim.ok) return NextResponse.json({ ok: false, error: "You are asking very quickly. Wait a minute and try again." }, { status: 429 });
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.messages.at(-1)?.role !== "user") return NextResponse.json({ ok: false, error: "Type a question first." }, { status: 400 });
  try {
    return NextResponse.json(await askAssistant(s, parsed.data.messages));
  } catch (e) {
    await logError(e, "/api/assistant", s.user.id);
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
