"use client";
// The hero view: the 737 fuselage skin unrolled flat, one cell per stringer and
// 20-inch body-station bin (a Location node in the graph). Heat = distinct aircraft
// with matching reports in the 12 months before the slider date (fleet_map query).
// The right margin compares each stringer line with the year before (line_window).
// Overlays come from the NTSB brief; pins are the selected aircraft's own reports.
import { useRef, useState } from "react";
import { BIN, BS_MAX, BS_MIN, HEAT_MAX, PITCH, ROWS, STRINGERS, SWA812, binKey, fmtDate, heat, lineKey, rowIndex, rowOf, stringerName, type Side } from "../lib/fuselage";
import { TERMS } from "../lib/glossary";
import { Term } from "./Tip";

export interface Cell { stringer: string; side: Side; station: number; aircraft: number; reports: number }
export interface LineCount { line: string; ac: number; ac_prev: number }
export interface Pin { id: string; side: Side; n: number; station: number; date: string }

interface Props {
  cells: Cell[];
  lines?: LineCount[];
  pins?: Pin[];
  pinLabel?: string;
  /** line keys with an alert from the watcher, outlined across the map */
  alerts?: string[];
  asOf: string;
  showSwa812?: boolean;
  selected?: string | null;
  onCell?: (key: string) => void;
  onPin?: (id: string) => void;
}

const L = 82, T = 30, MAPW = BS_MAX - BS_MIN, MAPH = ROWS * PITCH, GAP = 22, BARW = 124, B = 40;
const W = L + MAPW + GAP + BARW + 4, H = T + MAPH + B;
const x = (bs: number) => L + (bs - BS_MIN);
const yTop = (i: number) => T + i * PITCH;
const yMid = (side: Side, n: number) => yTop(rowIndex(side, n)) + PITCH / 2;
const LABELLED = new Set([4, 8, 12, 16, 20, 24, 28]);
const halo = { paintOrder: "stroke", stroke: "var(--film)", strokeWidth: 3, strokeLinejoin: "round" } as const;

