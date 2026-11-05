import { asc, eq } from "drizzle-orm";
import { db, leadLists, users, workspaceMembers } from "@/db";

export async function getMembers(workspaceId: string) {
  return db
    .select({ id: users.id, name: users.name, email: users.email, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(users, eq(users.id, workspaceMembers.userId))
    .where(eq(workspaceMembers.workspaceId, workspaceId))
    .orderBy(asc(users.name));
}

export async function getLists(workspaceId: string) {
  return db.select({ id: leadLists.id, name: leadLists.name }).from(leadLists).where(eq(leadLists.workspaceId, workspaceId)).orderBy(asc(leadLists.name));
}
