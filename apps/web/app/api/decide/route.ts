import { runTool } from "@blackbox/graph/src/run";
import { CYPHER } from "@blackbox/graph/queries/cypher";
// A person's decision on a proposed failure mode: approve -> confirmed, defer -> dormant,
// reopen -> proposed (demo reset). UI only: the MCP server never exposes this, so the
// agent can draft a mode but cannot approve one.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const b = (await req.json()) as { id: string; decision: "approve" | "defer" | "reopen" | "merge"; by: string; reason?: string; into?: string };
  if (!b.id || !["approve", "defer", "reopen", "merge"].includes(b.decision) || !b.by?.trim()) return Response.json({ error: "id, decision and by are required" }, { status: 400 });
  try {
    const at = new Date().toISOString();
    const rows = b.decision === "merge"
      ? ((await runTool("merge_mode", { id: b.id, into: b.into, by: b.by.trim(), reason: b.reason?.trim() || null, at })) as unknown[])
      : ((await runTool("decide_mode", { id: b.id, decision: b.decision, by: b.by.trim(), reason: b.reason?.trim() || null, at })) as unknown[]);
    if (!rows.length) return Response.json({ error: "No failure mode in a state that allows this decision" }, { status: 409 });
    return Response.json({ ...(rows[0] as object), cypher: (b.decision === "merge" ? CYPHER.merge_mode : CYPHER.decide_mode).trim() });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 503 });
  }
}
