import "@blackbox/graph/src/env";
// SWA 812 regression checks on the real graph (DEMO=1 runs them on the offline fixture
// and says so): 1 precursor-hit · 2 leads-top3 · 3 novelty-replay. One case each, so they
// catch breakage, not generalisation: T2 is circular (FM-CROWN-S4L and the text_sim
// keyword rule in loop.ts were written from this accident). The real test is backtest.ts.
import { runLeads } from "@blackbox/agent/src/loop";
import { demoMode, graphTools } from "@blackbox/graph/src/run";

const tools = graphTools();
const source = demoMode() ? "demo-fixture" : "falkordb";
// T1 precursor hit: asOf day-before — was S-4L flagged?
const priors = (await tools.prior_reports.call({ tail: "N632SW", asOf: "2011-03-31" })) as Array<{ bin?: string }>;
const t1 = priors.filter((r) => (r.bin ?? "").includes("/S4L")).length;
// T2 leads top-3: hide cause, feed early facts only
const leads = await runLeads(tools, { tail: "N632SW", family: "737", phase: "climb", narrative: "rapid decompression crown skin rupture lap joint", asOf: "2011-03-31" });
const t2rank = leads.scored.findIndex((s) => s.modeId === "FM-CROWN-S4L") + 1;
// T3 novelty: replay FM-DOOR-AFT (dormant, first-evidence) as "new" — rule must say none/weak
const nov = await runLeads(tools, { tail: "NX-101", family: "737", phase: "stand", narrative: "unusual cracking at aft cargo door frame", asOf: "2011-03-31" });
console.log(JSON.stringify({
  source,
  T1_precursor_hit: { s4l_priors: t1, alert_would_fire: t1 > 0 },
  T2_leads: { true_mode_rank: t2rank, top3: t2rank >= 1 && t2rank <= 3, decision: leads.decision },
  T3_novelty: { decision: nov.decision, says_new: nov.decision === "none" || nov.decision === "weak" },
}, null, 2));
process.exit(0); // the DB client keeps the event loop alive
