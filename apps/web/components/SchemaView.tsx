"use client";
// The data model with live counts: one circle per node label (area grows with the
// count, log scale), one line per relationship type (graph_stats + edge_stats).
// Positions are fixed by hand so the two sources meet in the middle at Location.
import { useEffect, useState } from "react";
import { useView } from "../lib/useView";

interface LabelCount { label: string; n: number }
interface EdgeCount { from: string; type: string; to: string; n: number }
const W = 820, H = 500;
const AT: Record<string, [number, number]> = {
  Model: [410, 52], Aircraft: [230, 165], FailureMode: [610, 165],
  Accident: [80, 300], Location: [410, 300], Report: [730, 300],
  Finding: [210, 430], System: [410, 445], FixOrder: [610, 430],
};
const NAMES: Record<string, string> = { Accident: "NTSB events", Report: "Maintenance reports", Aircraft: "Aircraft", Location: "Locations", Finding: "NTSB findings", Model: "Models", System: "Systems (ATA)", FixOrder: "Fix orders", FailureMode: "Failure modes" };
const r = (n: number) => 7 + 5.2 * Math.log10(Math.max(1, n));
// Where along each edge its label sits (0 = at `from`), chosen to keep labels apart.
const LABEL_AT: Record<string, number> = { "Report ON Aircraft": 0.22, "FixOrder APPLIES_TO Model": 0.2, "FailureMode SIGNATURE Location": 0.35, "FixOrder TARGETS Location": 0.45, "FailureMode FOR Model": 0.5, "Report PRECURSOR_OF Accident": 0.3 };
// Edges that would run straight through another node are drawn as arcs (bow in px; sign picks the side).
const BOW: Record<string, number> = { "Report PRECURSOR_OF Accident": -75 };

/** Counts up to the target once (one orchestrated moment); instant with reduced motion. */
function useCount(target: number) {
  const [v, set] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return set(target);
    const t0 = performance.now();
    let raf = 0;
    const step = (t: number) => { const f = Math.min(1, (t - t0) / 1100); set(Math.round(target * (1 - (1 - f) ** 3))); if (f < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return v;
}
function Count({ n }: { n: number }) { return <>{useCount(n).toLocaleString("en-US")}</>; }

export function SchemaView() {
  const labels = useView<LabelCount[]>("graph_stats", {});
  const edges = useView<EdgeCount[]>("edge_stats", {});
  const count = new Map((labels.rows ?? []).map((l) => [l.label, l.n]));
  const total = { nodes: (labels.rows ?? []).reduce((a, l) => a + l.n, 0), edges: (edges.rows ?? []).reduce((a, e) => a + e.n, 0) };
  const shown = (edges.rows ?? []).filter((e) => AT[e.from] && AT[e.to]);
  return (
    <figure className="schema">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Graph data model with live counts">
        {shown.map((e) => {
          const [x1, y1] = AT[e.from], [x2, y2] = AT[e.to];
          if (e.from === e.to) {
            const rr = r(count.get(e.from) ?? 1);
            return (
              <g key={e.type + e.from}>
                <path d={`M${x1 + rr * 0.7},${y1 - rr * 0.7} c ${rr + 26},-${rr + 30} ${rr + 52},${rr - 2} ${rr * 0.3 + 10},${rr * 0.75}`} fill="none" stroke="var(--graphite)" strokeOpacity={0.6} strokeWidth={1.2} />
                <text x={x1 + rr + 26} y={y1 - rr - 4} fontSize={10.5} className="elabel">{e.type} <Count n={e.n} /></text>
              </g>
            );
          }
          const w = Math.max(0.8, Math.log10(e.n + 1) * 0.9);
          const id = `${e.from} ${e.type} ${e.to}`, t = LABEL_AT[id] ?? 0.5, bow = BOW[id] ?? 0;
          // quadratic arc: control point pushed off the midpoint along the normal (bow 0 = straight)
          const len = Math.hypot(x2 - x1, y2 - y1), cx = (x1 + x2) / 2 + ((y2 - y1) / len) * 2 * bow, cy = (y1 + y2) / 2 - ((x2 - x1) / len) * 2 * bow;
          const vertical = !bow && Math.abs(x1 - x2) < 1;
          const mx = (1 - t) ** 2 * x1 + 2 * (1 - t) * t * cx + t ** 2 * x2, my = (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cy + t ** 2 * y2;
          return (
            <g key={e.from + e.type + e.to}>
              <path d={`M${x1},${y1} Q${cx},${cy} ${x2},${y2}`} fill="none" stroke="var(--graphite)" strokeOpacity={0.55} strokeWidth={w} />
              <text x={vertical ? mx + 7 : mx} y={vertical ? my + 4 : my - 5} fontSize={10.5} textAnchor={vertical ? "start" : "middle"} className="elabel">{e.type} <Count n={e.n} /></text>
            </g>
          );
        })}
        {Object.entries(AT).map(([label, [x, y]]) => {
          const n = count.get(label) ?? 0;
          const rr = r(n);
          return (
            <g key={label}>
              <circle cx={x} cy={y} r={rr} fill={label === "Accident" ? "var(--signal)" : label === "Report" ? "var(--ink)" : "var(--sheet)"} stroke={label === "Accident" ? "var(--signal-deep)" : "var(--ink)"} strokeWidth={1.6} />
              <text x={x} y={y + rr + 15} textAnchor="middle" fontSize={13} fontWeight={700} className="nlabel">{NAMES[label]}</text>
              <text x={x} y={y + rr + 30} textAnchor="middle" fontSize={12} className="nlabel"><Count n={n} /></text>
            </g>
          );
        })}
      </svg>
      <figcaption>{labels.rows ? <>Live from FalkorDB: <Count n={total.nodes} /> nodes and <Count n={total.edges} /> edges, counted in {(labels.ms ?? 0) + (edges.ms ?? 0)} ms.</> : "Counting the graph"}</figcaption>
    </figure>
  );
}
