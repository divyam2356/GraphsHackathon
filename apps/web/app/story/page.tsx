"use client";
// Story: the presentation. Nine steps, each a short narration beside a live view of
// the graph (no screenshots: every number and picture is queried as it is shown; step 5
// shows the saved backtest run, from services/eval).
// Keys: right/left arrows, space, page up/down. Deep link: /story#3.
import { useEffect, useState } from "react";
import { Header } from "../../components/Header";
import { FuselageMap, HeatLegend, type Cell, type LineCount, type Pin } from "../../components/FuselageMap";
import { TimeSlider } from "../../components/TimeSlider";
import { TrendChart, busiest, riseRank, shortLine, useLineSeries } from "../../components/TrendChart";
import { DetailMap } from "../../components/DetailMap";
import { SchemaView } from "../../components/SchemaView";
import { BacktestChart, BacktestHits, useBacktest } from "../../components/Backtest";
import { AgentPanel, AnswerBar } from "../../components/AgentPanel";
import { EvidenceGraph, nodeKey, type SubRow } from "../../components/EvidenceGraph";
import { RecordDrawer, type Open } from "../../components/RecordDrawer";
import { streamAgent, view, type Step } from "../../lib/api";
import { useView } from "../../lib/useView";
import { SWA812, fmtDate, parseKey, stationIn } from "../../lib/fuselage";
import type { Keys } from "@blackbox/agent/src/agent";

const CLASSIC = ["737-300", "737-400", "737-500"];
const SKIN = { family: "737", chapter: "53", variants: CLASSIC, part: "SKIN", condition: "CRACK" };
const TITLES = ["Southwest 812", "The aircraft had said so", "So had the fleet", "Not the loudest line", "Checked against chance", "One graph", "Ask it", "A person decides", "Built on FalkorDB"];
interface PriorReport { id: string; date: string; text: string; bin: string }

export default function Story() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const fromHash = () => { const n = Number(location.hash.slice(1)); if (n >= 1 && n <= TITLES.length) setI(n - 1); };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    const k = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("textarea, input")) return;
      if (["ArrowRight", "PageDown", " "].includes(e.key)) { e.preventDefault(); setI((v) => Math.min(TITLES.length - 1, v + 1)); }
      if (["ArrowLeft", "PageUp"].includes(e.key)) { e.preventDefault(); setI((v) => Math.max(0, v - 1)); }
    };
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("keydown", k); window.removeEventListener("hashchange", fromHash); };
  }, []);
  useEffect(() => { if (location.hash !== `#${i + 1}`) history.replaceState(null, "", `#${i + 1}`); }, [i]);
  const S = [Rupture, OwnReports, Fleet, Loudest, Checked, OneGraph, AskIt, Decides, BuiltOn][i];
  return (
    <>
      <Header current="story" />
      <main className="story" key={i}><S /></main>
      <nav className="story-nav" aria-label="Story steps">
        <ol>{TITLES.map((t, k) => <li key={t}><button aria-current={k === i ? "step" : undefined} onClick={() => setI(k)}><span>{k + 1}</span>{t}</button></li>)}</ol>
      </nav>
    </>
  );
}

function Text({ n, children }: { n: number; children: React.ReactNode }) {
  return <div className="story-text"><p className="story-n">{n} of {TITLES.length}</p><h1>{TITLES[n - 1]}</h1>{children}</div>;
}

function usePins(asOf: string): Pin[] {
  const prior = useView<PriorReport[]>("prior_reports", { tail: SWA812.tail, bin: "737/53/S4L", asOf, windowDays: 3650 });
  return (prior.rows ?? []).flatMap((r) => {
    const k = parseKey(r.bin);
    return k ? [{ id: r.id, side: k.side, n: k.n, station: stationIn(r.text) ?? (k.station ?? 0) + 10, date: r.date }] : [];
  });
}

