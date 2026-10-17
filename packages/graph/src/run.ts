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
  const db = await (dbPromise ??= connect());
  if (!db) {
    dbPromise = null; // retry on the next call
    throw new Error(`FalkorDB not reachable at ${process.env.FALKORDB_URL ?? "redis://localhost:6379"} (docker compose up -d), or set DEMO=1 for the offline fixture`);
  }
  if (name === "rank_failure_modes") return rankModes(db, args);
  const cypher = CYPHER[name];
  if (!cypher) throw new Error(`unknown tool: ${name}`);
  const rows = await db.query(cypher, args);
  return name === "get_accident" ? rows[0] ?? null : rows;
}

export interface GraphTool { name: string; call(args: Record<string, unknown>): Promise<unknown> }

/** Every fixed query as a callable tool, keyed by name (the agent loop's tool map). */
export function graphTools(): Record<string, GraphTool> {
  return Object.fromEntries(Object.keys(CYPHER).map((name) => [name, { name, call: (a: Record<string, unknown>) => runTool(name, a) }]));
}

// Scoring weights mirror packages/agent/src/scoring.ts (kept in sync by hand;
// the backtest sweeps thresholds, not weights).
const W = { structure: 0.4, signature: 0.4, text_sim: 0.2 } as const;
const T = { clear: 0.6, margin: 0.15, weak: 0.35 } as const;
const lineOf = (bin: string): string => bin.split("/").slice(0, 3).join("/");

export interface RankInput { tail: string; family: string; system: string; narrative: string; asOf: string; windowDays?: number }
interface Scored { modeId: string; name: string; structure: number; signature: number; text_sim: number; score: number }

/**
 * Honest leads ranking (D6 fixed Oct 16): every component comes from the graph.
 * - structure: family match (0.5) + system match (0.5). Generic comparison, no per-mode rules.
 * - signature: share of the mode's SIGNATURE lines with a prior report on this tail.
 * - text_sim: best FalkorDB full-text score of the narrative among reports on the
 *   mode's signature lines, normalized by the top hit (0 when nothing matches).
 * Modes without same-family, same-system, same-line or textual overlap score ~0:
 * there is no hard-coded 0.9 for any accident. Only modes known before asOf are
 * candidates (rank_failure_modes query), so a replay never ranks a mode written later.
 */
export function scoreCandidates(input: RankInput, modes: Array<{ id: string; name: string; system: string; mechanism?: string; sig: Array<{ bin: string }> }>, priors: Array<{ bin?: string }>, sims: Array<{ bin?: string; score?: number }>): { scored: Scored[]; decision: "clear" | "ambiguous" | "weak" | "none" } {
  const top = Math.max(0, ...sims.map((s) => Number(s.score ?? 0)));
  const scored = modes.map((m) => {
    const fam = (m as { family?: string }).family;
    const structure = (fam === input.family ? 0.5 : 0) + (String(m.system) === String(input.system) ? 0.5 : 0);
    const sigLines = new Set(m.sig.map((s) => s.bin).filter(Boolean));
    const priorLines = new Set(priors.map((p) => (p.bin ? lineOf(p.bin) : "")).filter(Boolean));
    const hit = [...sigLines].filter((l) => priorLines.has(l) || [...priorLines].some((p) => p.startsWith(l + "/") || l.startsWith(p + "/")));
    const signature = sigLines.size ? hit.length / sigLines.size : 0;
    const simHit = sims.filter((s) => s.bin && [...sigLines].some((l) => { const b = lineOf(s.bin!); return b === l || b.startsWith(l + "/"); }));
    const text_sim = top > 0 ? Math.max(0, ...simHit.map((s) => Number(s.score ?? 0))) / top : 0;
    return { modeId: m.id, name: m.name, structure, signature, text_sim, score: W.structure * structure + W.signature * signature + W.text_sim * text_sim };
  }).sort((a, b) => b.score - a.score);
  const t1 = scored[0]?.score ?? 0, t2 = scored[1]?.score ?? 0;
  const decision = t1 >= T.clear && t1 - t2 >= T.margin ? "clear" : t1 >= T.clear ? "ambiguous" : t1 >= T.weak ? "weak" : "none";
  return { scored, decision };
}

/** Fixed multi-query pipeline behind the rank_failure_modes tool (still no raw Cypher for the agent). */
export async function rankModes(db: Db, a: Record<string, unknown>): Promise<unknown> {
  const input = a as unknown as RankInput;
  const modes = (await db.query(CYPHER.rank_failure_modes, { asOf: input.asOf })) as Array<{ id: string; name: string; system: string; sig: Array<{ bin: string }> }>;
  const priors = (await db.query(CYPHER.prior_reports, { tail: input.tail, bin: null, asOf: input.asOf, windowDays: input.windowDays ?? 730 })) as Array<{ bin?: string }>;
  const sims = (await db.query(CYPHER.similar_reports, { text: input.narrative, asOf: input.asOf })) as Array<{ bin?: string; score?: number }>;
  return { input: { tail: input.tail, family: input.family, system: input.system, asOf: input.asOf }, ...scoreCandidates(input, modes, priors, sims) };
}

// Offline fixture answers (DEMO=1 only), shaped like the real query results.
function demo(name: string, a: Record<string, unknown>): unknown {
  switch (name) {
    case "get_accident": return DEMO.accidents.find((x) => x.ev_id === a.ev_id) ?? DEMO.accidents[0];
    case "prior_reports": return DEMO.priorReports.filter((r) => !a.tail || r.tail === a.tail);
    case "fleet_reports": return [{ bin: a.bin, note: DEMO.fleetNote }];
    case "fix_orders": return DEMO.fixOrders.filter((f) => !a.asOf || f.date <= String(a.asOf));
    case "rank_failure_modes": return DEMO.failureModes.filter((m) => m.status === "confirmed" && ("known_from" in m ? m.known_from ?? "9999" : "9999") < String(a.asOf));
    case "failure_mode_candidates": return DEMO.failureModes.filter((m) => m.status !== "confirmed");
    case "why_task": return DEMO.org.taskCards;
    default: return { demo: true, tool: name, note: "no fixture for this tool; run against FalkorDB" };
  }
}
