import { runTool } from "@blackbox/graph/src/run";
import { CYPHER } from "@blackbox/graph/queries/cypher";
// Read-only graph queries for the UI views: POST { name, args } -> { rows, ms, cypher }.
// Only the names below run here; write tools go through the agent (MCP) or approval routes.
// Map and trend results are cached (the history they read never changes). The whole-graph
// counts take ~0.8 s, near FalkorDB's 1 s read timeout, so they are kept for a minute and
// the last good answer is served if a recount fails.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIEWS = new Set(["fleet_map", "line_window", "line_trend", "lines_by_year", "bin_reports", "graph_stats", "edge_stats", "subgraph", "get_accident", "prior_reports", "fix_orders", "hotspots", "failure_mode_candidates", "mode_card"]);
const CACHED = new Set(["fleet_map", "line_window", "line_trend", "lines_by_year", "bin_reports"]);
const TTL: Record<string, number> = { graph_stats: 60_000, edge_stats: 60_000 };
const cache = new Map<string, { rows: unknown; ms: number; at: number }>();

export async function POST(req: Request) {
  const { name, args = {} } = (await req.json()) as { name: string; args?: Record<string, unknown> };
  if (!VIEWS.has(name)) return Response.json({ error: `not a view query: ${name}` }, { status: 400 });
  const key = name + JSON.stringify(args);
  const kept = cache.get(key);
  try {
    let hit = kept && (CACHED.has(name) || Date.now() - kept.at < (TTL[name] ?? 0)) ? kept : undefined;
    if (!hit) {
      const t0 = Date.now();
      hit = { rows: await runTool(name, args), ms: Date.now() - t0, at: t0 };
      if (CACHED.has(name) || TTL[name]) cache.set(key, hit);
    }
    return Response.json({ rows: hit.rows, ms: hit.ms, cypher: CYPHER[name].trim() });
  } catch (e) {
    if (kept && TTL[name]) return Response.json({ rows: kept.rows, ms: kept.ms, cypher: CYPHER[name].trim() });
    return Response.json({ error: (e as Error).message }, { status: 503 });
  }
}