// 1 ---------------------------------------------------------------
function Rupture() {
  return (
    <>
      <Text n={1}>
        <p>On 1 April 2011 a Southwest Airlines 737-300, N632SW, was climbing through 34,000 feet out of Phoenix when a section of its fuselage skin about 60 inches long and 8 inches wide fractured and flapped open.</p>
        <p>The crew descended and landed at Yuma. Of the 122 people on board, two had minor injuries.</p>
        <p>The NTSB found fatigue cracking along the lap joint at stringer S-4L, from a crown skin panel that was installed improperly when the aircraft was built.</p>
      </Text>
      <div className="story-visual">
        <DetailMap />
        <p className="caption">The fuselage skin above the wing, unrolled flat with the nose to the left and the crown in the middle. From NTSB brief AAB-13/02.</p>
      </div>
    </>
  );
}

// 2 ---------------------------------------------------------------
function OwnReports() {
  const pins = usePins(SWA812.date);
  const prior = useView<PriorReport[]>("prior_reports", { tail: SWA812.tail, bin: "737/53/S4L", asOf: SWA812.date, windowDays: 3650 });
  return (
    <>
      <Text n={2}>
        <p>A year earlier, on 9 March 2010, mechanics working on this aircraft found two cracked stringer clips on S-4L and replaced them. One was 24 inches ahead of where the skin later tore; the other was at its aft edge.</p>
        {(prior.rows ?? []).slice().reverse().map((r) => (
          <figure key={r.id} className="quote"><blockquote className="source">{r.text}</blockquote><figcaption>{r.id}, FAA Service Difficulty Report, {fmtDate(r.date)}</figcaption></figure>
        ))}
        <p>Reports like these are leads worth review, not causes. The NTSB determines causes.</p>
      </Text>
      <div className="story-visual">
        <DetailMap pins={pins} clips={false} />
        {prior.cypher && <details className="story-cypher" open><summary>The query: same aircraft, same line, before the date ({prior.ms} ms)</summary><pre>{prior.cypher.replace(/^ {4}/gm, "")}</pre></details>}
      </div>
    </>
  );
}

// 3 ---------------------------------------------------------------
function Fleet() {
  const [asOf, setAsOf] = useState("2009-01-01");
  const years = useView<Array<{ year: string; aircraft: number }>>("lines_by_year", { ...SKIN, lines: ["737/53/S4L", "737/53/S4R"], to: SWA812.date });
  const y = (yr: string) => years.rows?.find((r) => r.year === yr)?.aircraft ?? "…";
  const map = useView<Cell[]>("fleet_map", { ...SKIN, asOf });
  const lines = useView<LineCount[]>("line_window", { ...SKIN, asOf });
  const pins = usePins(asOf);
  // one orchestrated moment: play from 2009 to the accident on arrival
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setAsOf(SWA812.date);
    let k = 0;
    const t = setInterval(() => {
      k++;
      const m = 2009 * 12 + k;
      const d = `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}-01`;
      for (let j = 1; j <= 3; j++) { const mj = m + j, dj = `${Math.floor(mj / 12)}-${String((mj % 12) + 1).padStart(2, "0")}-01`; view("fleet_map", { ...SKIN, asOf: dj }); view("line_window", { ...SKIN, asOf: dj }); }
      if (d >= SWA812.date) { setAsOf(SWA812.date); clearInterval(t); } else setAsOf(d);
    }, 380);
    return () => clearInterval(t);
  }, []);
  return (
    <>
      <Text n={3}>
        <p>Across the fleet of 737 Classics, the number of aircraft reporting skin cracks on stringer 4, left or right, more than tripled in two years.</p>
        <div className="figures">
          {["2008", "2009", "2010"].map((yr) => <div key={yr}><b>{y(yr)}</b><span>aircraft in {yr}</span></div>)}
        </div>
        <p>Each frame is the 12 months before the date, one live Cypher query on FalkorDB ({map.ms ?? "…"} ms for this one).</p>
      </Text>
      <div className="story-visual">
        <div className="map-legend-row"><HeatLegend /></div>
        <FuselageMap cells={map.rows ?? []} lines={lines.rows ?? []} pins={pins} asOf={asOf} />
        <TimeSlider asOf={asOf} onChange={setAsOf} stopAt={SWA812.date}
          marks={[{ date: "2010-03-09", label: "N632SW clips" }, { date: SWA812.date, label: "Southwest 812", hot: true }]} />
      </div>
    </>
  );
}

