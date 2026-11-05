"use server";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { db, employeePerformance, kpiTargets, kras, workspaceMembers } from "@/db";
import { requireWsAdmin } from "@/lib/session";
import { flash } from "@/lib/flash";
import { logAudit } from "@/lib/audit";
import { KPI_CATALOG, KPI_BY_KEY } from "@/lib/kpi-catalog";
import { kpiValues } from "@/lib/metrics";
import { kpiScore, kraScore, loadKpiRows, loadKraRows, resolvePeriod } from "@/lib/performance";
import { notify } from "@/lib/notifications";
import { str, strOrNull } from "@/lib/utils";

/* ───────────── KPI targets ───────────── */
export async function saveKpiTargetsAction(fd: FormData) {
  const s = await requireWsAdmin();
  const who = str(fd.get("who")); // "team" or a user id
  const userId = who === "team" ? null : who;
  const back = `/kpi?who=${who}&period=${str(fd.get("period")) || "this_month"}`;
  if (userId) {
    const [m] = await db.select({ id: workspaceMembers.userId }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, s.workspace.id), eq(workspaceMembers.userId, userId))).limit(1);
    if (!m) flash(back, { err: "That person is not in this workspace." });
  }
  let saved = 0;
  for (const k of KPI_CATALOG) {
    const raw = str(fd.get(`t_${k.key}`)).trim();
    const where = and(eq(kpiTargets.workspaceId, s.workspace.id), eq(kpiTargets.kpiKey, k.key), eq(kpiTargets.period, "MONTHLY"), userId ? eq(kpiTargets.userId, userId) : isNull(kpiTargets.userId));
    if (raw === "") {
      await db.delete(kpiTargets).where(where);
      continue;
    }
    const v = Number(raw);
    if (!Number.isFinite(v) || v < 0 || v > 1_000_000) flash(back, { err: `“${k.name}” target must be a number from 0 up.` });
    const [cur] = await db.select({ id: kpiTargets.id }).from(kpiTargets).where(where).limit(1);
    if (cur) await db.update(kpiTargets).set({ target: String(v) }).where(eq(kpiTargets.id, cur.id));
    else await db.insert(kpiTargets).values({ workspaceId: s.workspace.id, kpiKey: k.key, userId, period: "MONTHLY", target: String(v) });
    saved++;
  }
  await logAudit({ workspaceId: s.workspace.id, userId: s.user.id, action: "KPI_TARGETS_SAVED", meta: { who, saved } });
  flash(back, { ok: `Targets saved (${saved} set). Count targets are per month; longer periods scale them automatically.` });
}

/* ───────────── KRAs ───────────── */
function readKra(fd: FormData) {
  const metricKey = str(fd.get("metricKey"));
  return {
    name: str(fd.get("name")).trim(),
    description: strOrNull(fd.get("description")),
    measurement: strOrNull(fd.get("measurement")),
    assignedTo: str(fd.get("assignedTo")),
    department: strOrNull(fd.get("department")),
    metricKey: metricKey && KPI_BY_KEY[metricKey] ? metricKey : null,
    target: Number(str(fd.get("target"))),
    period: str(fd.get("period")) === "QUARTERLY" ? ("QUARTERLY" as const) : ("MONTHLY" as const),
    weightage: Number.parseInt(str(fd.get("weightage")), 10),
  };
}

export async function saveKraAction(fd: FormData) {
  const s = await requireWsAdmin();
  const id = strOrNull(fd.get("id"));
  const k = readKra(fd);
  if (k.name.length < 3) flash("/kra", { err: "Give the KRA a name." });
  if (!Number.isFinite(k.target) || k.target < 0) flash("/kra", { err: "Target must be a number." });
  if (!(k.weightage >= 1 && k.weightage <= 100)) flash("/kra", { err: "Weightage must be between 1 and 100." });
  const [m] = await db.select({ id: workspaceMembers.userId }).from(workspaceMembers).where(and(eq(workspaceMembers.workspaceId, s.workspace.id), eq(workspaceMembers.userId, k.assignedTo))).limit(1);
  if (!m) flash("/kra", { err: "Choose a person from this workspace." });
  const vals = { ...k, target: String(k.target) };
  if (id) {
    const r = await db.update(kras).set(vals).where(and(eq(kras.id, id), eq(kras.workspaceId, s.workspace.id))).returning({ id: kras.id });
    if (!r.length) flash("/kra", { err: "KRA not found." });
  } else {
    await db.insert(kras).values({ ...vals, workspaceId: s.workspace.id, createdBy: s.user.id });
    if (k.assignedTo !== s.user.id) await notify({ workspaceId: s.workspace.id, userId: k.assignedTo, type: "KRA_REVIEW", title: `New KRA assigned: ${k.name}`, link: "/kra" });
  }
  flash("/kra", { ok: id ? "KRA updated." : "KRA created." });
}

