import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { buildReport, REPORT_TYPES, toCsv, toPdf, toXlsx, type ReportKey } from "@/lib/reports";
import { logAudit, logError } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: { type: string } }) {
  const s = await getSession();
  if (!s) return NextResponse.json({ error: "Please log in." }, { status: 401 });
  const type = REPORT_TYPES.find((t) => t.key === params.type)?.key as ReportKey | undefined;
  if (!type) return NextResponse.json({ error: "Unknown report." }, { status: 404 });
  const lim = await rateLimit(`report:${s.user.id}`, 40, 600);
  if (!lim.ok) return NextResponse.json({ error: "Too many exports. Wait a few minutes." }, { status: 429 });
  const url = new URL(req.url);
  const q = Object.fromEntries(url.searchParams.entries());
  const format = ["csv", "xlsx", "pdf"].includes(q.format) ? q.format : "csv";
  try {
    const data = await buildReport(type, s, q);
    const name = `${type}-${new Date().toISOString().slice(0, 10)}`;
    await logAudit({ workspaceId: s.workspace.id, userId: s.user.id, action: "REPORT_EXPORT", entity: type, meta: { format, rows: data.rows.length } });
    if (format === "csv") return new NextResponse(toCsv(data), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"` } });
    if (format === "xlsx") return new NextResponse(new Uint8Array(await toXlsx(data)), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}.xlsx"` } });
    return new NextResponse(new Uint8Array(await toPdf(data)), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}.pdf"` } });
  } catch (e) {
    await logError(e, `/api/reports/${type}`, s.user.id);
    return NextResponse.json({ error: "Could not build this report." }, { status: 500 });
  }
}