// 4 ---------------------------------------------------------------
function Loudest() {
  const series = useLineSeries(SKIN);
  const loud = series ? busiest(series, ["737/53/S4L", "737/53/S4R"]).map(shortLine) : null;
  const at = ["2009-04-01", "2010-04-01", "2011-01-01"];
  const [ranks, setRanks] = useState<Array<{ date: string; line: string; rank: number; of: number; ac: number; prev: number }>>([]);
  useEffect(() => {
    Promise.all(at.map((d) => view<LineCount[]>("line_window", { ...SKIN, asOf: d }).then((r) => {
      const best = ["737/53/S4L", "737/53/S4R"].map((l) => ({ l, ...riseRank(r.rows, l) })).filter((x) => x.rank > 0).sort((a, b) => a.rank - b.rank)[0];
      return { date: d, line: best.l.split("/")[2].replace(/^S(\d+)/, "S-$1"), rank: best.rank, of: best.of, ac: best.row!.ac, prev: best.row!.ac_prev };
    }))).then(setRanks, () => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <Text n={4}>
        <p>By raw counts S-4 did not stand out for most of this period. {loud ? <>Lines lower on the fuselage, such as {loud[0]} and {loud[1]}, had skin cracks on more aircraft.</> : null}</p>
        <p>What stands out is the rise. Ranked by aircraft this year against the year before:</p>
        <ol className="ranks">
          {ranks.map((r) => <li key={r.date}><b>{r.line}</b> ranked {r.rank === 2 ? "2nd" : r.rank === 1 ? "1st" : `${r.rank}th`} of {r.of} lines on {fmtDate(r.date)}: {r.ac} aircraft, up from {r.prev}</li>)}
        </ol>
        <p>The last of these came three months before the accident. A rising line is a lead worth review, not a prediction.</p>
      </Text>
      <div className="story-visual"><TrendChart series={series} /></div>
    </>
  );
}

// 5 ---------------------------------------------------------------
function Checked() {
  const r = useBacktest();
  const [level, setLevel] = useState<"system" | "subsystem">("system");
  const at = (k: string) => r?.stages.find((s) => s.key === k);
  const naive = at("naive")?.system, fair = at("fair")?.system, sub = at("fair")?.subsystem;
  return (
    <>
      <Text n={5}>
        <p>One case proves nothing. So we asked the graph about all {naive?.events ?? "the"} NTSB mechanical events whose aircraft had FAA reports in the year before: did those reports name the system the NTSB later cited?</p>
        <p>The naive test says yes, {naive ? `${naive.lift.toFixed(1)} times` : "…"} more often than chance. Two leaks made that number: a report filed the day before is often the event itself, and each aircraft family keeps reporting the same systems.</p>
        <p>Close both and it falls to {fair ? `${fair.lift.toFixed(1)} times` : "…"}: no better than chance. The test would have caught a lift as small as {fair ? `${fair.detectable_lift.toFixed(1)} times` : "…"}.</p>
        <p>So a match on a whole system is not a warning sign. Southwest 812 stood out on one stringer line, and the NTSB&apos;s public findings name systems, not stringers, so that cannot be backtested at scale. Black Box shows the evidence; a person judges it.</p>
      </Text>
      <div className="story-visual">
        {r ? <>
          <div className="seg" role="group" aria-label="Match level">
            <button aria-pressed={level === "system"} onClick={() => setLevel("system")}>Same system (ATA chapter)</button>
            <button aria-pressed={level === "subsystem"} onClick={() => setLevel("subsystem")}>Same subsystem (ATA section)</button>
          </div>
          <BacktestChart r={r} level={level} />
          <p className="caption">Grey bars: hit rates in {r.shuffles.toLocaleString("en-US")} shuffles, where each event gets another event&apos;s cited systems. Line: what happened. Window {r.window_days} days. From <code>npm run backtest</code> on {fmtDate(r.run.slice(0, 10))}.</p>
          {sub && <h2 className="bt-title">The {sub.hits} subsystem matches that survive the fair test. Chance predicts {sub.chance.hits_mean.toFixed(1)}.</h2>}
          <BacktestHits r={r} />
        </> : <p className="caption">Loading the backtest</p>}
      </div>
    </>
  );
}

// 6 ---------------------------------------------------------------
function OneGraph() {
  return (
    <>
      <Text n={6}>
        <p>Accident investigations and maintenance reports were never meant to be read together. They are published by different offices, in different formats.</p>
        <p>In FalkorDB they meet at two things: the aircraft, by tail and serial number, and the location, from model and ATA chapter down to stringer and a 20-inch body-station bin.</p>
        <p>Locations form a hierarchy, so a question about stringer S-4L includes every bin along it.</p>
      </Text>
      <div className="story-visual"><SchemaView /></div>
    </>
  );
}

// 7 ---------------------------------------------------------------
function AskIt() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [sub, setSub] = useState<SubRow[]>([]);
  const [open, setOpen] = useState<Open | null>(null);
  const keysJson = JSON.stringify(steps.reduce<Keys>((k, s) => {
    if (s.type === "tool_result") for (const f of Object.keys(k) as Array<keyof Keys>) for (const v of s.keys[f]) if (!k[f].includes(v)) k[f].push(v);
    return k;
  }, { accidents: [], reports: [], aircraft: [], locations: [], fixorders: [], modes: [] }));
  useEffect(() => {
    const keys = JSON.parse(keysJson) as Keys;
    if (!Object.values(keys).some((v) => v.length)) return setSub([]);
    const t = setTimeout(() => view<SubRow[]>("subgraph", { ...keys }, true).then((r) => setSub(r.rows), () => {}), 120);
    return () => clearTimeout(t);
  }, [keysJson]);
  const binCalls = new Set(steps.flatMap((s) => (s.type === "tool_call" && s.name === "prior_reports" && s.args.bin ? [s.id] : [])));
  const kept = new Set(steps.flatMap((s) => (s.type === "tool_call" && s.name === "record_precursor" ? [String(s.args.reportId)] : s.type === "tool_result" && binCalls.has(s.id) ? s.keys.reports : [])));
  const answer = [...steps].reverse().find((s) => s.type === "answer");
  const openId = (id: string) => { const row = sub.find((r) => nodeKey(r.node) === id); setOpen(row ? { kind: "node", node: row.node } : { kind: "missing", id }); };
  return (
    <>
      <div className="story-text story-text-wide">
        <p className="story-n">7 of {TITLES.length}</p>
        <h1>{TITLES[6]}</h1>
        <p className="lede">An agent investigates through our MCP server. Every tool runs fixed Cypher, so the model never writes a query, and the date limit is enforced in code.</p>
        <AgentPanel asOf={SWA812.date} steps={steps} onStep={(s) => setSteps((p) => [...p, s])} onReset={() => setSteps([])} onOpen={openId} hideAnswer />
      </div>
      <div className="story-visual">
        <EvidenceGraph rows={sub} kept={kept} focus={open?.kind === "node" ? nodeKey(open.node) : null} onNode={(node) => setOpen({ kind: "node", node })} />
      </div>
      {answer && <AnswerBar text={answer.text} onOpen={openId} />}
      <RecordDrawer open={open} onClose={() => setOpen(null)} />
    </>
  );
}

// 8 ---------------------------------------------------------------
/** First sentence of a record, for evidence lists (the drawer has the full text). */
const firstSentence = (t: string) => (t.match(/^.*?[.;](?=\s|$)/)?.[0] ?? t).slice(0, 300);
interface ModeCard { mode: Record<string, string | number | null>; evidence: Array<{ label: string; id: string; date?: string; text?: string }> }
function Decides() {
  const [steps, setSteps] = useState<Step[]>([]);
  const [id, setId] = useState<string | null>(null);
  const [card, setCard] = useState<ModeCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [by, setBy] = useState("");
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [cypher, setCypher] = useState<string | null>(null);
  const load = (m: string) => view<ModeCard[]>("mode_card", { id: m }, true).then((r) => setCard(r.rows[0] ?? null));
  async function draft() {
    setBusy(true); setSteps([]); setErr(null);
    await streamAgent({ mode: "scripted", evId: SWA812.evId, asOf: SWA812.date, draft: true }, (s) => {
      setSteps((p) => [...p, s]);
      if (s.type === "tool_result" && s.name === "propose_failure_mode") {
        const m = (s.preview as Array<{ id?: string }>)?.[0]?.id;
        if (m) { setId(m); load(m); }
      }
    }).catch((e: Error) => setErr(e.message));
    setBusy(false);
  }
  async function decide(decision: "approve" | "defer" | "reopen") {
    setErr(null);
    const r = await fetch("/api/decide", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, decision, by: by || "presenter", reason }) });
    const j = await r.json();
    if (!r.ok) setErr(j.error); else { setCypher(j.cypher ?? null); load(id!); }
  }
  const tools = steps.filter((s): s is Extract<Step, { type: "tool_result" }> => s.type === "tool_result");
  const m = card?.mode;
  const decided = m && (m.status === "confirmed" || m.status === "dormant");
  return (
    <>
      <Text n={8}>
        <p>The agent can draft a failure mode from what it found, with its evidence linked in the graph. It cannot approve one: there is no such tool on its MCP server.</p>
        <p>A person reads the evidence and decides. The decision, who made it and why are written to the graph, and only confirmed modes are used to rank future investigations.</p>
        {!card && <button className="go" onClick={draft} disabled={busy}>{busy ? "Drafting" : "Draft a failure mode from this investigation"}</button>}
        {tools.length > 0 && <ol className="mini-steps">{tools.map((t) => <li key={t.id}><b>{t.name}</b> {t.rows} {t.rows === 1 ? "row" : "rows"}, {t.ms} ms</li>)}</ol>}
      </Text>
      <div className="story-visual">
        {card && m && (
          <article className={`mode-card status-${m.status}`} aria-live="polite">
            <p className="mode-kind">Failure mode, {m.status === "proposed" ? "drafted through the agent's MCP tools, waiting for a person" : m.status === "confirmed" ? "confirmed by a person" : "deferred by a person"}</p>
            <h2>{String(m.name)}</h2>
            <p className="mode-mech">{String(m.mechanism)}. ATA chapter {String(m.system)}.</p>
            <h3>Evidence linked in the graph ({card.evidence.filter((e) => e.id).length})</h3>
            <ol className="evidence">
              {card.evidence.filter((e) => e.id).map((e) => (
                <li key={e.id}><div className="report-head"><b>{e.id}</b><span>{e.label === "Accident" ? "NTSB event" : "Maintenance report"}</span>{e.date && <span>{fmtDate(String(e.date), true)}</span>}</div>{e.text && <blockquote className="source">{firstSentence(String(e.text))}</blockquote>}</li>
              ))}
            </ol>
            {!decided ? (
              <div className="decide">
                <label>Your name<input value={by} onChange={(e) => setBy(e.target.value)} placeholder="Reviewer" /></label>
                <label>Reason<textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why approve or defer" /></label>
                <div className="decide-row"><button className="go" onClick={() => decide("approve")}>Approve</button><button className="ghost" onClick={() => decide("defer")}>Defer</button></div>
              </div>
            ) : (
              <div className="decided">
                <p><b>{m.status === "confirmed" ? "Confirmed" : "Deferred"} by {String(m.decided_by)}</b>, {new Date(String(m.decided_at)).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}, with {String(m.support_at_decision)} pieces of evidence.{m.decision_reason ? ` "${m.decision_reason}"` : ""}</p>
                <p className="caption">Stored on FailureMode {String(m.id).slice(0, 8)} in FalkorDB.</p>
                <button className="ghost" onClick={() => decide("reopen")}>Reopen for review</button>
              </div>
            )}
            {err && <p className="step-error">{err}</p>}
            {cypher && <details><summary>The query behind the button (not available to the agent)</summary><pre>{cypher.replace(/^ {4}/gm, "")}</pre></details>}
          </article>
        )}
        {!card && <p className="caption">{err ?? "The draft appears here, with the records behind it."}</p>}
      </div>
    </>
  );
}

