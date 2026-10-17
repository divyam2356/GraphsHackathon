"use client";
// The part of the graph an investigation touched: every node the agent's tool calls
// returned, plus all edges among them (subgraph query), laid out with d3-force.
// New nodes join as the agent works; nodes already placed keep their position.
import { useEffect, useRef, useState } from "react";
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";

export interface GraphNode { id: number; labels: string[]; properties: Record<string, unknown> }
export interface SubRow { node: GraphNode; out: Array<{ type: string; to: number } | null> }
interface N extends SimulationNodeDatum { id: number; label: string; key: string; name: string }
interface E extends SimulationLinkDatum<N> { type: string }

const W = 760, H = 470;
const ZONES: Record<string, string> = { "52": "doors", "53": "fuselage", "54": "nacelles", "55": "stabilizers", "56": "windows", "57": "wings", "32": "landing gear" };
const DIST: Record<string, number> = { WITHIN: 70, AT: 90, ON: 100, INVOLVED: 110, FOUND: 80 };

/** The id a node is known by in the UI (report id, ev_id, tail, location key, AD number). */
export function nodeKey(n: GraphNode): string {
  const p = n.properties;
  return String(p.ev_id ?? p.ad_no ?? (n.labels[0] === "Location" ? p.bin : undefined) ?? (n.labels[0] === "Aircraft" ? p.tail : undefined) ?? p.id ?? n.id);
}
/** Short label drawn next to a node. */
function nodeName(n: GraphNode): string {
  const p = n.properties;
  switch (n.labels[0]) {
    case "Accident": return String(p.ntsb_no ?? p.ev_id);
    case "Location": {
      const parts = String(p.bin).split("/");
      return parts.length === 2 ? `${parts[0]} ${ZONES[parts[1]] ?? `ATA ${parts[1]}`}` : parts.slice(2).join(" ").replace(/^S(\d+)([LR])/, "S-$1$2").replace("BS", "BS ");
    }
    case "Finding": return p.cause_factor === "C" ? "Cause finding" : "Finding";
    case "Alert": return `Alert ${String(p.bin).split("/")[2]?.replace(/^S(\d+)([LR])/, "S-$1$2") ?? ""}`;
    case "WorkOrder": return `Work order (${p.status})`;
    default: return nodeKey(n);
  }
}

