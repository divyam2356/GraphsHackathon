// Tool-calling investigator. The model runs on OpenRouter (OpenAI-compatible chat
// completions); its tools are discovered from our MCP server (tools/list) and run
// through it (tools/call), so it only ever reaches FalkorDB through fixed Cypher.
// runAgent / runScripted stream Steps to a callback; the web UI animates them.
// Env: OPENROUTER_API_KEY (or LLM_API_KEY), LLM_MODEL, LLM_BASE_URL.
import "@blackbox/graph/src/env"; // repo-root .env (Next only loads apps/web/.env)
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CYPHER } from "@blackbox/graph/queries/cypher";
import { runTool } from "@blackbox/graph/src/run";

export interface Keys { accidents: string[]; reports: string[]; aircraft: string[]; locations: string[]; fixorders: string[]; modes: string[] }
export type Step =
  | { type: "note"; text: string }
  | { type: "tool_call"; id: string; name: string; args: Record<string, unknown>; cypher?: string }
  | { type: "tool_result"; id: string; name: string; ms: number; rows: number; isError: boolean; preview: unknown; keys: Keys }
  | { type: "answer"; text: string }
  | { type: "error"; text: string };
export type Emit = (s: Step) => void;

const BASE = process.env.LLM_BASE_URL ?? "https://openrouter.ai/api/v1";
// Free models (50 requests/day, often rate-limited upstream): try the primary, then these in order.
const model = () => process.env.LLM_MODEL ?? "nvidia/nemotron-3-super-120b-a12b:free";
// OpenRouter takes at most 3 models per request (primary + 2 fallbacks).
// Named models only: the openrouter/free router picked a 2.6B model that broke the framing rule.
const fallbacks = () => (process.env.LLM_FALLBACKS ?? "nvidia/nemotron-3.5-lightning:free,poolside/laguna-s-2.1:free")
  .split(",").map((m) => m.trim()).filter((m) => m && m !== model()).slice(0, 2);
const apiKey = () => process.env.OPENROUTER_API_KEY ?? process.env.LLM_API_KEY;
export const agentModel = model;
export const hasAgentKey = () => Boolean(apiKey());

export const system = (asOf: string) => `You are Black Box, an investigator's assistant. You work over a FalkorDB graph of NTSB mechanical accidents and incidents (2008 onward) and FAA maintenance reports (Service Difficulty Reports), joined by aircraft and by location.

Rules:
- You report warning signs and leads worth review, never causes. The NTSB determines causes. Mechanical and structural events only.
- The investigation date is ${asOf}. Records after it do not exist for you; the tools enforce this.
- Location keys: "737/53" = 737 fuselage (ATA chapter 53), "737/53/S4L" = stringer 4 left, "737/53/S4L/BS620" = body stations 620-639 on that stringer. A query at a line includes the bins inside it.
- A join is not evidence by itself: keep a report only if it is the same system and the same location or mechanism as the finding. Drop unrelated reports and reports that describe the event itself.

Method for an accident: past_investigations first (what earlier runs kept; check those reports and say in one sentence whether you agree), get_accident, then prior_reports on the same tail (at the finding's location, and once without a location), judge each report, then fleet_reports at that line for the 3 years before, then fix_orders, then explain_path from the strongest warning sign to the accident, then record_precursor for each report you keep (confidence 0-1, one-line reason).
For a new pattern no known mode fits: failure_mode_candidates first, add_support if one fits, otherwise propose_failure_mode. A human approves it in the UI; you cannot.

Answer in under 180 words, plain sentences. Cite record ids exactly as the tools return them (report ids like SWAA101399, ev_ids, AD numbers, location keys) so the interface can link them. End with one line starting "Leads worth review:". Just before it, add a "Conclusion (leads worth review, not causes):" paragraph that ranks what to inspect first, ordered by evidence strength (same-tail reports at the finding's location first, then fleet-wide lines, noting whether a fix order covers them). Never state or imply a probability that anything caused the accident.`;

// ---------- MCP client (one per process; on globalThis so Next dev reloads reuse it) ----------
const g = globalThis as { __blackboxMcp?: Promise<Client> | null };

