// The one way to run a fixed query by tool name. Shared by the MCP server, the web
// API, the eval and the CLI demo so they all answer from the same graph.
// FalkorDB only: if it is unreachable or a query fails, this throws (rule 3 — the
// product must not keep working without the graph). DEMO=1 explicitly serves the
// offline SWA 812 fixture instead, e.g. for UI work on a laptop without data.
import { connect, type Db } from "./db";
import { CYPHER } from "../queries/cypher";
import { DEMO } from "./demo";

export const demoMode = (): boolean => process.env.DEMO === "1";

let dbPromise: Promise<Db | null> | null = null;

/** Run tool `name` with its args. get_accident returns one row (or null), others a row list. */
export async function runTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  if (demoMode()) return demo(name, args);
  const cypher = CYPHER[name];
  if (!cypher) throw new Error(`unknown tool: ${name}`);
  const db = await (dbPromise ??= connect());
  if (!db) {
    dbPromise = null; // retry on the next call
    throw new Error(`FalkorDB not reachable at ${process.env.FALKORDB_URL ?? "redis://localhost:6379"} (docker compose up -d), or set DEMO=1 for the offline fixture`);
  }
  const rows = await db.query(cypher, args);
  return name === "get_accident" ? rows[0] ?? null : rows;
}

export interface GraphTool { name: string; call(args: Record<string, unknown>): Promise<unknown> }

/** Every fixed query as a callable tool, keyed by name (the agent loop's tool map). */
export function graphTools(): Record<string, GraphTool> {
  return Object.fromEntries(Object.keys(CYPHER).map((name) => [name, { name, call: (a: Record<string, unknown>) => runTool(name, a) }]));
}

// Offline fixture answers (DEMO=1 only), shaped like the real query results.
function demo(name: string, a: Record<string, unknown>): unknown {
  switch (name) {
    case "get_accident": return DEMO.accidents.find((x) => x.ev_id === a.ev_id) ?? DEMO.accidents[0];
    case "prior_reports": return DEMO.priorReports.filter((r) => !a.tail || r.tail === a.tail);
    case "fleet_reports": return [{ bin: a.bin, note: DEMO.fleetNote }];
    case "fix_orders": return DEMO.fixOrders;
    case "rank_failure_modes": return DEMO.failureModes.filter((m) => m.status === "confirmed");
    case "failure_mode_candidates": return DEMO.failureModes.filter((m) => m.status !== "confirmed");
    case "why_task": return DEMO.org.taskCards;
    default: return { demo: true, tool: name, note: "no fixture for this tool; run against FalkorDB" };
  }
}
