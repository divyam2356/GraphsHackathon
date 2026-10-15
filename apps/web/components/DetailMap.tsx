"use client";
// Close-up of the crown above the wing, drawn like the detail view on a structural
// drawing: every stringer labelled, a dimension line under the rupture, and the
// aircraft's own reports with leader lines. Same geometry as FuselageMap, zoomed.
// A small locator shows where the detail sits on the whole fuselage.
import { BIN, BS_MAX, BS_MIN, PITCH, ROWS, STRINGERS, SWA812, fmtDate, rowIndex, rowOf, stringerName, type Side } from "../lib/fuselage";
import type { Pin } from "./FuselageMap";

const FROM = 520, TO = 780, R0 = rowIndex("R", 8), R1 = rowIndex("L", 8) + 1;
const ML = 30, MT = 16, MR = 78, MB = 44;
const W = ML + (TO - FROM) + MR, H = MT + (R1 - R0) * PITCH + MB;
const x = (bs: number) => ML + (bs - FROM);
const yTop = (i: number) => MT + (i - R0) * PITCH;
const yMid = (side: Side, n: number) => yTop(rowIndex(side, n)) + PITCH / 2;
const halo = { paintOrder: "stroke", stroke: "var(--film)", strokeWidth: 2.2, strokeLinejoin: "round" } as const;