// 9 ---------------------------------------------------------------
function BuiltOn() {
  const stats = useView<Array<{ label: string; n: number }>>("graph_stats", {});
  const n = (l: string) => stats.rows?.find((r) => r.label === l)?.n.toLocaleString("en-US") ?? "…";
  const [tools, setTools] = useState<string[]>([]);
  const [times, setTimes] = useState<Array<{ name: string; what: string; ms: number; rows: number }>>([]);
  useEffect(() => {
    fetch("/api/agent").then((r) => r.json()).then((j) => setTools(j.tools ?? []), () => {});
    const runs: Array<[string, string, Record<string, unknown>]> = [
      ["fleet_map", "Heat for the whole fuselage, one date", { ...SKIN, asOf: SWA812.date }],
      ["line_window", "Every stringer line, this year and last", { ...SKIN, asOf: SWA812.date }],
      ["prior_reports", "One aircraft's history at one line", { tail: SWA812.tail, bin: "737/53/S4L", asOf: SWA812.date, windowDays: 730 }],
      ["bin_reports", "The write-ups behind one map cell", { family: "737", chapter: "53", variants: CLASSIC, condition: "CRACK", bin: "737/53/S4L/BS620", asOf: SWA812.date }],
      ["lines_by_year", "S-4 across the fleet, by year", { ...SKIN, lines: ["737/53/S4L", "737/53/S4R"], to: SWA812.date }],
    ];
    // one at a time and uncached, so each time is that query alone
    (async () => {
      const out: typeof times = [];
      for (const [name, what, a] of runs) {
        const r = await view<unknown[]>(name, a, true);
        out.push({ name, what, ms: r.ms, rows: Array.isArray(r.rows) ? r.rows.length : 1 });
      }
      setTimes(out);
    })().catch(() => {});
  }, []);
  return (
    <>
      <Text n={9}>
        <p>Public data only: {n("Accident")} mechanical NTSB events since 2008 and {n("Report")} FAA maintenance reports, joined in one FalkorDB graph.</p>
        <p>The agent reaches the graph only through our MCP server: {tools.length || "its"} tools, each a fixed Cypher query.</p>
        <p>While building it we found a FalkorDB bug: with a range index on a string property, <code>r.date &lt; &apos;2011-04-01&apos;</code> matched every row (1,000 instead of 198 in our repro, v4.14.6). We dropped the date indexes and recomputed every number in this story.</p>
      </Text>
      <div className="story-visual built">
        <section><h2>Roll up the location hierarchy</h2><pre>{`MATCH (r:Report)-[:AT]->(:Location)
      -[:WITHIN*0..2]->(:Location {bin: $bin})`}</pre></section>
        <section><h2>Never look past the investigation date</h2><pre>{`WHERE r.date < $asOf
  AND r.date >= toString(date($asOf)
      - duration({days: $windowDays}))`}</pre></section>
        <section><h2>Shortest evidence path</h2><pre>{`CALL algo.SPpaths({
  sourceNode: a, targetNode: b,
  relTypes: ['ON', 'INVOLVED', 'AT',
             'WITHIN', 'FOUND'],
  relDirection: 'both', maxLen: 4, pathCount: 0
}) YIELD path
WITH path WHERE all(n IN nodes(path)[1..-1]
  WHERE n.date IS NULL OR n.date < $asOf)`}</pre></section>
        <section><h2>Search the mechanics&apos; write-ups</h2><pre>{`CALL db.idx.fulltext.queryNodes('Report', $text)
YIELD node AS r, score
WHERE r.date < $asOf`}</pre></section>
        <section className="wide">
          <h2>Queries in this story, timed on a desktop PC</h2>
          <table className="times"><tbody>{times.map((t) => <tr key={t.name}><td>{t.what}</td><td><code>{t.name}</code></td><td>{t.rows.toLocaleString("en-US")} rows</td><td>{t.ms} ms</td></tr>)}</tbody></table>
        </section>
        <section className="wide">
          <h2>MCP tools the agent can call</h2>
          <p className="tools">{tools.map((t) => <span key={t} className="chip">{t}</span>)}</p>
        </section>
      </div>
    </>
  );
}
