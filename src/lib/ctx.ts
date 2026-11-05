import type { AppSession } from "./session";
import type { Ctx } from "./leads";

/** Turns the logged-in session into the Ctx that every lead function needs (workspace + user + settings). */
export function toCtx(s: AppSession): Ctx & { tz: string; userName: string; companyName: string } {
  return {
    workspaceId: s.workspace.id,
    userId: s.user.id,
    settings: s.workspace.settings,
    tz: s.workspace.timezone,
    userName: s.user.name,
    companyName: s.workspace.companyName ?? s.workspace.name,
  };
}
