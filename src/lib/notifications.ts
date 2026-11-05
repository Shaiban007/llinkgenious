import { db, notifications } from "@/db";

export type NotificationType =
  | "LEAD_ASSIGNED"
  | "QUALIFICATION_DONE"
  | "FOLLOW_UP_DUE"
  | "TASK_OVERDUE"
  | "LEAD_STALE"
  | "MEETING_SOON"
  | "KRA_REVIEW"
  | "KPI_ACHIEVED"
  | "CAMPAIGN_COMPLETED"
  | "EMAIL_PENDING"
  | "SYSTEM";

/**
 * Creates an in-app notification. If a dedupeKey is given, the same notification is never
 * created twice for the same person (used by the reminder scheduler).
 */
export async function notify(input: {
  workspaceId: string;
  userId: string | null | undefined;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  dedupeKey?: string;
}) {
  if (!input.userId) return;
  try {
    await db
      .insert(notifications)
      .values({
        workspaceId: input.workspaceId,
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
        dedupeKey: input.dedupeKey,
      })
      .onConflictDoNothing();
  } catch (e) {
    console.error("[notify] failed", e);
  }
}
