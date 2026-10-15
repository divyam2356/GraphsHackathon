import { NextResponse } from "next/server";
import { runInvestigate } from "@blackbox/agent/src/loop.js";
import { DEMO } from "@blackbox/graph/src/demo.js";
const tools: Record<string, { name: string; call: (a: Record<string, unknown>) => Promise<unknown> }> = {
  get_accident: { name: "x", call: async () => DEMO.accidents[0] },
  prior_reports: { name: "x", call: async () => DEMO.priorReports },
  fleet_reports: { name: "x", call: async () => ({ note: DEMO.fleetNote }) },
  fix_orders: { name: "x", call: async () => DEMO.fixOrders },
  rank_failure_modes: { name: "x", call: async () => DEMO.failureModes },
};
export async function POST(req: Request) {
  const b = (await req.json()) as { ev_id: string; asOf: string };
  return NextResponse.json(await runInvestigate(tools, b));
}