export async function reviewKraAction(fd: FormData) {
  const s = await requireWsAdmin();
  const raw = str(fd.get("manualActual")).trim();
  const actual = raw === "" ? null : Number(raw);
  if (actual !== null && (!Number.isFinite(actual) || actual < 0)) flash("/kra", { err: "Actual must be a number." });
  const [k] = await db
    .update(kras)
    .set({ manualActual: actual === null ? null : String(actual), reviewNotes: strOrNull(fd.get("reviewNotes"))?.slice(0, 1000) })
    .where(and(eq(kras.id, str(fd.get("id"))), eq(kras.workspaceId, s.workspace.id)))
    .returning();
  if (!k) flash("/kra", { err: "KRA not found." });
  if (k.assignedTo !== s.user.id) await notify({ workspaceId: s.workspace.id, userId: k.assignedTo, type: "KRA_REVIEW", title: `Your KRA “${k.name}” was reviewed`, link: "/kra" });
  flash("/kra", { ok: "Review saved. KRAs linked to a live metric ignore the manual actual." });
}

export async function deleteKraAction(fd: FormData) {
  const s = await requireWsAdmin();
  await db.delete(kras).where(and(eq(kras.id, str(fd.get("id"))), eq(kras.workspaceId, s.workspace.id)));
  flash("/kra", { ok: "KRA deleted." });
}

/* ───────────── monthly performance snapshot ───────────── */
export async function saveSnapshotAction(fd: FormData) {
  const s = await requireWsAdmin();
  const period = resolvePeriod(str(fd.get("period")), s.workspace.timezone);
  const members = await db.select({ id: workspaceMembers.userId }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, s.workspace.id));
  const ids = members.map((m) => m.id);
  const kraRows = await loadKraRows({ workspaceId: s.workspace.id, userId: null, which: period.key.startsWith("last") ? "previous" : "current", scoring: s.workspace.settings.scoring, tz: s.workspace.timezone, teamSize: ids.length });
  // replace an existing snapshot for the same period
  await db.delete(employeePerformance).where(and(eq(employeePerformance.workspaceId, s.workspace.id), eq(employeePerformance.periodStart, period.from), inArray(employeePerformance.userId, ids)));
  for (const id of ids) {
    const { rows, metrics } = await loadKpiRows({ workspaceId: s.workspace.id, userId: id, period, scoring: s.workspace.settings.scoring, teamSize: ids.length });
    const kpi = kpiScore(rows);
    const kra = kraScore(kraRows.filter((r) => r.userId === id));
    const values = kpiValues(metrics, period.days, ids.length);
    const flat: Record<string, number> = {};
    for (const [k, v] of Object.entries(values)) if (v !== null) flat[k] = Math.round(v * 100) / 100;
    await db.insert(employeePerformance).values({ workspaceId: s.workspace.id, userId: id, periodStart: period.from, periodEnd: period.to, metrics: flat, kpiAchievement: kpi === null ? null : kpi.toFixed(2), kraAchievement: kra === null ? null : kra.toFixed(2) });
  }

  await logAudit({ workspaceId: s.workspace.id, userId: s.user.id, action: "PERFORMANCE_SNAPSHOT", meta: { period: period.key } });
  flash(`/performance?period=${period.key}`, { ok: `Saved a snapshot of ${period.label.toLowerCase()} for ${ids.length} people. It is kept as history even if leads change later.` });
}
