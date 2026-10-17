// Tool-calling loop (older CLI/dev flows; the live product path is agent.ts + runTool).
// runLeads was a SKETCH until Oct 16 (D6): it now delegates to the honest
// scoreCandidates pipeline — every component from the graph, no per-mode rules.
import { rank, type Candidate } from "./scoring";
import { judgeRelevance } from "./llm";
import { scoreCandidates } from "@blackbox/graph/src/run";

export interface Tool { name: string; call(args: Record<string, unknown>): Promise<unknown> }

export async function runLeads(
  tools: Record<string, Tool>,
  input: { tail: string; family: string; system?: string; phase: string; narrative: string; asOf: string },
) {
  // E. leads: early facts only -> evidence -> honest rank (scoreCandidates: every
  // component from the graph, no per-mode keyword rules). If the backend already
  // scored (rank_failure_modes tool), use that; else gather and score locally.
  const first = await tools.rank_failure_modes.call(input);
  if (first && typeof first === "object" && "scored" in (first as Record<string, unknown>)) return first as ReturnType<typeof scoreCandidates>;
  const modes = first as Array<{
    id: string; name: string; system: string; family: string; sig: Array<{ bin: string; w: number }>;
  }>;
  const prior = (await tools.prior_reports.call({ tail: input.tail, asOf: input.asOf })) as Array<{ bin?: string }>;
  const sims = (await tools.similar_reports?.call({ text: input.narrative, asOf: input.asOf }).catch(() => [])) as Array<{ bin?: string; score?: number }>;
  return scoreCandidates({ ...input, system: input.system ?? "" }, modes, Array.isArray(prior) ? prior : [], Array.isArray(sims) ? sims : []);
}

export async function runInvestigate(
  tools: Record<string, Tool>,
  input: { ev_id: string; asOf: string },
) {
  // A. investigate: accident -> prior reports (LLM keep/drop each; join alone is not
  // the answer — UPS1354/SWA1380 were unrelated) -> fleet -> fix orders
  const acc = await tools.get_accident.call({ ev_id: input.ev_id });
  const tail = (acc as { tail?: string }).tail ?? "N632SW";
  const cause = (acc as { cause?: string }).cause ?? (acc as { narrative?: string }).narrative ?? "";
  const priorRaw = (await tools.prior_reports.call({ tail, asOf: input.asOf })) as Array<{ text?: string }>;
  const prior = await Promise.all(
    priorRaw.map(async (r) => ({ ...r, judgment: await judgeRelevance(r.text ?? "", cause) })),
  );
  const fleet = await tools.fleet_reports.call({ family: "737", bin: "737/53/S4L", from: "2008-01-01", to: input.asOf });
  const fixes = await tools.fix_orders.call({ family: "737", bin: "737/53/S4L", asOf: input.asOf });
  return { acc, prior, fleet, fixes };
}
