import "@blackbox/graph/src/env";
// SWA 812 regression checks on the real graph (DEMO=1 runs them on the offline fixture
// and says so): 1 precursor-hit · 2 leads replay · 3 novelty-replay. One case each, so
// they catch breakage, not generalisation. The real test is backtest.ts.
// T2 replays the leads ranking the day before: FM-CROWN-S4L was written from this
// accident (known from AD 2011-08-51, 5 Apr 2011), so an honest replay must not offer it
// and must call the case new. T2b re-runs after the AD as a mechanics check only.
import { runLeads } from "@blackbox/agent/src/loop";
import { demoMode, graphTools } from "@blackbox/graph/src/run";

const tools = graphTools();
const source = demoMode() ? "demo-fixture" : "falkordb";
// T1 precursor hit: asOf day-before — was S-4L flagged?
const priors = (await tools.prior_reports.call({ tail: "N632SW", asOf: "2011-03-31" })) as Array<{ bin?: string }>;
const t1 = priors.filter((r) => (r.bin ?? "").includes("/S4L")).length;
// T2 leads: hide cause, feed early facts only
const early = { tail: "N632SW", family: "737", system: "53", phase: "climb", narrative: "rapid decompression crown skin rupture lap joint" };
const before = await runLeads(tools, { ...early, asOf: "2011-03-31" });
const after = await runLeads(tools, { ...early, asOf: "2011-06-01" });
const rankOf = (r: typeof before) => r.scored.findIndex((s) => s.modeId === "FM-CROWN-S4L") + 1;
// T3 novelty: replay FM-DOOR-AFT (dormant, first-evidence) as "new" — rule must say none/weak
const nov = await runLeads(tools, { tail: "NX-101", family: "737", system: "52", phase: "stand", narrative: "unusual cracking at aft cargo door frame", asOf: "2011-03-31" });
console.log(JSON.stringify({
  source,
  T1_precursor_hit: { s4l_priors: t1, alert_would_fire: t1 > 0 },
  T2_no_hindsight: { modes_offered: before.scored.length, crown_offered: rankOf(before) > 0, decision: before.decision, says_new: before.decision === "none" },
  T2b_after_AD_mechanics: { crown_rank: rankOf(after), decision: after.decision, scored: after.scored.map((s) => [s.modeId, +s.score.toFixed(2)]) },
  T3_novelty: { decision: nov.decision, says_new: nov.decision === "none" || nov.decision === "weak" },
}, null, 2));
process.exit(0); // the DB client keeps the event loop alive
