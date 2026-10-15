import { NextResponse } from "next/server";
import { runInvestigate } from "@blackbox/agent/src/loop";
import { graphTools } from "@blackbox/graph/src/run";
// Flow A on the real graph (DEMO=1 for the offline fixture). 503 when FalkorDB is down.
export async function POST(req: Request) {
  const b = (await req.json()) as { ev_id: string; asOf: string };
  try {
    return NextResponse.json(await runInvestigate(graphTools(), b));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}
