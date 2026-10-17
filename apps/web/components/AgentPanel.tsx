"use client";
// Agent panel: ask a question, then watch each MCP tool call arrive: tool name,
// arguments, the fixed Cypher behind it, rows and time, and the records it touched.
// Modes: live model on OpenRouter (needs a key), scripted (the same tools in a fixed
// order, no model), recorded (a saved run replayed with its original timing).
import { useEffect, useRef, useState } from "react";
import { streamAgent, type Step } from "../lib/api";
import { SWA812, fmtDate } from "../lib/fuselage";
import { MODE_TIPS, TERMS, TOOL_TIPS, idTip } from "../lib/glossary";
import { Term } from "./Tip";

export type Mode = "agent" | "scripted" | "recorded";
/** Fleet lift per stringer line: distinct aircraft in the window vs the one before. */
export interface Lift { ac: number; acPrev: number; lift: number }
/** "737/53/S4L/BS620" -> "737/53/S4L" (any level rolls up to its line). */
export const lineOf = (bin: string): string => bin.split("/").slice(0, 3).join("/");
export interface Replay { mode: "agent" | "scripted"; model?: string; asOf: string; question: string; recorded: string; steps: Array<{ t: number; step: Step }> }
type Call = Extract<Step, { type: "tool_call" }>;
type Result = Extract<Step, { type: "tool_result" }>;
type Row = { kind: "tool"; call: Call; result?: Result } | { kind: "note" | "answer" | "error"; text: string };

const ASK = "Were there warning signs in the maintenance records before it?";
export const DEFAULT_QUESTION = `Southwest 812 (NTSB ev_id ${SWA812.evId}) lost part of its fuselage skin on 1 April 2011. ${ASK}`;
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

