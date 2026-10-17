import "@blackbox/graph/src/env";
// Adds a recorded run (a replay file) to the graph's run log, so past_investigations
// remembers it: one Investigation with the reports it kept, dated when it was recorded.
// Run once after the seed step; running again adds nothing (same id).
//   npx tsx packages/agent/src/remember.ts apps/web/public/replays/swa812-agent.json
import { readFileSync } from "node:fs";
import { runTool } from "@blackbox/graph/src/run";
import type { Step } from "./agent";

interface Replay { mode: string; model?: string; asOf: string; question: string; recorded: string; steps: Array<{ t: number; step: Step }> }

const file = process.argv[2] ?? "apps/web/public/replays/swa812-agent.json";
const r = JSON.parse(readFileSync(file, "utf8")) as Replay;
const calls = r.steps.map((s) => s.step).filter((s) => s.type === "tool_call");
const evId = r.question.match(/\b\d{8}X\d{5}\b/)?.[0];
if (!evId) throw new Error(`no ev_id in the replay question: ${r.question}`);
const id = `replay:${r.recorded}`;
const answer = [...r.steps].reverse().find((s) => s.step.type === "answer")?.step as { text: string } | undefined;

await runTool("remember_replay", {
  id, ev_id: evId, asOf: r.asOf, mode: r.mode, model: r.model ?? "fixed method, no model", question: r.question, at: r.recorded,
  leads: answer?.text.match(/Leads worth review:[^\n]*/)?.[0] ?? null, answer: answer?.text.slice(0, 2000) ?? null,
});
let kept = 0;
for (const c of calls) {
  if (c.type !== "tool_call" || c.name !== "record_precursor") continue;
  await runTool("record_precursor", { ...c.args, runId: id });
  kept++;
}
console.log(`remembered ${file}: ${evId}, ${kept} kept report(s), run ${id}`);
process.exit(0); // the DB client keeps the event loop alive
