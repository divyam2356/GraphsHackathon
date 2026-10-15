import "@blackbox/graph/src/env";
// CLI smoke test: npm run demo -- "crown skin crack S-4L 737"
// Runs investigate + leads against demo store (no DB, no LLM key needed).
import { runInvestigate, runLeads } from "./loop";
import { DEMO } from "@blackbox/graph/src/demo";

const tools: Record<string, { name: string; call: (a: Record<string, unknown>) => Promise<unknown> }> = {
  get_accident: { name: "x", call: async () => DEMO.accidents[0] },
  prior_reports: { name: "x", call: async () => DEMO.priorReports },
  fleet_reports: { name: "x", call: async () => ({ note: DEMO.fleetNote }) },
  fix_orders: { name: "x", call: async () => DEMO.fixOrders },
  rank_failure_modes: { name: "x", call: async () => DEMO.failureModes },
};
const inv = await runInvestigate(tools, { ev_id: "20110401X24330", asOf: "2011-03-31" });
const leads = await runLeads(tools, {
  tail: "N632SW", family: "737", phase: "climb",
  narrative: process.argv[2] ?? "crown skin crack S-4L lap joint", asOf: "2011-03-31",
});
console.log(JSON.stringify({ investigate: inv, leads }, null, 2));
