"use client";
// Agent panel: ask a question, then watch each MCP tool call arrive: tool name,
// arguments, the fixed Cypher behind it, rows and time, and the records it touched.
// Modes: live model on OpenRouter (needs a key), scripted (the same tools in a fixed
// order, no model), recorded (a saved run replayed with its original timing).
import { useEffect, useRef, useState } from "react";
import { streamAgent, type Step } from "../lib/api";
import { SWA812, fmtDate } from "../lib/fuselage";

export type Mode = "agent" | "scripted" | "recorded";
export interface Replay { mode: "agent" | "scripted"; model?: string; asOf: string; question: string; recorded: string; steps: Array<{ t: number; step: Step }> }
type Call = Extract<Step, { type: "tool_call" }>;
type Result = Extract<Step, { type: "tool_result" }>;
type Row = { kind: "tool"; call: Call; result?: Result } | { kind: "note" | "answer" | "error"; text: string };

export const DEFAULT_QUESTION = `Southwest 812 (NTSB ev_id ${SWA812.evId}) lost part of its fuselage skin on 1 April 2011. Were there warning signs in the maintenance records before it?`;
const ID = /(SWAA\d+|[A-Z]{4}\d{6}|\d{8}X\d{5}|AD-\d{4}-\d{2}-\d{2}|737\/53(?:\/S\d+[LR])?(?:\/BS\d+)?)/g;

/** Replays a recorded run, keeping its rhythm (gaps clamped so it never stalls). */
export async function playReplay(r: Replay, onStep: (s: Step) => void, signal: AbortSignal, speed = 1) {
  let prev = 0;
  for (const { t, step } of r.steps) {
    await new Promise((ok) => setTimeout(ok, Math.min(1400, Math.max(160, (t - prev) / speed))));
    if (signal.aborted) return;
    prev = t;
    onStep(step);
  }
}

export function AgentPanel({ asOf, steps, onStep, onReset, onOpen, replayUrl = "/replays/swa812-scripted.json", autorun }: {
  asOf: string; steps: Step[]; onStep: (s: Step) => void; onReset: () => void;
  onOpen: (id: string) => void; replayUrl?: string; autorun?: Mode;
}) {
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [live, setLive] = useState<{ live: boolean; model: string } | null>(null);
  const [mode, setMode] = useState<Mode>("scripted");
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => { const el = list.current; if (el && el.scrollHeight > el.clientHeight) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); }, [steps.length]);

  useEffect(() => {
    fetch("/api/agent").then((r) => r.json()).then((j) => { setLive(j); if (j.live) setMode("agent"); }, () => setLive({ live: false, model: "" }));
  }, []);
  useEffect(() => { if (autorun) run(autorun); }, [autorun]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(m: Mode = mode) {
    abort.current?.abort();
    const a = (abort.current = new AbortController());
    onReset();
    setBusy(true);
    try {
      if (m === "recorded") await playReplay(await fetch(replayUrl).then((r) => r.json()), onStep, a.signal);
      else await streamAgent({ mode: m, question, evId: SWA812.evId, asOf }, onStep, a.signal);
    } catch (e) {
      if (!a.signal.aborted) onStep({ type: "error", text: (e as Error).message });
    }
    if (abort.current === a) setBusy(false);
  }

  const rows: Row[] = [];
  for (const s of steps) {
    if (s.type === "tool_call") rows.push({ kind: "tool", call: s });
    else if (s.type === "tool_result") {
      const r = rows.find((x) => x.kind === "tool" && x.call.id === s.id);
      if (r && r.kind === "tool") r.result = s;
    } else rows.push({ kind: s.type, text: s.text });
  }
  let n = 0;

  return (
    <section className="agent" aria-labelledby="agent-title">
      <h2 id="agent-title" className="panel-title">Ask the graph</h2>
      <form className="ask" onSubmit={(e) => { e.preventDefault(); run(); }}>
        <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} aria-label="Question" disabled={mode === "scripted" || mode === "recorded"} />
        <div className="ask-row">
          <div className="seg" role="group" aria-label="How to run">
            <button type="button" aria-pressed={mode === "agent"} disabled={!live?.live} onClick={() => setMode("agent")}
              title={live?.live ? `${live.model} via OpenRouter` : "Set OPENROUTER_API_KEY in .env to use a live model"}>Live model</button>
            <button type="button" aria-pressed={mode === "scripted"} onClick={() => setMode("scripted")}>Scripted</button>
            <button type="button" aria-pressed={mode === "recorded"} onClick={() => setMode("recorded")}>Recorded</button>
          </div>
          <button type="submit" className="go" disabled={busy}>{busy ? "Investigating" : "Investigate"}</button>
        </div>
        <p className="ask-note">
          {mode === "agent" && live?.live && <>The model ({live.model}) picks MCP tools itself. </>}
          {mode === "scripted" && <>The same MCP tools in a fixed order, with no model. </>}
          {mode === "recorded" && <>A saved run, replayed. </>}
          It sees records before {fmtDate(asOf)}.
        </p>
      </form>

      <ol className="steps" ref={list}>
        {rows.map((r, i) => {
          if (r.kind !== "tool") return <li key={i} className={`step-${r.kind}`}>{r.kind === "answer" ? <Linked text={r.text} onOpen={onOpen} /> : r.text}</li>;
          n++;
          const res = r.result;
          const ids = res ? [...res.keys.accidents, ...res.keys.reports, ...res.keys.fixorders] : [];
          return (
            <li key={r.call.id} className={`step${res ? "" : " running"}`}>
              <span className="step-n">{n}</span>
              <div className="step-body">
                <div className="step-head">
                  <b>{r.call.name}</b>
                  <span className="args">{Object.entries(r.call.args).map(([k, v]) => <span key={k}>{k} <em>{Array.isArray(v) ? v.join(", ") : String(v)}</em></span>)}</span>
                  <span className="res">{res ? (res.isError ? "error" : `${res.rows} ${res.rows === 1 ? "row" : "rows"}, ${res.ms} ms`) : "running"}</span>
                </div>
                {ids.length > 0 && <div className="chips">{ids.slice(0, 8).map((id) => <button key={id} className="chip" onClick={() => onOpen(id)}>{id}</button>)}{ids.length > 8 && <span className="more">and {ids.length - 8} more</span>}</div>}
                {res?.isError && <p className="step-error">{String(res.preview)}</p>}
                {r.call.cypher && <details><summary>Cypher</summary><pre>{r.call.cypher.replace(/^ {4}/gm, "")}</pre></details>}
              </div>
            </li>
          );
        })}
        {!rows.length && <li className="step-empty">Press Investigate. Each tool call appears here with the query behind it, and the records it touches join the evidence graph.</li>}
      </ol>
    </section>
  );
}

/** Answer text with record ids turned into buttons that open the record. */
function Linked({ text, onOpen }: { text: string; onOpen: (id: string) => void }) {
  const parts = text.split(ID);
  return <p>{parts.map((p, i) => (i % 2 ? <button key={i} className="id-link" onClick={() => onOpen(p)}>{p}</button> : p))}</p>;
}
