// Explainable scoring — self-contained (no cross-package import so each
// workspace builds standalone). Mirrors packages/graph/src/index.ts constants.
export const WEIGHTS = { structure: 0.4, signature: 0.4, text_sim: 0.2 } as const;
export const THRESHOLDS = { clear: 0.6, margin: 0.15, weak: 0.35, supportAircraft: 3 } as const;

export interface Candidate { modeId: string; name: string; structure: number; signature: number; text_sim: number }
export interface Scored extends Candidate { score: number }
export type Decision = "clear" | "ambiguous" | "weak" | "none";

export function rank(cands: Candidate[]): { scored: Scored[]; decision: Decision } {
  const scored = cands
    .map((c) => ({ ...c, score: WEIGHTS.structure * c.structure + WEIGHTS.signature * c.signature + WEIGHTS.text_sim * c.text_sim }))
    .sort((a, b) => b.score - a.score);
  const top = scored[0]?.score ?? 0, second = scored[1]?.score ?? 0;
  const d: Decision = top >= THRESHOLDS.clear && top - second >= THRESHOLDS.margin ? "clear"
    : top >= THRESHOLDS.clear ? "ambiguous" : top >= THRESHOLDS.weak ? "weak" : "none";
  return { scored, decision: d };
}

// Flows: A investigate (cause known) · E leads (cause unknown) · F learn (approval card)
// B watch (alerts -> work orders) · D company brain. The LLM judges relevance per
// report (join alone is not the answer — UPS1354/SWA1380 were unrelated);
// the FORMULA sets every score.
export const FLOWS = ["A.investigate", "B.watch", "E.leads", "F.learn", "D.company"] as const;
