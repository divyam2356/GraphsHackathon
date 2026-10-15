import { NextResponse } from "next/server";
import { DEMO } from "@blackbox/graph/src/demo";
export async function POST(req: Request) {
  const b = (await req.json()) as { family: string; asOf: string };
  return NextResponse.json({ family: b.family, asOf: b.asOf, hotspots: [{ bin: "737/53/S4L", ac: 0, note: "demo placeholder" }] });
}