export function AgentPanel({ asOf, steps, onStep, onReset, onOpen, replayUrl = "/replays/swa812-agent.json", autorun, hideAnswer, showSteps = true }: {
  asOf: string; steps: Step[]; onStep: (s: Step) => void; onReset: () => void;
  onOpen: (id: string) => void; replayUrl?: string; autorun?: Mode; hideAnswer?: boolean; showSteps?: boolean;
}) {
  const [question, setQuestion] = useState(DEFAULT_QUESTION);
  const [live, setLive] = useState<{ live: boolean; model: string } | null>(null);
  const [mode, setMode] = useState<Mode>("recorded");
  const [busy, setBusy] = useState(false);
  const [replay, setReplay] = useState<Replay | null>(null);
  const abort = useRef<AbortController | null>(null);

  useEffect(() => {
    fetch("/api/agent").then((r) => r.json()).then((j) => setLive(j), () => setLive({ live: false, model: "" }));
    fetch(replayUrl).then((r) => (r.ok ? r.json() : null)).then(setReplay, () => {});
  }, []);
  useEffect(() => { if (autorun) { setMode(autorun); run(autorun); } }, [autorun]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(m: Mode = mode) {
    abort.current?.abort();
    const a = (abort.current = new AbortController());
    onReset();
    setBusy(true);
    try {
      if (m === "recorded") await playReplay(replay ?? (await fetch(replayUrl).then((r) => r.json())), onStep, a.signal);
      else await streamAgent({ mode: m, question, evId: SWA812.evId, asOf }, onStep, a.signal);
    } catch (e) {
      if (!a.signal.aborted) onStep({ type: "error", text: (e as Error).message });
    }
    if (abort.current === a) setBusy(false);
  }

  return (
    <section className="agent" aria-labelledby="agent-title">
      <h2 id="agent-title" className="panel-title">Ask the graph</h2>
      <form className="ask" onSubmit={(e) => { e.preventDefault(); run(); }}>
        {/* the case, labelled for viewers who don't know aircraft; only the live model takes a free question */}
        <dl className="case">
          <dt>Accident</dt>
          <dd>Southwest 812, {fmtDate(SWA812.date)} · <Term tip={TERMS.ntsb}>NTSB</Term> event {SWA812.evId}</dd>
          <dt>Aircraft</dt>
          <dd><Term tip={TERMS.tail}>{SWA812.tail}</Term>, a <Term tip={TERMS.classics}>Boeing {SWA812.variant}</Term></dd>
          <dt>Part</dt>
          <dd>Crown skin at the <Term tip={TERMS.lapJoint}>lap joint</Term> on <Term tip={TERMS.stringer}>stringer S-4L</Term>, <Term tip={TERMS.bodyStation}>body station</Term> {SWA812.rupture.from}–{SWA812.rupture.to}</dd>
          <dt>Fleet</dt>
          <dd><Term tip={TERMS.fleet}>Every Boeing 737</Term> in the FAA maintenance reports</dd>
          <dt>Records</dt>
          <dd><Term tip={TERMS.timeMachine}>Dated before {fmtDate(mode === "recorded" && replay ? replay.asOf : asOf)}</Term></dd>
          <dt>Question</dt>
          <dd>{mode === "agent"
            ? <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={4} aria-label="Question for the live model" />
            : ASK}</dd>
        </dl>
        <div className="ask-row">
          <div className="seg" role="group" aria-label="How to run">
            <button type="button" aria-pressed={mode === "agent"} aria-disabled={!live?.live} onClick={() => live?.live && setMode("agent")}
              data-tip={live?.live ? `${MODE_TIPS.agent} Model: ${live.model}.` : `${MODE_TIPS.agent} ${MODE_TIPS.agentOff}`}>Live model</button>
            <button type="button" aria-pressed={mode === "scripted"} onClick={() => setMode("scripted")} data-tip={MODE_TIPS.scripted}>Scripted</button>
            <button type="button" aria-pressed={mode === "recorded"} onClick={() => setMode("recorded")} data-tip={MODE_TIPS.recorded}>Recorded</button>
          </div>
          <button type="submit" className="go" disabled={busy}>{busy ? "Investigating" : "Investigate"}</button>
        </div>
        <p className="ask-note">
          {mode === "agent" && live?.live && <>{live.model} (free tier) picks the MCP tools itself. Free models can take a few minutes.</>}
          {mode === "scripted" && <>The same MCP tools in a fixed order, with no model.</>}
          {mode === "recorded" && replay && <>A real {replay.mode === "agent" ? `run of ${replay.model}` : "scripted run"}, saved {new Date(replay.recorded).toLocaleDateString("en-GB", { day: "numeric", month: "short" })} and replayed faster.</>}
        </p>
      </form>

      {showSteps && <StepsGrid steps={steps} onOpen={onOpen} hideAnswer={hideAnswer} />}
    </section>
  );
}

/** The trace as a wrapping card grid: chronological left-to-right, notes span full width. */
export function StepsGrid({ steps, onOpen, hideAnswer, lifts }: { steps: Step[]; onOpen: (id: string) => void; hideAnswer?: boolean; lifts?: Map<string, Lift> }) {
  const rows: Row[] = [];
  for (const s of steps) {
    if (hideAnswer && s.type === "answer") continue;
    if (s.type === "tool_call") rows.push({ kind: "tool", call: s });
    else if (s.type === "tool_result") {
      const r = rows.find((x) => x.kind === "tool" && x.call.id === s.id);
      if (r && r.kind === "tool") r.result = s;
    } else rows.push({ kind: s.type, text: s.text });
  }
  // Confidence the agent actually judged, per report: record_precursor calls carry
  // (reportId, confidence). Read tools return records, not judgments, so kept
  // reports get their judged confidence badged on their chips instead of invented scores.
  const kept = new Map<string, number>();
  for (const r of rows) {
    if (r.kind === "tool" && r.call.name === "record_precursor") {
      const id = r.call.args.reportId, c = r.call.args.confidence;
      if (typeof id === "string") kept.set(id, typeof c === "number" ? c : NaN);
    }
  }
  return <StepsList rows={rows} kept={kept} lifts={lifts} onOpen={onOpen} />;
}

function StepsList({ rows, kept, lifts, onOpen }: { rows: Row[]; kept: Map<string, number>; lifts?: Map<string, Lift>; onOpen: (id: string) => void }) {
  const list = useRef<HTMLOListElement>(null);
  useEffect(() => { const el = list.current; if (el && el.scrollHeight > el.clientHeight) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); }, [rows.length]);
  let n = 0;
  // Harness notes are meta, not evidence: render them above the grid so tool
  // cards always fill each row left-to-right with no mid-row breaks.
  const notes = rows.filter((r) => r.kind === "note");
  const cards = rows.filter((r) => r.kind !== "note");
  return (
    <>
      {notes.length > 0 && <div className="run-notes">{notes.map((r, i) => <p key={i}>{r.kind === "note" ? r.text : ""}</p>)}</div>}
      <ol className="steps grid" ref={list}>
        {cards.map((r, i) => {
          if (r.kind !== "tool") return <li key={i} className={`step-${r.kind}`}><span className="step-n" aria-hidden="true">{r.kind === "answer" ? "◆" : r.kind === "error" ? "!" : ""}</span><div className="step-body">{r.kind === "answer" ? <Linked text={r.text} onOpen={onOpen} /> : <p>{r.text}</p>}</div></li>;
          n++;
          const res = r.result;
          const ids = res ? [...res.keys.accidents, ...res.keys.reports, ...res.keys.fixorders] : [];
          const lift = r.call.name === "prior_reports" && typeof r.call.args.bin === "string" ? lifts?.get(lineOf(r.call.args.bin)) : undefined;
          return (
            <li key={r.call.id} className={`step dense${res ? "" : " running"}`}>
              <span className="step-n">{n}</span>
              <div className="step-body">
                <div className="step-line">
                  <b className={TOOL_TIPS[r.call.name] ? "term" : undefined} data-tip={TOOL_TIPS[r.call.name]}>{r.call.name}</b>
                  <span className="args">{Object.entries(r.call.args).map(([k, v]) => <span key={k}>{k} <em>{Array.isArray(v) ? v.join(", ") : String(v)}</em></span>)}</span>
                  {ids.length > 0 && <span className="chips inline">{ids.slice(0, 5).map((id) => { const kc = kept.get(id); return <button key={id} onClick={() => onOpen(id)} className={kc !== undefined ? "chip kept" : "chip"} data-tip={kc !== undefined && !Number.isNaN(kc) ? `Kept as a possible warning sign, confidence ${kc}. ${idTip(id)}` : idTip(id)}>{id}{kc !== undefined && !Number.isNaN(kc) ? <span className="conf">{kc}</span> : null}</button>; })}{ids.length > 5 && <span className="more">+{ids.length - 5}</span>}</span>}
                  <span className="res">{res ? (res.isError ? "error" : `${res.rows} ${res.rows === 1 ? "row" : "rows"}, ${res.ms} ms`) : "running"}</span>
                </div>
                {lift && (
                  <div className="lift"><span className="term" data-tip={TERMS.fleetLift}>fleet lift</span> <b>{lift.lift}×</b> · {lift.ac} vs {lift.acPrev} aircraft</div>
                )}
                {res?.isError && <p className="step-error">{String(res.preview)}</p>}
                {r.call.cypher && <details><summary><span className="term" data-tip={TERMS.cypher}>Cypher</span></summary><pre>{r.call.cypher.replace(/^ {4}/gm, "")}</pre></details>}
              </div>
            </li>
          );
        })}
        {!cards.length && !notes.length && <li className="step-empty"><span className="step-n" aria-hidden="true"></span><div className="step-body"><p>Press Investigate. Each tool call appears here with its Cypher query.</p></div></li>}
      </ol>
    </>
  );
}

/** Full-width conclusion bar: the final answer rendered below the trace + graph
 *  columns instead of squeezed inside one of them. */
export function AnswerBar({ text, onOpen }: { text: string; onOpen: (id: string) => void }) {
  return (
    <div className="conclusion" role="status">
      <p className="eyebrow">Conclusion — <Term tip={TERMS.leads}>leads worth review, not causes</Term></p>
      <Linked text={text} onOpen={onOpen} />
    </div>
  );
}

/** Answer text with record ids turned into buttons that open the record. */
function Linked({ text, onOpen }: { text: string; onOpen: (id: string) => void }) {
  const parts = text.split(ID);
  return <p>{parts.map((p, i) => (i % 2 ? <button key={i} className="id-link" onClick={() => onOpen(p)} data-tip={idTip(p)}>{p}</button> : p))}</p>;
}
