import { runTool } from "@blackbox/graph/src/run";
import { CYPHER } from "@blackbox/graph/queries/cypher";
// Read-only graph queries for the UI views: POST { name, args } -> { rows, ms, cypher }.
// Only the names below run here; write tools go through the agent (MCP) or approval routes.
// Map and trend results are cached (the history they read never changes).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIEWS = new Set(["fleet_map", "line_window", "line_trend", "lines_by_year", "bin_reports", "graph_stats", "edge_stats", "subgraph", "get_accident", "prior_reports", "fix_orders", "hotspots", "failure_mode_candidates", "mode_card"]);
const CACHED = new Set(["fleet_map", "line_window", "line_trend", "lines_by_year", "bin_reports"]);
const cache = new Map<string, { rows: unknown; ms: number }>();

export async function POST(req: Request) {
  const { name, args = {} } = (await req.json()) as { name: string; args?: Record<string, unknown> };
  if (!VIEWS.has(name)) return Response.json({ error: `not a view query: ${name}` }, { status: 400 });
  const key = name + JSON.stringify(args);
  try {
    let hit = CACHED.has(name) ? cache.get(key) : undefined;
    if (!hit) {
      const t0 = Date.now();
      hit = { rows: await runTool(name, args), ms: Date.now() - t0 };
      if (CACHED.has(name)) cache.set(key, hit);
    }
    return Response.json({ ...hit, cypher: CYPHER[name].trim() });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 503 });
  }
}
