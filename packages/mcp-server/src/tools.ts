import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Our MCP server: fixed Cypher inside, agent never writes raw queries.
// Read tools return evidence paths (every hop has a source for the UI animation).
// Write tools append agent memory (PRECURSOR_OF + per-run KEPT, Alert, FailureMode…).
// The run log itself (Investigation nodes) is written by the harness, not through here.
// Approval transitions (approve/defer/merge) are UI-only — NOT exposed to the agent.
// The descriptions are what the model reads when it picks a tool, so they say what
// each tool answers and the exact id / location formats it expects.

export function buildServer(query: (name: string, args: unknown) => Promise<unknown>) {
  const s = new McpServer({ name: "blackbox", version: "0.1.0" });
  const asOf = z.string().describe("ISO date YYYY-MM-DD. Time-machine cutoff: only records dated before it are visible");
  const bin = z.string().describe('Location key: "737/53" (model family/ATA chapter, 53 = fuselage), "737/53/S4L" (stringer 4 left), "737/53/S4L/BS620" (20-inch body-station bin). Results roll up to any level');
  const tool = (name: string, description: string, shape: z.ZodRawShape) =>
    s.tool(name, description, shape, async (a) => ({ content: [{ type: "text", text: JSON.stringify(await query(name, a)) }] }));

  // Read
  tool("search_accidents", "Keyword search over NTSB probable-cause text of mechanical accidents and incidents since 2008. Returns ev_id, NTSB number, date, findings.",
    { text: z.string().describe("keywords, e.g. 'lap joint fatigue'"), asOf: asOf.optional() });
  tool("get_accident", "One NTSB event by ev_id: aircraft (tail, variant), probable cause text, and each cause/factor finding with its ATA chapter and location key.",
    { ev_id: z.string().describe("NTSB ev_id, e.g. 20110401X24330") });
  tool("past_investigations", "Earlier investigations of this accident (memory across sessions): when each ran, which model or method, the reports it kept with confidence and reason, and its leads. Check it first and say where this run agrees or differs.",
    { ev_id: z.string().describe("NTSB ev_id, e.g. 20110401X24330"), asOf });
  tool("prior_reports", "FAA maintenance reports (Service Difficulty Reports) filed on one aircraft before asOf, newest first, optionally only at or inside a location. Use it to find warning signs on the same plane.",
    { tail: z.string().describe("US tail number, e.g. N632SW"), bin: bin.optional(), asOf, windowDays: z.number().default(730).describe("look-back window in days") });
  tool("fleet_reports", "How many reports and distinct aircraft of the whole fleet reported trouble at a location in a date range. Use it to see whether a plane's problem was fleet-wide.",
    { family: z.string().describe("model family, e.g. 737"), bin, from: z.string().describe("ISO date, inclusive"), to: z.string().describe("ISO date, exclusive") });
  tool("hotspots", "Rising locations for a model family: distinct aircraft reporting in the last window before asOf vs the window before. Filter part='SKIN', condition='CRACK' to rank structural damage.",
    { family: z.string(), asOf, chapter: z.string().optional().describe("ATA chapter, e.g. 53"), part: z.string().optional(), condition: z.string().optional(), windowDays: z.number().optional() });
  tool("similar_reports", "Keyword-similar maintenance reports across the fleet (full-text index), before asOf.",
    { text: z.string(), asOf: asOf.optional() });
  tool("fix_orders", "FAA airworthiness directives (fix orders) for a model family issued up to asOf, with the location they target and the orders they replace.",
    { family: z.string(), bin: bin.optional(), asOf });
  tool("explain_path", "Shortest evidence path (up to 4 hops) between two records (report id, ev_id, AD number or location key) over evidence edges, only through records dated before asOf. Use it to show how a warning sign connects to an accident.",
    { from: z.string(), to: z.string(), asOf: asOf.optional() });
  tool("rank_failure_modes", "Rank the confirmed failure modes that were known before asOf against a new case: every component (family/system match, signature-line overlap with this tail's priors, full-text similarity) is computed from the graph, never hard-coded. Returns scored modes plus the decision (clear/ambiguous/weak/none); none means no known mode fits, so check failure_mode_candidates and draft one.",
    { tail: z.string(), family: z.string(), system: z.string().describe("ATA chapter of the damaged system, e.g. 53 (fuselage)"), narrative: z.string().describe("early facts only, never the final cause"), asOf, windowDays: z.number().default(730).describe("look-back window in days").optional() });
  tool("failure_mode_candidates", "Dormant and proposed failure modes (not yet confirmed by a human). Check these before proposing a new one.",
    { caseId: z.string() });
  tool("reoffer_candidates", "Deferred or proposed modes whose evidence grew since the last human decision (3+ new items, or a newer accident). Offer these to a person again.",
    {});
  tool("open_alerts", "Alerts the watcher raised and nobody has actioned or dismissed yet, up to asOf: the hand-off from the watcher to an investigator.",
    { asOf });
  tool("alert_aircraft", "The aircraft behind one alert: those it names (most reports first), then others with a matching report on the same line in the window. Pass condition 'CRACK' to widen from skin cracks to any crack.",
    { id: z.string().describe("alert id from open_alerts or raise_alert"), condition: z.string().optional(), windowDays: z.number().optional() });
  tool("who_fixed", "Engineers of the (fictional) maintenance company assigned to work orders at a location.", { bin });
  tool("why_task", "Why a (fictional) maintenance task card exists: the fix order it cites and the orders that one replaced.",
    { task_id: z.string() });
  tool("stale_tasks", "Task cards that still cite a fix order that has since been replaced.", {});

  // Write / action (agent memory + org actions). A human approves failure modes in the UI.
  tool("record_precursor", "Save a judged warning sign: this report preceded this accident, with confidence 0-1 and a one-line reason.",
    { reportId: z.string(), accidentId: z.string(), confidence: z.number(), reason: z.string(), asOf, runId: z.string().optional().describe("set by the harness; leave empty") });
  tool("raise_alert", "Open an alert on a stringer line that is rising across the fleet (from hotspots). Links every aircraft that reported there in the window under the same part/condition filter. One alert per line and date. A lead worth review, not a prediction.",
    { bin, asOf, reason: z.string(), part: z.string().optional(), condition: z.string().optional(), windowDays: z.number().optional() });
  tool("propose_failure_mode", "Draft a NEW failure mode when no known or dormant mode fits. It stays 'proposed' until a human approves it.",
    { draft: z.object({ name: z.string(), system: z.string(), mechanism: z.string() }), evidence: z.array(z.string()).describe("report ids / ev_ids supporting it") });
  tool("add_support", "Attach new evidence (a case) to an existing dormant or proposed failure mode instead of creating a duplicate.",
    { caseId: z.string(), modeId: z.string() });
  tool("record_observation", "Log a mechanic's observation on an aircraft at a location.",
    { tail: z.string(), bin, text: z.string(), date: z.string() });
  tool("create_work_order", "Draft an inspection work order for an alert, for a team of the (fictional) maintenance company, on the aircraft the alert names. Only a draft: a person dispatches it in the UI; you cannot.",
    { alertId: z.string(), team: z.string().describe("Structures, Propulsion or Avionics"), task: z.string().describe("what to inspect, where, and which aircraft first") });
  return s;
}
