// Tool-calling investigator. The model runs on OpenRouter (OpenAI-compatible chat
// completions); its tools are discovered from our MCP server (tools/list) and run
// through it (tools/call), so it only ever reaches FalkorDB through fixed Cypher.
// runAgent / runScripted stream Steps to a callback; the web UI animates them.
// Env: OPENROUTER_API_KEY (or LLM_API_KEY), LLM_MODEL, LLM_BASE_URL.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CYPHER } from "@blackbox/graph/queries/cypher";

export interface Keys { accidents: string[]; reports: string[]; aircraft: string[]; locations: string[]; fixorders: string[]; modes: string[] }
export type Step =
  | { type: "note"; text: string }
  | { type: "tool_call"; id: string; name: string; args: Record<string, unknown>; cypher?: string }
  | { type: "tool_result"; id: string; name: string; ms: number; rows: number; isError: boolean; preview: unknown; keys: Keys }
  | { type: "answer"; text: string }
  | { type: "error"; text: string };
export type Emit = (s: Step) => void;

const BASE = process.env.LLM_BASE_URL ?? "https://openrouter.ai/api/v1";
const MODEL = process.env.LLM_MODEL ?? "anthropic/claude-haiku-5.5";
const apiKey = () => process.env.OPENROUTER_API_KEY ?? process.env.LLM_API_KEY;
export const agentModel = () => MODEL;
export const hasAgentKey = () => Boolean(apiKey());

const system = (asOf: string) => `You are Black Box, an investigator's assistant. You work over a FalkorDB graph of NTSB mechanical accidents and incidents (2008 onward) and FAA maintenance reports (Service Difficulty Reports), joined by aircraft and by location.

Rules:
- You report warning signs and leads worth review, never causes. The NTSB determines causes. Mechanical and structural events only.
- The investigation date is ${asOf}. Records after it do not exist for you; the tools enforce this.
- Location keys: "737/53" = 737 fuselage (ATA chapter 53), "737/53/S4L" = stringer 4 left, "737/53/S4L/BS620" = body stations 620-639 on that stringer. A query at a line includes the bins inside it.
- A join is not evidence by itself: keep a report only if it is the same system and the same location or mechanism as the finding. Drop unrelated reports and reports that describe the event itself.

Method for an accident: get_accident, then prior_reports on the same tail (at the finding's location, and once without a location), judge each report, then fleet_reports at that line for the 3 years before, then fix_orders, then explain_path from the strongest warning sign to the accident, then record_precursor for each report you keep (confidence 0-1, one-line reason).
For a new pattern no known mode fits: failure_mode_candidates first, add_support if one fits, otherwise propose_failure_mode. A human approves it in the UI; you cannot.

Answer in under 150 words, plain sentences. Cite record ids exactly as the tools return them (report ids like SWAA101399, ev_ids, AD numbers, location keys) so the interface can link them. End with one line starting "Leads worth review:".`;

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
async function call(c: Client, name: string, args: Record<string, unknown>, asOf: string, emit: Emit, id: string, schemas: Map<string, Record<string, unknown>>) {
  const props = (schemas.get(name)?.properties ?? {}) as Record<string, unknown>;
  const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
  if ("asOf" in props && (!isDate(args.asOf) || args.asOf > asOf)) args.asOf = asOf;
  if (isDate(args.to) && args.to > asOf) args.to = asOf; // fleet_reports' end date (explain_path's `to` is a record id)
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

/** Model-driven investigation: the model picks tools until it answers (max steps). */
export async function runAgent(question: string, asOf: string, emit: Emit, maxSteps = 14): Promise<void> {
  if (!apiKey()) throw new Error("No LLM key: set OPENROUTER_API_KEY in .env (or use the scripted run)");
  const c = await mcp();
  const { tools } = await c.listTools();
  const schemas = new Map(tools.map((t) => [t.name, t.inputSchema as Record<string, unknown>]));
  const oaTools = tools.map((t) => {
    const { $schema: _drop, ...parameters } = t.inputSchema as Record<string, unknown>;
    return { type: "function", function: { name: t.name, description: t.description ?? "", parameters } };
  });
  type Msg = { role: string; content: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>; tool_call_id?: string };
  const messages: Msg[] = [{ role: "system", content: system(asOf) }, { role: "user", content: question }];
  for (let i = 0; i < maxSteps; i++) {
    const r = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json", authorization: `Bearer ${apiKey()}`,
        "HTTP-Referer": "https://github.com/divyam2356/GraphsHackathon", "X-Title": "Black Box",
      },
      body: JSON.stringify({ model: MODEL, messages, tools: oaTools, tool_choice: "auto", max_tokens: 4000 }),
    });
    if (!r.ok) throw new Error(`LLM ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = (await r.json()) as { choices?: Array<{ message: Msg }> };
    const msg = j.choices?.[0]?.message;
    if (!msg) throw new Error("LLM returned no message");
    messages.push({ role: "assistant", content: msg.content ?? null, tool_calls: msg.tool_calls });
    if (!msg.tool_calls?.length) { emit({ type: "answer", text: msg.content ?? "" }); return; }
    if (msg.content?.trim()) emit({ type: "note", text: msg.content.trim() });
    for (const tc of msg.tool_calls) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /* model sent bad JSON: call with none, the tool reports what's missing */ }
      const { text } = await call(c, tc.function.name, args, asOf, emit, tc.id, schemas);
      messages.push({ role: "tool", tool_call_id: tc.id, content: text.slice(0, 12000) });
    }
  }
  emit({ type: "answer", text: "Stopped at the step limit before a final answer." });
}

/** The same method with no model: a fixed tool sequence for one accident. Labelled "scripted" in the UI. */
export async function runScripted(evId: string, asOf: string, emit: Emit, opts: { draft?: boolean } = {}): Promise<void> {
  const c = await mcp();
  const { tools } = await c.listTools();
  const schemas = new Map(tools.map((t) => [t.name, t.inputSchema as Record<string, unknown>]));
  let n = 0;
  const go = (name: string, args: Record<string, unknown>) => call(c, name, args, asOf, emit, `s${++n}`, schemas);
  const acc = (await go("get_accident", { ev_id: evId })).data as { tail?: string; family?: string; findings?: Array<{ at?: string; kind?: string }> } | null;
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
  if (prior?.length) parts.push(`Leads worth review: ${line}.`);
  if (opts.draft && prior?.length && line) {
    // the method's last step: check known candidates, then draft one for a person to decide
    await go("failure_mode_candidates", { caseId: evId });
    const stringer = line.split("/")[2].replace(/^S(\d+)([LR])$/, "S-$1$2");
    const r = (await go("propose_failure_mode", {
      draft: { name: `Fatigue cracking at the ${stringer} lap joint, ${acc.family} Classic`, system: line.split("/")[1], mechanism: `Cracked stringer clips and skin along ${stringer} ahead of a skin fracture` },
      evidence: [...prior.map((p) => p.id), evId],
    })).data as Array<{ id: string; status: string }>;
    if (r?.[0]) parts.push(`Drafted failure mode ${r[0].id} (${r[0].status}) for a person to review.`);
  }
  emit({ type: "answer", text: parts.join(" ") });
}

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
  const rows = (Array.isArray(data) ? data : data ? [data] : []) as Array<Record<string, unknown>>;
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
