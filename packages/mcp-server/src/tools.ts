import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

// Our MCP server: fixed Cypher inside, agent never writes raw queries.
// Read tools return evidence paths (every hop has a source for the UI animation).
// Write tools append agent memory (PRECURSOR_OF, Alert, FailureMode, Case…).
// Approval transitions (approve/defer/merge) are UI-only — NOT exposed to the agent.

export function buildServer(query: (name: string, args: unknown) => Promise<unknown>) {
  const s = new McpServer({ name: "blackbox", version: "0.1.0" });
  const asOf = z.string().describe("ISO date, time-machine cutoff");

  s.tool("search_accidents", { text: z.string(), asOf: asOf.optional() },
    async (a) => ({ content: [{ type: "text", text: JSON.stringify(await query("search_accidents", a)) }] }));
  s.tool("get_accident", { ev_id: z.string() },
    async (a) => ({ content: [{ type: "text", text: JSON.stringify(await query("get_accident", a)) }] }));
  s.tool("prior_reports", { tail: z.string(), bin: z.string().optional(), asOf, windowDays: z.number().default(730) },
    async (a) => ({ content: [{ type: "text", text: JSON.stringify(await query("prior_reports", a)) }] }));
  s.tool("fleet_reports", { family: z.string(), bin: z.string(), from: z.string(), to: z.string() },
    async (a) => ({ content: [{ type: "text", text: JSON.stringify(await query("fleet_reports", a)) }] }));
  s.tool("hotspots", { family: z.string(), asOf },
    async (a) => ({ content: [{ type: "text", text: JSON.stringify(await query("hotspots", a)) }] }));
  s.tool("similar_reports", { text: z.string(), asOf: asOf.optional() },
    async (a) => ({ content: [{ type: "text", text: JSON.stringify(await query("similar_reports", a)) }] }));
  s.tool("fix_orders", { family: z.string(), bin: z.string().optional(), asOf },
    async (a) => ({ content: [{ type: "text", text: JSON.stringify(await query("fix_orders", a)) }] }));
  s.tool("explain_path", { from: z.string(), to: z.string() },
    async (a) => ({ content: [{ type: "text", text: JSON.stringify(await query("explain_path", a)) }] }));
  s.tool("rank_failure_modes", { tail: z.string(), family: z.string(), phase: z.string(), narrative: z.string(), asOf },
    async (a) => ({ content: [{ type: "text", text: JSON.stringify(await query("rank_failure_modes", a)) }] }));
  s.tool("failure_mode_candidates", { caseId: z.string() },
    async (a) => ({ content: [{ type: "text", text: JSON.stringify(await query("failure_mode_candidates", a)) }] }));
  s.tool("who_fixed", { bin: z.string() },
    async (a) => ({ content: [{ type: "text", text: JSON.stringify(await query("who_fixed", a)) }] }));
  s.tool("why_task", { task_id: z.string() },
    async (a) => ({ content: [{ type: "text", text: JSON.stringify(await query("why_task", a)) }] }));
  s.tool("stale_tasks", {},
    async () => ({ content: [{ type: "text", text: JSON.stringify(await query("stale_tasks", {})) }] }));

  // Write / action (agent memory + org actions)
  s.tool("record_precursor", { reportId: z.string(), accidentId: z.string(), confidence: z.number(), reason: z.string(), asOf },
    async (a) => ({ content: [{ type: "text", text: JSON.stringify(await query("record_precursor", a)) }] }));
  s.tool("raise_alert", { tail: z.string(), modeId: z.string().optional(), hotspotId: z.string().optional(), reason: z.string() },
    async (a) => ({ content: [{ type: "text", text: JSON.stringify(await query("raise_alert", a)) }] }));
  s.tool("propose_failure_mode", { draft: z.object({ name: z.string(), system: z.string(), mechanism: z.string() }), evidence: z.array(z.string()) },
    async (a) => ({ content: [{ type: "text", text: JSON.stringify(await query("propose_failure_mode", a)) }] }));
  s.tool("add_support", { caseId: z.string(), modeId: z.string() },
    async (a) => ({ content: [{ type: "text", text: JSON.stringify(await query("add_support", a)) }] }));
  s.tool("record_observation", { tail: z.string(), bin: z.string(), text: z.string(), date: z.string() },
    async (a) => ({ content: [{ type: "text", text: JSON.stringify(await query("record_observation", a)) }] }));
  s.tool("create_work_order", { alertId: z.string(), team: z.string(), bin: z.string().optional() },
    async (a) => ({ content: [{ type: "text", text: JSON.stringify(await query("create_work_order", a)) }] }));
  return s;
}
