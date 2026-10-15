// Graph: one database "blackbox". REAL + LEARNED + SYNTHETIC-ORG share it
// because a Cypher query runs against one graph at a time.
// Location is the key join node. Station bins ~20in so nearby cracks share a node.
export const GRAPH_NAME = process.env.FALKORDB_GRAPH ?? "blackbox";

export const SCHEMA_CYPHER = `
// --- REAL (public) ---
// Constraints carry the model; FalkorDB enforces unique ev_id/tail/ad_no.
// (Full DDL in schema.cypher — this string is the app-readable copy.)
`;

export type FailureStatus = "proposed" | "confirmed" | "dormant" | "merged";
export type FailureOrigin = "seed" | "accident" | "observation";

export interface FailureMode {
  id?: string; name: string; system: string; mechanism: string;
  status: FailureStatus; origin: FailureOrigin;
  approved_by?: string; approved_at?: string;
  support_at_decision?: number; decision_reason?: string;
}

export interface CaseScores { modeId: string; structure: number; signature: number; text_sim: number; score: number }

// Explainable formula — LLM never sets the score. Thresholds tuned via backtest.
export const WEIGHTS = { structure: 0.4, signature: 0.4, text_sim: 0.2 } as const;
export const THRESHOLDS = { clear: 0.6, margin: 0.15, weak: 0.35, supportAircraft: 3 } as const;

export function scoreMode(s: { structure: number; signature: number; text_sim: number }): number {
  return WEIGHTS.structure * s.structure + WEIGHTS.signature * s.signature + WEIGHTS.text_sim * s.text_sim;
}

export type Decision = "clear" | "ambiguous" | "weak" | "none";
export function decide(top: number, second: number): Decision {
  if (top >= THRESHOLDS.clear && top - second >= THRESHOLDS.margin) return "clear";
  if (top >= THRESHOLDS.clear) return "ambiguous";
  if (top >= THRESHOLDS.weak) return "weak";
  return "none";
}
