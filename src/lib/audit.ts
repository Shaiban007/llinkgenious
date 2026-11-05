import { db, auditLogs, errorLogs } from "@/db";

export async function logAudit(entry: {
  workspaceId?: string | null;
  userId?: string | null;
  action: string;
  entity?: string;
  entityId?: string;
  meta?: Record<string, unknown>;
}) {
  try {
    await db.insert(auditLogs).values({
      workspaceId: entry.workspaceId ?? null,
      userId: entry.userId ?? null,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      meta: entry.meta ?? {},
    });
  } catch (e) {
    console.error("[audit] failed to write audit log", e);
  }
}

export async function logError(err: unknown, path?: string, userId?: string | null) {
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    await db.insert(errorLogs).values({
      message: e.message.slice(0, 2000),
      stack: e.stack?.slice(0, 6000),
      path,
      userId: userId ?? null,
    });
  } catch {
    console.error("[error-log] failed to store error", err);
  }
}