export function EvidenceGraph({ rows, kept, focus, onNode }: { rows: SubRow[]; kept?: Set<string>; focus?: string | null; onNode?: (n: GraphNode) => void }) {
  const pos = useRef(new Map<number, { x: number; y: number }>());
  const [g, setG] = useState<{ nodes: N[]; links: E[] }>({ nodes: [], links: [] });
  const [, setFrame] = useState(0);
  const byId = new Map(rows.map((r) => [r.node.id, r.node]));

  useEffect(() => {
    const nodes: N[] = rows.map((r) => {
      const p = pos.current.get(r.node.id);
      const a = Math.random() * Math.PI * 2;
      return { id: r.node.id, label: r.node.labels[0], key: nodeKey(r.node), name: nodeName(r.node), x: p?.x ?? W / 2 + Math.cos(a) * 60, y: p?.y ?? H / 2 + Math.sin(a) * 60 };
    });
    const ids = new Set(nodes.map((n) => n.id));
    const links: E[] = rows.flatMap((r) => r.out.flatMap((o) => (o && ids.has(o.to) ? [{ source: r.node.id, target: o.to, type: o.type }] : [])));
    const sim = forceSimulation(nodes)
      .force("link", forceLink<N, E>(links).id((d) => d.id).distance((l) => DIST[l.type] ?? 60).strength(0.8))
      .force("charge", forceManyBody().strength(-520))
      // small graphs label every node, so leave room for the name (drawn to the right of the mark)
      .force("collide", forceCollide<N>((d) => (nodes.length <= 28 ? 16 + d.name.length * 3.3 : 34)))
      .force("x", forceX(W / 2).strength(0.05))
      .force("y", forceY(H / 2).strength(0.08))
      .alpha(pos.current.size ? 0.6 : 1);
    const keep = () => { for (const n of nodes) pos.current.set(n.id, { x: n.x!, y: n.y! }); };
    setG({ nodes, links });
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      sim.stop().tick(300);
      keep();
      setFrame((f) => f + 1);
      return;
    }
    let raf = 0;
    sim.on("tick", () => { keep(); if (!raf) raf = requestAnimationFrame(() => { raf = 0; setFrame((f) => f + 1); }); });
    return () => { sim.stop(); cancelAnimationFrame(raf); };
  }, [rows]);

  const few = g.nodes.length <= 28;
  // In a big graph only the nodes that carry the story get a label; the rest stay dots (hover for the id).
  const named = (n: N) => few || ["Accident", "Aircraft", "FixOrder", "FailureMode", "Alert", "WorkOrder"].includes(n.label) || kept?.has(n.key) || focus === n.key
    || (n.label === "Location" && !n.key.includes("/BS"));
  // Fit the view to the nodes (with room for labels), never zooming in past 1.6x.
  const xs = g.nodes.map((n) => n.x!), ys = g.nodes.map((n) => n.y!);
  let [x0, x1, y0, y1] = xs.length ? [Math.min(...xs) - 40, Math.max(...xs) + 120, Math.min(...ys) - 30, Math.max(...ys) + 30] : [0, W, 0, H];
  const vw = Math.max(x1 - x0, W / 1.6), vh = Math.max(y1 - y0, H / 1.6), k = Math.max(vw / W, vh / H);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  [x0, y0] = [cx - (W * k) / 2, cy - (H * k) / 2];
  const ks = Math.max(1, k); // marks and labels keep their on-screen size when the view zooms out
  // edge names help a small graph; on a busy one (an alert's fleet) they are noise
  const edgeLabels = few && g.links.length <= 24 ? placeEdgeLabels(g, named, ks) : new Map<number, [number, number]>();
  return (
    <div className="egraph">
      <svg viewBox={`${x0} ${y0} ${W * k} ${H * k}`} role="img" aria-label={`Evidence graph, ${g.nodes.length} nodes`}>
        {g.links.map((l, i) => {
          const s = l.source as N, t = l.target as N;
          return (
            <g key={i}>
              <line x1={s.x} y1={s.y} x2={t.x} y2={t.y} stroke="var(--graphite)" strokeOpacity={0.45} strokeWidth={ks} />
              {edgeLabels.has(i) && <text x={edgeLabels.get(i)![0]} y={edgeLabels.get(i)![1]} fontSize={8.5 * ks} textAnchor="middle" className="elabel">{l.type}</text>}
            </g>
          );
        })}
        {g.nodes.map((n) => {
          const hot = kept?.has(n.key), on = focus === n.key;
          const node = byId.get(n.id);
          return (
            <g key={n.id} transform={`translate(${n.x},${n.y}) scale(${ks})`} className="gnode" onClick={() => node && onNode?.(node)} tabIndex={0}
              onKeyDown={(e) => { if (e.key === "Enter" && node) onNode?.(node); }} aria-label={`${n.label} ${n.name}`}>
              <title>{`${n.label} ${n.key}`}</title>
              <Shape label={n.label} hot={hot} small={!named(n)} />
              {on && <circle r={15} fill="none" stroke="var(--ink)" strokeWidth={1.4} strokeDasharray="3 2" />}
              {named(n) && <text x={11} y={4} fontSize={11} fontWeight={n.label === "Accident" || hot ? 700 : 400} className="nlabel">{n.name}</text>}
            </g>
          );
        })}
        {!g.nodes.length && <text x={x0 + (W * k) / 2} y={y0 + (H * k) / 2} textAnchor="middle" fontSize={13} className="nlabel">The records the agent touches appear here, joined by their edges.</text>}
      </svg>
      <div className="glegend">
        {["Accident", "Report", "Aircraft", "Location", "Finding", "FixOrder", ...["Alert", "WorkOrder"].filter((l) => g.nodes.some((n) => n.label === l))].map((l) => (
          <span key={l}><svg width="16" height="16" viewBox="-8 -8 16 16"><Shape label={l} small /></svg>{LEGEND[l]}</span>
        ))}
        <span><svg width="16" height="16" viewBox="-8 -8 16 16"><Shape label="Report" hot small /></svg>Earlier report at the same location</span>
      </div>
    </div>
  );
}