function repoRoot(): string {
  let d = process.cwd();
  for (let i = 0; i < 6; i++) {
    const p = join(d, "package.json");
    if (existsSync(p) && JSON.parse(readFileSync(p, "utf8")).name === "blackbox") return d;
    d = dirname(d);
  }
  throw new Error("blackbox repo root not found from " + process.cwd());
}

/** Our MCP server as a child process; the env passes only what it needs. */
export function mcp(): Promise<Client> {
  return (g.__blackboxMcp ??= (async () => {
    const root = repoRoot();
    const env: Record<string, string> = { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" };
    for (const k of ["FALKORDB_URL", "FALKORDB_GRAPH", "DEMO"]) if (process.env[k]) env[k] = process.env[k]!;
    const c = new Client({ name: "blackbox-agent", version: "0.1.0" });
    await c.connect(new StdioClientTransport({
      command: process.execPath, args: [join(root, "node_modules/tsx/dist/cli.mjs"), join(root, "packages/mcp-server/src/index.ts")],
      cwd: root, env, stderr: "inherit",
    }));
    return c;
  })().catch((e) => { g.__blackboxMcp = null; throw e; }));
}

// ---------- one tool call through MCP, with the time machine enforced ----------
async function call(c: Client, name: string, args: Record<string, unknown>, asOf: string, emit: Emit, id: string, schemas: Map<string, Record<string, unknown>>, runId?: string) {
  const props = (schemas.get(name)?.properties ?? {}) as Record<string, unknown>;
  const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  if ("asOf" in props && (!isDate(args.asOf) || args.asOf > asOf)) args.asOf = asOf;
  if (isDate(args.to) && args.to > asOf) args.to = asOf; // fleet_reports' end date (explain_path's `to` is a record id)
  if (name === "record_precursor") args.runId = runId; // the harness, not the model, names the run
  emit({ type: "tool_call", id, name, args, cypher: CYPHER[name]?.trim() });
  const t0 = Date.now();
  const res = (await c.callTool({ name, arguments: args })) as { content?: Array<{ type: string; text?: string }>; isError?: boolean };
  const text = res.content?.find((b) => b.type === "text")?.text ?? "";
  let data: unknown = text;
  try { data = JSON.parse(text); } catch { /* error text */ }
  emit({
    type: "tool_result", id, name, ms: Date.now() - t0, isError: Boolean(res.isError),
    rows: Array.isArray(data) ? data.length : data ? 1 : 0, preview: preview(data), keys: keysFrom(name, args, data),
  });
  return { text, data };
}

type Msg = { role: string; content: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>; tool_call_id?: string };

/** The MCP server's tools as OpenAI-style function specs, plus their input schemas by name. */
export async function toolSpecs(c: Client) {
  const { tools } = await c.listTools();
  const schemas = new Map(tools.map((t) => [t.name, t.inputSchema as Record<string, unknown>]));
  const oaTools = tools.map((t) => {
    const { $schema: _drop, ...parameters } = t.inputSchema as Record<string, unknown>;
    return { type: "function", function: { name: t.name, description: t.description ?? "", parameters } };
  });
  return { schemas, oaTools };
}

// ---------- the run log behind past_investigations (written by the harness, never the model) ----------
async function startRun(evId: string | undefined, asOf: string, mode: string, model: string, question: string): Promise<string | undefined> {
  if (!evId) return undefined;
  const rows = (await runTool("start_investigation", { ev_id: evId, asOf, mode, model, question, at: new Date().toISOString() }).catch(() => [])) as Array<{ id: string }>;
  return rows[0]?.id;
}
async function finishRun(id: string | undefined, answer: string): Promise<void> {
  if (!id) return;
  const leads = answer.match(/Leads worth review:[^\n]*/)?.[0] ?? null;
  await runTool("finish_investigation", { id, at: new Date().toISOString(), leads, answer: answer.slice(0, 2000) }).catch(() => undefined);
}

/** Model-driven investigation: the model picks tools until it answers (max steps).
 *  Free OpenRouter models allow 50 requests a day, so the step budget is kept small. */
export async function runAgent(question: string, asOf: string, emit: Emit, opts: { evId?: string; maxSteps?: number } = {}): Promise<void> {
  const maxSteps = opts.maxSteps ?? 10;
  if (!apiKey()) throw new Error("No LLM key: set OPENROUTER_API_KEY in .env (or use the scripted run)");
  const c = await mcp();
  const { schemas, oaTools } = await toolSpecs(c);
  const messages: Msg[] = [{ role: "system", content: system(asOf) }, { role: "user", content: question }];
  const runId = await startRun(question.match(/\b\d{8}X\d{5}\b/)?.[0] ?? opts.evId, asOf, "agent", model(), question);
  const answer = async (text: string) => { emit({ type: "answer", text }); await finishRun(runId, text); };
  let answeredBy = "";
  const used = new Set<string>(), nudged = new Set<string>();
  for (let i = 0; i < maxSteps; i++) {
    const j = await complete({ model: model(), models: [model(), ...fallbacks()], messages, tools: oaTools, tool_choice: "auto", max_tokens: 4000 }, emit);
    const msg = j.choices?.[0]?.message;
    if (!msg) throw new Error(`LLM returned no message: ${JSON.stringify(j.error ?? j).slice(0, 200)}`);
    if (j.model && j.model !== answeredBy) { answeredBy = j.model; emit({ type: "note", text: `Model: ${j.model}` }); }
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
    if (!msg.tool_calls?.length) {
      const text = msg.content ?? "";
      // Harness checks for weaker models, one nudge each: finish the method, keep the framing.
      const missing = ["fleet_reports", "explain_path"].filter((t) => !used.has(t));
      const fix = !nudged.has("method") && used.has("prior_reports") && missing.length
        ? (nudged.add("method"), `Before answering, finish the method: ${missing.join(" and ")}. Then answer.`)
        : !nudged.has("framing") && CAUSAL.test(text)
          ? (nudged.add("framing"), "Rewrite the answer without saying what caused or contributed to the accident: report warning signs and leads worth review only. The NTSB determines causes.")
          : null;
      if (fix && i < maxSteps - 1) {
        emit({ type: "note", text: `Harness: ${fix}` });
        messages.push({ role: "user", content: fix });
        continue;
      }
      await answer(text);
      return;
    }
    if (msg.content?.trim()) emit({ type: "note", text: msg.content.trim() });
    for (const tc of msg.tool_calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /* model sent bad JSON: call with none, the tool reports what's missing */ }
      used.add(tc.function.name);
      const { text } = await call(c, tc.function.name, args, asOf, emit, tc.id, schemas, runId);
      messages.push({ role: "tool", tool_call_id: tc.id, content: text.slice(0, 12000) });
    }
  }
  await answer("Stopped at the step limit before a final answer.");
}

