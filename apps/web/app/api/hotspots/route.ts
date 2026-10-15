import { NextResponse } from "next/server";
import { runTool } from "@blackbox/graph/src/run";
// Flow B: rising lines for a model family as of a date. Optional filters, e.g.
// { part: "SKIN", condition: "CRACK", chapter: "53" } rank damage that matters.
export async function POST(req: Request) {
  const b = (await req.json()) as { family: string; asOf: string; chapter?: string; part?: string; condition?: string; windowDays?: number };
  try {
    return NextResponse.json({ family: b.family, asOf: b.asOf, hotspots: await runTool("hotspots", b) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 503 });
  }
}
