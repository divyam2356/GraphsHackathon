import { NextResponse } from "next/server";
import { runLeads } from "@blackbox/agent/src/loop";
import { DEMO } from "@blackbox/graph/src/demo";
// Demo-backed today; swap each tool.call for an MCP client call at deploy.
const tools: Record<string, { name: string; call: (a: Record<string, unknown>) => Promise<unknown> }> = {
  rank_failure_modes: { name: "x", call: async () => DEMO.failureModes },
  prior_reports: { name: "x", call: async (a) => DEMO.priorReports.filter((r) => !a.tail || r.tail === a.tail) },
};
export async function POST(req: Request) {
  const b = (await req.json()) as { narrative: string; asOf: string };
  const r = await runLeads(tools, { tail: "N632SW", family: "737", phase: "climb", narrative: b.narrative, asOf: b.asOf });
  return NextResponse.json({ framing: "leads worth review, not causes", ...r });
}