// Evidence edges get their label first; structural ones (hierarchy) only where room is left.
const LABEL_ORDER = ["PRECURSOR_OF", "INVOLVED", "FROM", "ON", "FOR", "EVIDENCE_FOR", "TARGETS", "FOUND", "AT", "WITHIN"];
type Box = [number, number, number, number];
const overlaps = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
/** Edge label positions (by link index), skipping any label that would cover a node, a node name or another label. */
function placeEdgeLabels(g: { nodes: N[]; links: E[] }, named: (n: N) => boolean, ks: number): Map<number, [number, number]> {
  const taken: Box[] = g.nodes.flatMap((n): Box[] => {
    const mark: Box = [n.x! - 9 * ks, n.y! - 9 * ks, n.x! + 9 * ks, n.y! + 9 * ks];
    return named(n) ? [mark, [n.x! + 10 * ks, n.y! - 8 * ks, n.x! + (12 + n.name.length * 6.4) * ks, n.y! + 6 * ks]] : [mark];
  });
  const rank = (t: string) => (LABEL_ORDER.indexOf(t) + 1 || LABEL_ORDER.length + 1);
  const order = g.links.map((_, i) => i).sort((a, b) => rank(g.links[a].type) - rank(g.links[b].type));
  const out = new Map<number, [number, number]>();
  for (const i of order) {
    const s = g.links[i].source as N, t = g.links[i].target as N;
    const x = (s.x! + t.x!) / 2, y = (s.y! + t.y!) / 2 - 3 * ks, w = g.links[i].type.length * 5.2 * ks;
    const box: Box = [x - w / 2, y - 8 * ks, x + w / 2, y + 2 * ks];
    if (taken.some((b) => overlaps(b, box))) continue;
    taken.push(box);
    out.set(i, [x, y]);
  }
  return out;
}

const LEGEND: Record<string, string> = { Accident: "NTSB event", Report: "Maintenance report", Aircraft: "Aircraft", Location: "Location", Finding: "NTSB finding", FixOrder: "Fix order (AD)", Alert: "Alert (watcher)", WorkOrder: "Work order" };

function Shape({ label, hot, small }: { label: string; hot?: boolean; small?: boolean }) {
  const k = small ? 0.75 : 1;
  switch (label) {
    case "Accident": return <path d={`M0,${-9 * k} L${9 * k},0 L0,${9 * k} L${-9 * k},0 Z`} fill="var(--signal)" stroke="var(--signal-deep)" strokeWidth={1.2} />;
    case "Report": return <circle r={6 * k} fill="var(--ink)" stroke={hot ? "var(--signal)" : "var(--sheet)"} strokeWidth={hot ? 3 : 1.2} />;
    case "Aircraft": return <rect x={-6.5 * k} y={-6.5 * k} width={13 * k} height={13 * k} rx={2} fill="var(--sheet)" stroke="var(--ink)" strokeWidth={1.8} />;
    case "Location": return <circle r={4.5 * k} fill="var(--graphite)" />;
    case "Finding": return <circle r={4.5 * k} fill="var(--sheet)" stroke="var(--graphite)" strokeWidth={1.5} />;
    case "FixOrder": return <rect x={-8 * k} y={-5 * k} width={16 * k} height={10 * k} fill="var(--sheet)" stroke="var(--ink)" strokeWidth={1.4} strokeDasharray="2.5 1.5" />;
    case "Alert": return <path d={`M0,${-9 * k} L${8 * k},${6 * k} L${-8 * k},${6 * k} Z`} fill="var(--sheet)" stroke="var(--signal)" strokeWidth={2} />;
    case "WorkOrder": return <rect x={-7 * k} y={-7 * k} width={14 * k} height={14 * k} fill="var(--ink)" />;
    default: return <circle r={5 * k} fill="var(--alclad)" />;
  }
}
