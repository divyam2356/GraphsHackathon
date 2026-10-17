import "@blackbox/graph/src/env";
// CLI smoke test: npm run demo -- "crown skin crack S-4L 737"
// Runs investigate + leads against FalkorDB (no LLM key needed).
// Without data: DEMO=1 npm run demo  (offline SWA 812 fixture).
import { runInvestigate, runLeads } from "./loop";
import { graphTools } from "@blackbox/graph/src/run";

const tools = graphTools();
const inv = await runInvestigate(tools, { ev_id: "20110401X24330", asOf: "2011-03-31" });
const leads = await runLeads(tools, {
  tail: "N632SW", family: "737", system: "53", phase: "climb",
  narrative: process.argv[2] ?? "crown skin crack S-4L lap joint", asOf: "2011-03-31",
});
console.log(JSON.stringify({ investigate: inv, leads }, null, 2));
process.exit(0); // the DB client keeps the event loop alive
