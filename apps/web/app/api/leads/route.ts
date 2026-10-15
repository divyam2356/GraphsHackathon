import { NextResponse } from "next/server";
import { runLeads } from "@blackbox/agent/src/loop";
import { graphTools } from "@blackbox/graph/src/run";
// Flow E on the real graph (DEMO=1 for the offline fixture). 503 when FalkorDB is down.
export async function POST(req: Request) {
  const b = (await req.json()) as { narrative: string; asOf: string; tail?: string; family?: string; phase?: string };
  try {
    const r = await runLeads(graphTools(), {
      tail: b.tail ?? "N632SW", family: b.family ?? "737", phase: b.phase ?? "climb", narrative: b.narrative, asOf: b.asOf,
    });
    return NextResponse.json({ framing: "leads worth review, not causes", ...r });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}
