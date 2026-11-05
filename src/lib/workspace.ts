import { eq } from "drizzle-orm";
import { db, kpiDefinitions, kpiTargets, leadSources, workspaceMembers, workspaces } from "@/db";
import { KPI_CATALOG } from "./kpi-catalog";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Creates a workspace, makes the user its administrator and seeds KPI definitions and starter targets. */
export async function createWorkspace(
  tx: Tx,
  input: { name: string; companyName?: string | null; industry?: string | null; ownerId: string }
) {
  const [ws] = await tx
    .insert(workspaces)
    .values({ name: input.name, companyName: input.companyName ?? null, industry: input.industry ?? null })
    .returning();
  await tx.insert(workspaceMembers).values({ workspaceId: ws.id, userId: input.ownerId, role: "ADMIN" });
  await tx.insert(kpiDefinitions).values(
    KPI_CATALOG.map((k) => ({
      workspaceId: ws.id,
      key: k.key,
      name: k.name,
      category: k.category,
      unit: k.unit,
      higherIsBetter: k.higherIsBetter,
    }))
  );
  const starter = KPI_CATALOG.filter((k) => k.defaultTarget !== null);
  await tx.insert(kpiTargets).values(
    starter.map((k) => ({ workspaceId: ws.id, kpiKey: k.key, userId: null, period: "MONTHLY", target: String(k.defaultTarget) }))
  );
  await tx.insert(leadSources).values([{ workspaceId: ws.id, name: "Manual entry", type: "MANUAL" }]);
  return ws;
}

export async function getWorkspaceById(id: string) {
  const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, id)).limit(1);
  return ws ?? null;
}
