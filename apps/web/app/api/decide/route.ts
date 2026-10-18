import { runTool } from "@blackbox/graph/src/run";
import { CYPHER } from "@blackbox/graph/queries/cypher";
// A person's decisions. Failure modes: approve -> confirmed, defer -> dormant, reopen ->
// proposed (demo reset), merge -> folded into another mode. Work orders: dispatch a draft
// (assigned to the team member with the most earlier jobs on that line, then the fewest orders). Alerts: dismiss. UI only: the MCP server never
// exposes these, so the agent can draft modes and work orders but cannot decide them.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Decision = "approve" | "defer" | "reopen" | "merge" | "dispatch" | "dismiss";
const QUERY: Record<Decision, string> = {
  approve: "decide_mode", defer: "decide_mode", reopen: "decide_mode", merge: "merge_mode",
  dispatch: "dispatch_work_order", dismiss: "dismiss_alert",
};

export async function POST(req: Request) {
  const b = (await req.json()) as { id: string; decision: Decision; by: string; reason?: string; into?: string };
  if (!b.id || !(b.decision in QUERY) || !b.by?.trim()) return Response.json({ error: "id, decision and by are required" }, { status: 400 });
  const name = QUERY[b.decision];
  try {
    const rows = (await runTool(name, { id: b.id, decision: b.decision, into: b.into ?? null, by: b.by.trim(), reason: b.reason?.trim() || null, at: new Date().toISOString() })) as unknown[];
    if (!rows.length) return Response.json({ error: "Nothing in a state that allows this decision" }, { status: 409 });
    return Response.json({ ...(rows[0] as object), cypher: CYPHER[name].trim() });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 503 });
  }
}