// Causal language the answer must not use (we report warning signs; the NTSB determines causes).
const CAUSAL = /\b(caused|causing|contribut\w*|led to|resulted in|responsible for|root cause|escalated)\b/i;

/** One chat completion. Free providers often return 429/502/503 for a few seconds:
 *  OpenRouter tries the `models` fallbacks first; if all are busy we wait and retry twice. */
async function complete(body: Record<string, unknown>, emit: Emit): Promise<{ model?: string; error?: unknown; choices?: Array<{ message: Msg }> }> {
  for (let attempt = 0; ; attempt++) {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json", authorization: `Bearer ${apiKey()}`,
        "HTTP-Referer": "https://github.com/divyam2356/GraphsHackathon", "X-Title": "Black Box",
      },
      body: JSON.stringify(body),
    });
    if (r.ok) return r.json();
    const text = (await r.text()).slice(0, 300);
    if (attempt >= 3 || ![429, 502, 503].includes(r.status)) throw new Error(`LLM ${r.status}: ${text}`);
    emit({ type: "note", text: `Free models busy (${r.status}), retrying in ${4 * (attempt + 1)} s` });
    await new Promise((ok) => setTimeout(ok, 4000 * (attempt + 1)));
  }
}

/** The same method with no model: a fixed tool sequence for one accident. Labelled "scripted" in the UI. */
export async function runScripted(evId: string, asOf: string, emit: Emit, opts: { draft?: boolean } = {}): Promise<void> {
  const c = await mcp();
  const { tools } = await c.listTools();
  const schemas = new Map(tools.map((t) => [t.name, t.inputSchema as Record<string, unknown>]));
  let n = 0;
  const go = (name: string, args: Record<string, unknown>) => call(c, name, args, asOf, emit, `s${++n}`, schemas);
  const runId = await startRun(evId, asOf, opts.draft ? "scripted, draft" : "scripted", "fixed method, no model", `Scripted method for ${evId}`);
  const pastData = (await go("past_investigations", { ev_id: evId })).data;
  const past = Array.isArray(pastData) ? (pastData as Past[]) : []; // DEMO=1 has no run log
  const acc = (await go("get_accident", { ev_id: evId })).data as { tail?: string; family?: string; findings?: Array<{ at?: string; kind?: string; finding?: string }> } | null;
  if (!acc?.tail) { emit({ type: "error", text: `No mechanical NTSB event ${evId} in the graph` }); return; }
  const at = acc.findings?.find((f) => f.kind === "cause")?.at ?? acc.findings?.[0]?.at;
  const line = at?.split("/").slice(0, 3).join("/");
  const prior = (await go("prior_reports", { tail: acc.tail, bin: line, asOf, windowDays: 730 })).data as Array<{ id: string; date: string; part?: string; condition?: string }>;
  let fleet: { aircraft?: number } | undefined, orders: unknown[] = [];
  if (line) {
    const from = `${Number(asOf.slice(0, 4)) - 3}${asOf.slice(4)}`;
    fleet = ((await go("fleet_reports", { family: acc.family, bin: line, from, to: asOf })).data as Array<{ aircraft?: number }>)?.[0];
    orders = ((await go("fix_orders", { family: acc.family, bin: line, asOf })).data as unknown[]) ?? [];
  }
  if (prior?.[0]) await go("explain_path", { from: prior[prior.length - 1].id, to: evId });
  const what = (p: { part?: string; condition?: string }) => [p.part, p.condition].filter(Boolean).join(" ").toLowerCase() || "a report";
  const day = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  const parts = prior?.length
    ? [`${acc.tail} had ${prior.length === 1 ? "one report" : `${prior.length} reports`} at ${line} in the two years before ${day(asOf)}: ${prior.map((p) => `${p.id} (${what(p)}, ${day(p.date)})`).join(", ")}.`]
    : [`No reports on ${acc.tail} at ${line ?? "the finding's location"} in the two years before ${day(asOf)}.`];
  if (fleet?.aircraft) parts.push(`Across the fleet, ${fleet.aircraft} ${acc.family}s reported trouble on that line in the three years before.`);
  parts.push(orders.length ? `${orders.length} fix order(s) already covered it.` : "No fix order covered that line yet.");
  // memory across sessions: compare with what the latest judged run kept
  const judged = past.find((p) => p.kept?.length);
  if (judged) {
    const same = judged.kept.every((k) => prior?.some((p) => p.id === k.report));
    const who = judged.model?.split("/").pop()?.replace(/:free$/, "") ?? judged.mode;
    parts.push(`An earlier run (${who}, run on ${day(judged.run_at.slice(0, 10))}) kept ${judged.kept.map((k) => `${k.report} (confidence ${k.confidence})`).join(", ")}; ${same ? "this run finds the same reports" : "this run's reports differ"}.`);
  } else if (past.length) parts.push(`${past.length} earlier run${past.length === 1 ? "" : "s"} on this accident, none with judged reports yet.`);
  if (prior?.length && line) {
    // Decisive but non-causal: rank what to inspect first by evidence strength.
    // Never a probability of causation — the NTSB determines causes.
    const sameTail = `${prior.length} same-tail report${prior.length === 1 ? "" : "s"}`;
    const fleetEv = fleet?.aircraft ? ` and ${fleet.aircraft} fleet aircraft` : "";
    const coverage = orders.length ? "a fix order exists, so check compliance first" : "no fix order covers it";
    parts.push(`Leads worth review: inspect ${line} first (${sameTail}${fleetEv} on that line; ${coverage}).`);
  }
  if (opts.draft && prior?.length && line) {
    // the method's last step: does a mode known before asOf fit? If not, check the
    // unconfirmed candidates, then draft one for a person to decide
    // narrative = the damaged component only ("Aircraft structures-Fuselage-…-<cause>" minus the cause)
    const chapter = line.split("/")[1];
    const damaged = acc.findings?.find((f) => f.at === at)?.finding?.split("-").slice(1, -1).join(" ") || line;
    const ranked = (await go("rank_failure_modes", { tail: acc.tail, family: acc.family, system: chapter, narrative: damaged, asOf })).data as { decision?: string } | null;
    if (ranked?.decision && ranked.decision !== "none") parts.push(`A known failure mode may fit (${ranked.decision}); see the ranking.`);
    await go("failure_mode_candidates", { caseId: evId });
    const stringer = line.split("/")[2].replace(/^S(\d+)([LR])$/, "S-$1$2");
    const r = (await go("propose_failure_mode", {
      draft: { name: `Fatigue cracking at the ${stringer} lap joint, ${acc.family} Classic`, system: line.split("/")[1], mechanism: `Cracked stringer clips and skin along ${stringer} ahead of a skin fracture` },
      evidence: [...prior.map((p) => p.id), evId],
    })).data as Array<{ id: string; status: string }>;
    if (r?.[0]) parts.push(`Drafted failure mode ${r[0].id} (${r[0].status}) for a person to review.`);
  }
  const text = parts.join(" ");
  emit({ type: "answer", text });
  await finishRun(runId, text);
}
interface Past { run_at: string; mode: string; model?: string; asOf: string; kept: Array<{ report: string; confidence: number; reason?: string }>; leads?: string }