export function DetailMap({ pins = [], ruptured = true, clips = true }: { pins?: Pin[]; ruptured?: boolean; clips?: boolean }) {
  const mapBottom = MT + (R1 - R0) * PITCH;
  const yTear = yMid("L", 5) + PITCH * 0.5;
  const sorted = [...pins].sort((a, b) => a.station - b.station);
  return (
    <svg className="detail" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Detail of the crown skin at stringer S-4L, body stations 520 to 780">
      <defs>
        <pattern id="tear-d" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="3" height="3" fill="var(--signal)" /><line x1="0" y1="0" x2="0" y2="3" stroke="var(--signal-deep)" strokeWidth="1.1" />
        </pattern>
        <marker id="arr" viewBox="0 0 6 6" refX="5.5" refY="3" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L6,3 L0,6 Z" fill="var(--ink)" /></marker>
      </defs>
      <rect x={x(FROM)} y={MT} width={TO - FROM} height={(R1 - R0) * PITCH} fill="var(--skin)" />
      {Array.from({ length: (TO - FROM) / BIN + 1 }, (_, k) => FROM + k * BIN).map((bs) => (
        <line key={bs} x1={x(bs)} x2={x(bs)} y1={MT} y2={MT + (R1 - R0) * PITCH} stroke={bs % 100 === 0 ? "#AEBBC6" : "#E3E8EC"} strokeWidth={0.4} />
      ))}
      {Array.from({ length: R1 - R0 }, (_, k) => {
        const i = R0 + k, { side, n } = rowOf(i);
        return (
          <g key={i}>
            <line x1={x(FROM)} x2={x(TO)} y1={yTop(i) + PITCH / 2} y2={yTop(i) + PITCH / 2} stroke={n === 4 ? "var(--ink)" : "#B4BFC9"} strokeWidth={n === 4 ? 0.5 : 0.3} strokeOpacity={n === 4 ? 0.7 : 1} />
            <text x={x(FROM) - 2.5} y={yTop(i) + PITCH / 2 + 1.5} fontSize={5.54} textAnchor="end" fontWeight={n === 4 ? 700 : 400} className={n === 4 ? "ink" : undefined}>{stringerName(side, n)}</text>
          </g>
        );
      })}
      <line x1={x(FROM)} x2={x(TO)} y1={yTop(STRINGERS)} y2={yTop(STRINGERS)} stroke="var(--ink)" strokeWidth={0.4} strokeDasharray="3 2" opacity={0.6} />
      <text x={x(FROM) + 2} y={yTop(STRINGERS) - 1.2} fontSize={5.13} className="ink" style={halo}>Crown centreline</text>

      {/* crown skin panel */}
      <rect x={x(SWA812.crown.from)} y={yMid("R", 4)} width={SWA812.crown.to - SWA812.crown.from} height={yMid("L", 4) - yMid("R", 4)} fill="none" stroke="var(--ink)" strokeWidth={0.6} strokeDasharray="2.5 1.5" />
      <text x={x(SWA812.crown.from) + 2} y={yMid("R", 4) - 2} fontSize={5.8} className="ink" style={halo}>Crown skin panel, BS 540–727, S-4R to S-4L</text>

      {/* rupture + dimension line */}
      <rect x={x(SWA812.rupture.from)} y={yMid("L", 4)} width={SWA812.rupture.to - SWA812.rupture.from} height={PITCH} fill={ruptured ? "url(#tear-d)" : "none"} stroke="var(--signal-deep)" strokeWidth={0.7} strokeDasharray={ruptured ? undefined : "2 1.2"} />
      <line x1={x(SWA812.rupture.from)} x2={x(SWA812.rupture.from)} y1={yMid("L", 5)} y2={yTear + 6} stroke="var(--ink)" strokeWidth={0.3} />
      <line x1={x(SWA812.rupture.to)} x2={x(SWA812.rupture.to)} y1={yMid("L", 5)} y2={yTear + 6} stroke="var(--ink)" strokeWidth={0.3} />
      <line x1={x(SWA812.rupture.from) + 0.6} x2={x(SWA812.rupture.to) - 0.6} y1={yTear + 4} y2={yTear + 4} stroke="var(--ink)" strokeWidth={0.35} markerStart="url(#arr)" markerEnd="url(#arr)" />
      <text x={(x(SWA812.rupture.from) + x(SWA812.rupture.to)) / 2} y={yTear + 10.5} fontSize={5.8} textAnchor="middle" fontWeight={700} className="signal" style={halo}>Skin fractured, BS 663–727, S-4L to S-5L</text>
      <text x={(x(SWA812.rupture.from) + x(SWA812.rupture.to)) / 2} y={yTear + 18} fontSize={5.27} textAnchor="middle" className="ink" style={halo}>Southwest 812, {fmtDate(SWA812.date)}</text>
      {ruptured && clips && SWA812.clips.map((bs) => (
        <path key={bs} d={`M${x(bs) - 1.6},${yMid("L", 4) - 1.6} l3.2,3.2 m0,-3.2 l-3.2,3.2`} stroke="var(--ink)" strokeWidth={0.6} />
      ))}
      {ruptured && clips && (
        <g>
          <line x1={x(706)} y1={yMid("L", 4) - 1.8} x2={x(738)} y2={yMid("R", 2) + 1} stroke="var(--ink)" strokeWidth={0.25} />
          <text x={x(731)} y={yMid("R", 2) - 5} fontSize={5.27} className="ink" style={halo}>Cracked clips at BS 685 and 706,</text>
          <text x={x(731)} y={yMid("R", 2) + 1.6} fontSize={5.27} className="ink" style={halo}>found after the accident</text>
        </g>
      )}

      {/* the aircraft's own earlier reports */}
      {sorted.map((p, k) => {
        const px = x(p.station), py = yMid(p.side, p.n), ly = mapBottom + 20;
        return (
          <g key={p.id}>
            <line x1={px} y1={py} x2={px} y2={ly - 5} stroke="var(--ink)" strokeWidth={0.3} />
            <circle cx={px} cy={py} r={1.9} fill="var(--ink)" stroke="var(--sheet)" strokeWidth={0.6} />
            <text x={px + 1.5} y={ly} fontSize={5.54} fontWeight={700} className="ink" style={halo}>{p.id}</text>
            <text x={px + 1.5} y={ly + 5.6} fontSize={5.13} className="ink" style={halo}>BS {p.station}, {fmtDate(p.date, true)}</text>
          </g>
        );
      })}

      {/* station axis */}
      {Array.from({ length: (TO - FROM) / BIN + 1 }, (_, k) => FROM + k * BIN).filter((bs) => bs % 40 === 0).map((bs) => (
        <text key={bs} x={x(bs)} y={mapBottom + 7} fontSize={5.27} textAnchor={bs === FROM ? "start" : "middle"}>{bs === FROM ? `BS ${bs}` : bs}</text>
      ))}

      {/* locator: the whole fuselage, this detail boxed */}
      <g transform={`translate(${x(TO) + 10} ${MT + 2})`}>
        <rect width={(BS_MAX - BS_MIN) / 16} height={(ROWS * PITCH) / 16} fill="var(--skin)" stroke="var(--graphite)" strokeWidth={0.3} />
        <rect x={(FROM - BS_MIN) / 16} y={(R0 * PITCH) / 16} width={(TO - FROM) / 16} height={((R1 - R0) * PITCH) / 16} fill="none" stroke="var(--ink)" strokeWidth={0.5} />
        <rect x={(SWA812.rupture.from - BS_MIN) / 16} y={(rowIndex("L", 4) * PITCH) / 16} width={(SWA812.rupture.to - SWA812.rupture.from) / 16} height={1.2} fill="var(--signal)" />
        <text y={(ROWS * PITCH) / 16 + 5} fontSize={4.86}>Where this is</text>
      </g>
    </svg>
  );
}
