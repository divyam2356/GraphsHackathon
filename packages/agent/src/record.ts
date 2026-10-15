import "@blackbox/graph/src/env";
// Records one investigation to a replay file for the UI's "Recorded" mode, so the
// demo still runs with no LLM key or network. Times are ms since the start.
//   npx tsx packages/agent/src/record.ts --mode=scripted --out=apps/web/public/replays/swa812-scripted.json
//   npx tsx packages/agent/src/record.ts --mode=agent   --out=apps/web/public/replays/swa812-agent.json
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { agentModel, runAgent, runScripted, type Step } from "./agent";

const flag = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const mode = flag("mode", "scripted") as "agent" | "scripted";
const asOf = flag("asOf", "2011-04-01");
const out = flag("out", `apps/web/public/replays/swa812-${mode}.json`);
const question = flag("question", "Southwest 812 (NTSB ev_id 20110401X24330) lost part of its fuselage skin on 1 April 2011. Were there warning signs in the maintenance records before it?");

const t0 = Date.now();
const steps: Array<{ t: number; step: Step }> = [];
const emit = (step: Step) => { steps.push({ t: Date.now() - t0, step }); console.error(step.type, "name" in step ? step.name : ""); };
try {
  if (mode === "agent") await runAgent(question, asOf, emit); else await runScripted("20110401X24330", asOf, emit);
} catch (e) {
  emit({ type: "error", text: (e as Error).message }); // keep the partial run for inspection
}
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify({ mode, model: mode === "agent" ? agentModel() : undefined, asOf, question, recorded: new Date().toISOString(), steps }, null, 1));
console.error(`wrote ${out} (${steps.length} steps)`);
process.exit(0);
