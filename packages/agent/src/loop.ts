// Tool-calling loop (older CLI/dev flows; the live product path is agent.ts + runTool).
// NOTE (D6): runLeads below is a SKETCH — text_sim is a hard-coded keyword rule
// over hand-seeded modes, so it cannot fail on SWA 812 and proves nothing. It is
// NOT reachable from the live agent (no MCP tool) or the UI (no route); it survives
// only for the CLI demo and the old eval harness. Fix = score with FalkorDB
// full-text similarity and evaluate; until then do not present it as evidence.
import { rank, type Candidate } from "./scoring";
import { judgeRelevance } from "./llm";

export interface Tool { name: string; call(args: Record<string, unknown>): Promise<unknown> }

export async function runLeads(
  tools: Record<string, Tool>,
  input: { tail: string; family: string; phase: string; narrative: string; asOf: string },
) {
  // E. leads: early facts only -> evidence -> formula rank -> ranked systems+locations
  const modes = (await tools.rank_failure_modes.call(input)) as Array<{
    id: string; name: string; system: string; family: string; sig: Array<{ bin: string; w: number }>;
  }>;
  const prior = (await tools.prior_reports.call({ tail: input.tail, asOf: input.asOf })) as Array<{ bin?: string; text?: string }>;
  const priorBins = prior.map((r) => r.bin).filter((b): b is string => Boolean(b));
  // Location keys nest ("737/53/S4L/BS620" is within "737/53/S4L"), so a signature hits
  // when a prior report sits at that location or anywhere inside it.
  const within = (bin: string, sig: string) => bin === sig || bin.startsWith(`${sig}/`);
  const cands: Candidate[] = modes.map((m) => {
    const structure = m.family === input.family ? (m.system === "structures" && /skin|lap|fuselage/i.test(input.narrative) ? 1 : 0.5) : 0;
    const hit = m.sig.filter((s) => priorBins.some((b) => within(b, s.bin))).length;
    const signature = m.sig.length ? hit / m.sig.length : 0;
    const text_sim = /s-4l|lap joint|crown/i.test(input.narrative) && m.id === "FM-CROWN-S4L" ? 0.9 : 0.1;
    return { modeId: m.id, name: m.name, structure, signature, text_sim };
  });
  return rank(cands);
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
