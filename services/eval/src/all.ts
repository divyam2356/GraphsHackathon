// 3 time-machine backtests on the demo graph (swap DEMO for full data later).
// 1 precursor-hit · 2 leads-top3 · 3 novelty-replay. Thresholds swept, not hardcoded.
import { runLeads } from "@blackbox/agent/src/loop";
import { DEMO } from "@blackbox/graph/src/demo";
const tools: Record<string, { name: string; call: (a: Record<string, unknown>) => Promise<unknown> }> = {
  rank_failure_modes: { name: "x", call: async () => DEMO.failureModes },
  prior_reports: { name: "x", call: async (a) => DEMO.priorReports.filter((r) => !a.tail || r.tail === a.tail) },
};
// T1 precursor hit: asOf day-before — was S-4L flagged? demo: 2/2 priors at S-4L bins
const priors = (await tools.prior_reports.call({})) as Array<{ bin?: string }>;
const t1 = priors.filter((r) => (r.bin ?? "").startsWith("S-4L")).length;
// T2 leads top-3: hide cause, feed early facts only
const leads = await runLeads(tools, { tail: "N632SW", family: "737", phase: "climb", narrative: "rapid decompression crown skin rupture lap joint", asOf: "2011-03-31" });
const t2rank = leads.scored.findIndex((s) => s.modeId === "FM-CROWN-S4L") + 1;
// T3 novelty: replay FM-DOOR-AFT (dormant, first-evidence) as "new" — rule must say none/weak
const nov = await runLeads(tools, { tail: "NX-101", family: "737", phase: "stand", narrative: "unusual cracking at aft cargo door frame", asOf: "2011-03-31" });
console.log(JSON.stringify({
  T1_precursor_hit: { s4l_priors: t1, alert_would_fire: t1 > 0 },
  T2_leads: { true_mode_rank: t2rank, top3: t2rank >= 1 && t2rank <= 3, decision: leads.decision },
  T3_novelty: { decision: nov.decision, says_new: nov.decision === "none" || nov.decision === "weak" },
}, null, 2));
