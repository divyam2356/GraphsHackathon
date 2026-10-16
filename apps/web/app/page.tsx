"use client";
// Board: the live investigation view. Fuselage map + time machine on top; the
// agent's trace and the evidence graph it touched below; records open in a drawer.
import { useCallback, useEffect, useMemo, useState } from "react";
import { FuselageMap, HeatLegend, type Cell, type LineCount, type Pin } from "../components/FuselageMap";
import { TimeSlider } from "../components/TimeSlider";
import { Header } from "../components/Header";
import { AgentPanel, AnswerBar, StepsGrid, type Mode } from "../components/AgentPanel";
import { EvidenceGraph, nodeKey, type SubRow } from "../components/EvidenceGraph";
import { RecordDrawer, type Open } from "../components/RecordDrawer";
import { view, type Step } from "../lib/api";
import { useView } from "../lib/useView";
import { SWA812, parseKey, stationIn } from "../lib/fuselage";
import type { Keys } from "@blackbox/agent/src/agent";

const CLASSIC = ["737-300", "737-400", "737-500"];
const FILTERS = {
  skin: { label: "Skin cracks", args: { part: "SKIN", condition: "CRACK" } },
  crack: { label: "Any crack", args: { condition: "CRACK" } },
  all: { label: "All reports", args: {} },
} as const;
type FilterKey = keyof typeof FILTERS;
interface PriorReport { id: string; date: string; text: string; bin: string }

export default function Board() {
  const [asOf, setAsOf] = useState(SWA812.date);
  const [filter, setFilter] = useState<FilterKey>("skin");
  const [selected, setSelected] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [sub, setSub] = useState<SubRow[]>([]);
  const [open, setOpen] = useState<Open | null>(null);
  const [autorun, setAutorun] = useState<Mode | undefined>();

  // Deep links for demos and screenshots: ?asOf=2010-04-01&filter=crack&cell=737/53/S4L/BS620&run=scripted
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    if (q.get("asOf")) setAsOf(q.get("asOf")!);
    const f = q.get("filter");
    if (f && f in FILTERS) setFilter(f as FilterKey);
    if (q.get("cell")) setSelected(q.get("cell"));
    if (q.get("run")) setAutorun(q.get("run") as Mode);
  }, []);

  // Every key a tool result touched, accumulated; the evidence graph is their subgraph.
  const keys = useMemo(() => {
    const k: Keys = { accidents: [], reports: [], aircraft: [], locations: [], fixorders: [], modes: [] };
    for (const s of steps) if (s.type === "tool_result") for (const f of Object.keys(k) as Array<keyof Keys>) for (const v of s.keys[f]) if (!k[f].includes(v)) k[f].push(v);
    return k;
  }, [steps]);
  const keysJson = JSON.stringify(keys);
  useEffect(() => {
    if (!Object.values(keys).some((v) => v.length)) { setSub([]); return; }
    let live = true;
    const t = setTimeout(() => view<SubRow[]>("subgraph", { ...keys }, true).then((r) => live && setSub(r.rows), () => {}), 120);
    return () => { live = false; clearTimeout(t); };
  }, [keysJson]); // eslint-disable-line react-hooks/exhaustive-deps
  // Orange ring: an earlier report at the finding's location (prior_reports with a bin), or one the model kept (record_precursor).
  const kept = useMemo(() => {
    const binCalls = new Set(steps.flatMap((s) => (s.type === "tool_call" && s.name === "prior_reports" && s.args.bin ? [s.id] : [])));
    return new Set(steps.flatMap((s) => (s.type === "tool_call" && s.name === "record_precursor" ? [String(s.args.reportId)] : s.type === "tool_result" && binCalls.has(s.id) ? s.keys.reports : [])));
  }, [steps]);
  const openId = (id: string) => {
    const row = sub.find((r) => nodeKey(r.node) === id || r.node.properties.id === id);
    if (row) return setOpen({ kind: "node", node: row.node });
    if (parseKey(id)?.station !== undefined) return openCell(id);
    setOpen({ kind: "missing", id });
  };
  const args = (d: string) => ({ family: "737", chapter: "53", asOf: d, variants: CLASSIC, ...FILTERS[filter].args });
  const map = useView<Cell[]>("fleet_map", args(asOf));
  const lines = useView<LineCount[]>("line_window", args(asOf));
  const prior = useView<PriorReport[]>("prior_reports", { tail: SWA812.tail, bin: "737/53/S4L", asOf, windowDays: 3650 });
  const openCell = (key: string) => { setSelected(key); setOpen({ kind: "bin", key, args: args(asOf) }); };
  useEffect(() => { if (selected && !open) openCell(selected); }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps
  const prefetch = useCallback((d: string) => { view("fleet_map", args(d)); view("line_window", args(d)); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps
  const answer = [...steps].reverse().find((s) => s.type === "answer");
  const pins: Pin[] = (prior.rows ?? []).flatMap((r) => {
    const k = parseKey(r.bin);
    const station = stationIn(r.text) ?? (k?.station ?? 0) + 10;
    return k ? [{ id: r.id, side: k.side, n: k.n, station, date: r.date }] : [];
  });

  return (
    <>
      <Header current="board" />
      <main className="board">
        <section aria-labelledby="map-title">
          <div className="map-head">
            <h1 className="map-title" id="map-title">
              {FILTERS[filter].label} on Boeing 737 Classics
              <small>Each cell is a location in the graph, coloured by how many aircraft reported there in the 12 months before the date below. Outlines: Southwest 812, NTSB brief AAB-13/02.</small>
            </h1>
            <div className="seg" role="group" aria-label="Which reports">
              {(Object.keys(FILTERS) as FilterKey[]).map((k) => (
                <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{FILTERS[k].label}</button>
              ))}
            </div>
            <HeatLegend />
            <span className="query-time">{map.error ? map.error : map.ms !== undefined ? `fleet_map ${map.ms} ms, ${map.rows?.length ?? 0} cells` : "Loading the graph"}</span>
          </div>
          <FuselageMap cells={map.rows ?? []} lines={lines.rows ?? []} pins={pins} pinLabel={pins.length ? `${SWA812.tail}'s own reports` : undefined}
            asOf={asOf} selected={selected} onCell={openCell} onPin={openId} />
          <TimeSlider asOf={asOf} onChange={setAsOf} stopAt={SWA812.date} prefetch={prefetch}
            marks={[{ date: "2010-03-09", label: "N632SW: 2 cracked clips on S-4L" }, { date: SWA812.date, label: "Southwest 812", hot: true }]} />
        </section>
        <div className="askrow">
          <AgentPanel asOf={asOf} steps={steps} onStep={(s) => setSteps((p) => [...p, s])} onReset={() => setSteps([])} onOpen={openId} autorun={autorun} hideAnswer showSteps={false} />
          <section aria-labelledby="graph-title">
            <h2 id="graph-title" className="panel-title">Evidence graph <small>{sub.length ? `${sub.length} nodes the investigation touched, and the edges between them` : ""}</small></h2>
            <EvidenceGraph rows={sub} kept={kept} focus={open?.kind === "node" ? nodeKey(open.node) : null} onNode={(node) => setOpen({ kind: "node", node })} />
          </section>
        </div>
        <StepsGrid steps={steps} onOpen={openId} hideAnswer />
        {answer && <AnswerBar text={answer.text} onOpen={openId} />}
      </main>
      <RecordDrawer open={open} onClose={() => { setOpen(null); setSelected(null); }} />
    </>
  );
}
