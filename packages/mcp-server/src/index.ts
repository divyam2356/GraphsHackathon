import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { buildServer } from "./tools.js";
import { connect } from "@blackbox/graph/src/db.js";
import { CYPHER } from "@blackbox/graph/queries/cypher.js";
import { DEMO } from "@blackbox/graph/src/demo.js";

// Demo fallback store: serves the SWA-812 story when FalkorDB is unreachable,
// so the agent + UI + video all work on a fresh laptop. Real DB wins when up.
function demo(name: string, a: Record<string, unknown>): unknown {
  switch (name) {
    case "get_accident": return DEMO.accidents.find((x) => x.ev_id === a.ev_id) ?? DEMO.accidents[0];
    case "prior_reports": return DEMO.priorReports.filter((r) => r.tail === a.tail);
    case "fleet_reports": return { bin: a.bin, note: DEMO.fleetNote };
    case "fix_orders": return DEMO.fixOrders;
    case "rank_failure_modes": return DEMO.failureModes;
    case "hotspots": return [{ bin: "S-4L/BS639", ac: 12 }, { bin: "ENG/FAN-STG1", ac: 3 }];
    case "why_task": return DEMO.org.taskCards;
    case "propose_failure_mode": return { id: "FM-PROPOSED-1", status: "proposed" };
    default: return { ok: true, demo: true, tool: name };
  }
}

const db = await connect().catch(() => null);
async function query(name: string, args: unknown) {
  const cypher = CYPHER[name];
  if (db && cypher) {
    try {
      const r = await db.query(cypher, (args ?? {}) as Record<string, unknown>);
      return r.data;
    } catch { /* fall through to demo */ }
  }
  return demo(name, (args ?? {}) as Record<string, unknown>);
}

await buildServer(query).connect(new StdioServerTransport());
