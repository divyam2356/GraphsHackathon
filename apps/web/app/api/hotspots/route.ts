import { NextResponse } from "next/server";
import { DEMO } from "@blackbox/graph/src/demo";
export async function POST(req: Request) {
  const b = (await req.json()) as { family: string; asOf: string };
  return NextResponse.json({ family: b.family, asOf: b.asOf, hotspots: [{ bin: "S-4L/BS639", ac: 12 }] });
}