// ---------- helpers ----------
function preview(data: unknown): unknown {
  if (Array.isArray(data)) return data.slice(0, 8).map(trim);
  return trim(data);
}
function trim(v: unknown): unknown {
  if (typeof v === "string") return v.length > 220 ? v.slice(0, 220) + "…" : v;
  if (Array.isArray(v)) return v.slice(0, 8).map(trim);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, trim(x)]));
  return v;
}

/** Graph node keys a tool call touched, so the UI can draw the evidence subgraph. */
export function keysFrom(name: string, args: Record<string, unknown>, data: unknown): Keys {
  const k: Keys = { accidents: [], reports: [], aircraft: [], locations: [], fixorders: [], modes: [] };
  // rank_failure_modes returns { scored: [{ modeId }], decision }, the rest return rows
  const scored = name === "rank_failure_modes" ? (data as { scored?: Array<{ modeId: string }> } | null)?.scored?.map((s) => ({ id: s.modeId })) : undefined;
  const rows = (scored ?? (Array.isArray(data) ? data : data ? [data] : [])) as Array<Record<string, unknown>>;
  const add = (list: string[], v: unknown) => { if (typeof v === "string" && v && !list.includes(v)) list.push(v); };
  const chain = (bin: unknown) => { if (typeof bin === "string") bin.split("/").forEach((_, i, a) => i >= 1 && add(k.locations, a.slice(0, i + 1).join("/"))); };
  if (typeof args.bin === "string") chain(args.bin);
  for (const r of rows) {
    if (name === "get_accident") {
      add(k.accidents, r.ev_id); add(k.aircraft, r.aircraft);
      for (const f of (r.findings as Array<{ at?: string }> | undefined) ?? []) chain(f.at);
    } else if (name === "search_accidents") add(k.accidents, r.ev_id);
    else if (name === "prior_reports" || name === "similar_reports") { add(k.reports, r.id); chain(r.bin); }
    else if (name === "fix_orders") { add(k.fixorders, r.ad); chain(r.bin); }
    else if (name === "rank_failure_modes" || name === "failure_mode_candidates") add(k.modes, r.id);
    else if (name === "past_investigations") for (const x of (r.kept as Array<{ report?: string }> | undefined) ?? []) add(k.reports, x.report);
    else if (name === "hotspots") chain(r.bin);
    else if (name === "explain_path") {
      for (const h of (r.hops as Array<{ labels: string[]; id: string }> | undefined) ?? []) {
        const l = h.labels[0];
        add(l === "Report" ? k.reports : l === "Accident" ? k.accidents : l === "Aircraft" ? k.aircraft : l === "FixOrder" ? k.fixorders : l === "Location" ? k.locations : [], h.id);
      }
    }
  }
  if (name === "record_precursor") { add(k.reports, args.reportId); add(k.accidents, args.accidentId); }
  return k;
}