export function FuselageMap({ cells, lines = [], pins = [], pinLabel, alerts = [], asOf, showSwa812 = true, selected, onCell, onPin }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ x: number; y: number; body: React.ReactNode } | null>(null);
  const show = (e: React.MouseEvent, body: React.ReactNode) => {
    const r = box.current!.getBoundingClientRect();
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, body });
  };
  const after = asOf > SWA812.date;
  const byLine = new Map(lines.map((l) => [l.line, l]));
  const acMax = Math.max(10, ...lines.map((l) => Math.max(l.ac, l.ac_prev)));
  const period = `12 months to ${fmtDate(asOf, true)}`;

  return (
    <div className="fmap" ref={box} onMouseLeave={() => setTip(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Unrolled 737 fuselage; reports per location, ${period}`}>
        <defs>
          <pattern id="tear" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="5" height="5" fill="var(--signal)" />
            <line x1="0" y1="0" x2="0" y2="5" stroke="var(--signal-deep)" strokeWidth="2" />
          </pattern>
        </defs>

        {/* skin, frames every 20 in, stringer lines */}
        <rect x={x(BS_MIN)} y={T} width={MAPW} height={MAPH} fill="var(--skin)" />
        {Array.from({ length: MAPW / BIN + 1 }, (_, k) => BS_MIN + k * BIN).map((bs) => (
          <line key={bs} x1={x(bs)} x2={x(bs)} y1={T} y2={T + MAPH} stroke={bs % 100 === 0 ? "#B3BFC9" : "#E3E8EC"} strokeWidth={bs % 100 === 0 ? 0.8 : 0.6} />
        ))}
        {Array.from({ length: ROWS }, (_, i) => (
          <line key={i} x1={x(BS_MIN)} x2={x(BS_MAX)} y1={yTop(i) + PITCH / 2} y2={yTop(i) + PITCH / 2} stroke="#BCC6CF" strokeWidth={0.45} />
        ))}

        {/* heat */}
        {cells.map((c) => {
          const n = Number(c.stringer);
          if (!(n >= 1 && n <= STRINGERS) || c.station < BS_MIN || c.station >= BS_MAX) return null;
          const key = binKey(c.side, n, c.station);
          return (
            <rect key={key} className="cell" x={x(c.station) + 0.4} y={yTop(rowIndex(c.side, n)) + 0.35} width={BIN - 0.8} height={PITCH - 0.7}
              fill={heat(c.aircraft)} stroke={selected === key ? "var(--ink)" : "none"} strokeWidth={selected === key ? 1.4 : 0}
              onClick={() => onCell?.(key)}
              onMouseMove={(e) => show(e, <><b>{stringerName(c.side, n)}, BS {c.station}–{c.station + BIN - 1}</b><br />{c.aircraft} aircraft, {c.reports} reports, {period}</>)} />
          );
        })}

        {/* crown centreline */}
        <line x1={x(BS_MIN)} x2={x(BS_MAX)} y1={yTop(STRINGERS)} y2={yTop(STRINGERS)} stroke="var(--ink)" strokeWidth={0.7} strokeDasharray="6 4" opacity={0.55} />

        {showSwa812 && (
          <g>
            <rect x={x(SWA812.crown.from)} y={yMid("R", 4)} width={SWA812.crown.to - SWA812.crown.from} height={yMid("L", 4) - yMid("R", 4)}
              fill="none" stroke="var(--ink)" strokeWidth={1.3} strokeDasharray="5 3" />
            <text x={x(SWA812.crown.from) + 4} y={yMid("R", 4) - 4} fontSize={10.5} style={{ ...halo, fill: "var(--ink)" }} data-tip={TERMS.panel}>Crown skin panel, BS 540–727</text>
            <rect x={x(SWA812.rupture.from)} y={yMid("L", 4)} width={SWA812.rupture.to - SWA812.rupture.from} height={PITCH}
              fill={after ? "url(#tear)" : "none"} stroke="var(--signal-deep)" strokeWidth={after ? 1.6 : 1.3} strokeDasharray={after ? undefined : "3 2"}
              onMouseMove={(e) => show(e, <><b>Southwest 812, 1 April 2011</b><br />Skin fractured BS 663–727, S-4L to S-5L (NTSB)</>)} />
            <text x={x(SWA812.rupture.to) + 5} y={yMid("L", 5) + 3} fontSize={10.5} fontWeight={700} style={{ ...halo, fill: "var(--signal-deep)" }}>Rupture, 1 Apr 2011</text>
            {after && SWA812.clips.map((bs) => (
              <g key={bs} onMouseMove={(e) => show(e, <><b>Cracked stringer clip, BS {bs}</b><br />Found on S-4L after the accident (NTSB)</>)}>
                <path d={`M${x(bs) - 2.6},${yMid("L", 4) - 2.6} l5.2,5.2 m0,-5.2 l-5.2,5.2`} stroke="var(--ink)" strokeWidth={1.3} />
              </g>
            ))}
          </g>
        )}

        {/* the aircraft's own reports */}
        {[...pins].sort((a, b) => a.station - b.station).map((p, k) => (
          <g key={p.id} className="pin" onClick={() => onPin?.(p.id)}
            onMouseMove={(e) => show(e, <><b>{p.id}</b>, {fmtDate(p.date, true)}<br />{stringerName(p.side, p.n)}, BS {p.station}</>)}>
            <circle cx={x(p.station)} cy={yMid(p.side, p.n)} r={4.2} fill="var(--ink)" stroke="var(--sheet)" strokeWidth={1.4} />
            {k === 0 && pinLabel && <text x={x(p.station) - 6} y={yMid(p.side, p.n) + 15} fontSize={10.5} fontWeight={700} textAnchor="end" style={{ ...halo, fill: "var(--ink)" }}>{pinLabel}</text>}
          </g>
        ))}

        {/* lines the watcher raised an alert on */}
        {Array.from({ length: ROWS }, (_, i) => {
          const { side, n } = rowOf(i);
          if (!alerts.includes(lineKey(side, n))) return null;
          // the row above also alerted: shift this label left so the two don't overprint
          const above = i > 0 && alerts.includes(lineKey(rowOf(i - 1).side, rowOf(i - 1).n));
          return (
            <g key={`alert${i}`} onMouseMove={(e) => show(e, <><b>{stringerName(side, n)}</b>: alert raised by the watcher</>)}>
              <rect x={L - 0.5} y={yTop(i) - 0.5} width={MAPW + 1} height={PITCH + 1} fill="none" stroke="var(--signal)" strokeWidth={1.6} />
              <text x={L + MAPW - 4 - (above ? 84 : 0)} y={yTop(i) - 2.5} fontSize={10} fontWeight={700} textAnchor="end" style={{ ...halo, fill: "var(--signal-deep)" }}>Alert: {stringerName(side, n)}</text>
            </g>
          );
        })}

        {/* row labels and sides */}
        {Array.from({ length: ROWS }, (_, i) => {
          const { side, n } = rowOf(i);
          if (!LABELLED.has(n)) return null;
          return <text key={i} x={L - 6} y={yTop(i) + PITCH / 2 + 3.5} fontSize={10} textAnchor="end" fontWeight={n === 4 ? 700 : 400} style={n === 4 ? { fill: "var(--ink)" } : undefined}
            data-tip={`${stringerName(side, n)} is stringer ${n} on the ${side === "L" ? "left" : "right"}, counted down from the top of the fuselage. ${TERMS.stringerWhat}`}>{stringerName(side, n)}</text>;
        })}
        <text transform={`translate(14 ${T + MAPH / 4}) rotate(-90)`} fontSize={11} textAnchor="middle" data-tip={TERMS.sides}>Right side</text>
        <text transform={`translate(14 ${T + (3 * MAPH) / 4}) rotate(-90)`} fontSize={11} textAnchor="middle" data-tip={TERMS.sides}>Left side</text>
        <text x={L - 6} y={yTop(STRINGERS) + 3.5} fontSize={10} textAnchor="end" style={{ fill: "var(--ink)" }} data-tip={TERMS.crown}>Crown</text>
        <text x={x(BS_MIN)} y={T - 9} fontSize={11}>Nose</text>
        <text x={x(BS_MAX)} y={T - 9} fontSize={11} textAnchor="end">Tail</text>

        {/* station axis */}
        {Array.from({ length: 10 }, (_, k) => 200 + k * 100).map((bs) => (
          <text key={bs} x={x(bs)} y={T + MAPH + 15} fontSize={10} textAnchor={bs === BS_MIN ? "start" : "middle"}>{bs === BS_MIN ? "BS 200" : bs}</text>
        ))}
        <text x={x(BS_MIN) + MAPW / 2} y={T + MAPH + 32} fontSize={10.5} textAnchor="middle" className="term" data-tip={TERMS.bodyStation}>Body station, inches from the nose datum</text>

        {/* margin: each line now vs the year before */}
        <text x={L + MAPW + GAP} y={T - 9} fontSize={10.5} className="term" data-tip={TERMS.aircraftPerLine}>Aircraft per line</text>
        {Array.from({ length: ROWS }, (_, i) => {
          const { side, n } = rowOf(i);
          const l = byLine.get(lineKey(side, n));
          if (!l) return null;
          const x0 = L + MAPW + GAP, s = BARW / acMax, base = Math.min(l.ac, l.ac_prev), up = Math.max(0, l.ac - l.ac_prev);
          return (
            <g key={i} onMouseMove={(e) => show(e, <><b>{stringerName(side, n)}</b>: {l.ac} aircraft, {period}<br />{l.ac_prev} in the 12 months before</>)}>
              <rect x={x0} y={yTop(i)} width={BARW} height={PITCH} fill="transparent" />
              <rect x={x0} y={yTop(i) + 1.2} width={base * s} height={PITCH - 2.4} fill="var(--graphite)" opacity={0.45} />
              {up > 0 && <rect x={x0 + base * s} y={yTop(i) + 1.2} width={up * s} height={PITCH - 2.4} fill="var(--signal)" />}
              <line x1={x0 + l.ac_prev * s} x2={x0 + l.ac_prev * s} y1={yTop(i) + 0.4} y2={yTop(i) + PITCH - 0.4} stroke="var(--ink)" strokeWidth={1} />
            </g>
          );
        })}
        <text x={L + MAPW + GAP} y={T + MAPH + 15} fontSize={10}>0</text>
        <text x={L + MAPW + GAP + BARW} y={T + MAPH + 15} fontSize={10} textAnchor="end">{acMax}</text>
        <text x={L + MAPW + GAP} y={T + MAPH + 30} fontSize={9.5} className="term" data-tip={TERMS.aircraftPerLine}>Tick: a year earlier</text>
      </svg>
      {tip && <div className="tip" style={{ left: tip.x, top: tip.y }}>{tip.body}</div>}
    </div>
  );
}

/** Heat key for the map. */
export function HeatLegend() {
  const steps = [1, 2, 4, 8, HEAT_MAX];
  return (
    <div className="legend" aria-label="Colour key">
      <Term tip={TERMS.aircraftPerCell}>Aircraft per cell</Term>
      {steps.map((n) => (
        <span key={n} className="legend-step"><i style={{ background: heat(n) }} />{n === HEAT_MAX ? `${n}+` : n}</span>
      ))}
    </div>
  );
}
