"use client";
// Every fuselage stringer line over time: distinct aircraft with matching reports in
// the 12 months before each month (line_window, one query per month, cached). S-4L
// and S-4R are drawn in orange; the busiest lines are labelled too, to stay honest.
import { useEffect, useState } from "react";
// (series come from useLineSeries so the narration can quote the same numbers)
import { view } from "../lib/api";
import type { LineCount } from "./FuselageMap";

const W = 820, H = 440, ML = 44, MR = 92, MT = 18, MB = 34;
const FROM = { y: 2009, m: 1 }, N = 48; // monthly stops, Jan 2009 .. Dec 2012
const iso = (k: number) => { const m = FROM.y * 12 + FROM.m - 1 + k; return `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}-01`; };
const ACCIDENT = 27; // 2011-04-01

/** Monthly 12-month-window counts per line (48 cached line_window queries, 6 at a time). */
export function useLineSeries(args: Record<string, unknown>) {
  const [series, setSeries] = useState<Map<string, number[]> | null>(null);
  const key = JSON.stringify(args);
  useEffect(() => {
    let live = true;
    (async () => {
      const out: LineCount[][] = new Array(N);
      for (let k = 0; k < N; k += 6) await Promise.all(Array.from({ length: Math.min(6, N - k) }, (_, j) => view<LineCount[]>("line_window", { ...args, asOf: iso(k + j) }).then((r) => { out[k + j] = r.rows; })));
      const m = new Map<string, number[]>();
      out.forEach((rows, k) => rows.forEach((r) => { if (!m.has(r.line)) m.set(r.line, new Array(N).fill(0)); m.get(r.line)![k] = r.ac; }));
      if (live) setSeries(m);
    })().catch(() => {});
    return () => { live = false; };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return series;
}

/** The lines with the most aircraft on average before the accident, other than `skip`. */
export function busiest(series: Map<string, number[]>, skip: string[], k = 2) {
  const mean = (v: number[]) => v.slice(0, ACCIDENT).reduce((a, b) => a + b, 0) / ACCIDENT;
  return [...series.entries()].filter(([l]) => !skip.includes(l)).sort((a, b) => mean(b[1]) - mean(a[1])).slice(0, k).map(([l]) => l);
}
export const shortLine = (line: string) => line.split("/")[2].replace(/^S(\d+)([LR])$/, "S-$1$2");

export function TrendChart({ series, highlight = ["737/53/S4L", "737/53/S4R"] }: { series: Map<string, number[]> | null; highlight?: string[] }) {
  const [hover, setHover] = useState<string | null>(null);
  if (!series) return <p className="chart-loading">Running {N} monthly queries on the graph</p>;
  const max = Math.ceil(Math.max(10, ...[...series.values()].flat()) / 10) * 10;
  const x = (k: number) => ML + (k / (N - 1)) * (W - ML - MR);
  const y = (v: number) => MT + (1 - v / max) * (H - MT - MB);
  const path = (v: number[], a = 0, b = N - 1) => v.slice(a, b + 1).map((p, i) => `${i ? "L" : "M"}${x(a + i).toFixed(1)},${y(p).toFixed(1)}`).join("");
  const labelled = [...highlight, ...busiest(series, highlight)];
  // end labels, pushed apart so they never overlap
  const ly = new Map<string, number>();
  labelled.filter((l) => series.has(l)).map((l) => ({ l, y: y(series.get(l)![N - 1]) + 4 })).sort((a, b) => a.y - b.y)
    .forEach((p, i, a) => { if (i && p.y - a[i - 1].y < 14) p.y = a[i - 1].y + 14; ly.set(p.l, p.y); });

  return (
    <svg className="trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Aircraft per stringer line, 12-month window, 2009 to 2012" onMouseLeave={() => setHover(null)}>
      <rect x={x(ACCIDENT)} y={MT} width={x(N - 1) - x(ACCIDENT)} height={H - MT - MB} fill="var(--alclad)" opacity={0.28} />
      {Array.from({ length: max / 10 + 1 }, (_, i) => i * 10).map((v) => (
        <g key={v}><line x1={ML} x2={W - MR} y1={y(v)} y2={y(v)} stroke="var(--alclad)" strokeWidth={0.8} /><text x={ML - 8} y={y(v) + 4} textAnchor="end" fontSize={11}>{v}</text></g>
      ))}
      {[0, 12, 24, 36].map((k) => <text key={k} x={x(k)} y={H - MB + 18} fontSize={11} textAnchor="middle">{iso(k).slice(0, 4)}</text>)}
      <line x1={x(ACCIDENT)} x2={x(ACCIDENT)} y1={MT} y2={H - MB} stroke="var(--signal-deep)" strokeWidth={1.2} strokeDasharray="4 3" />
      <text x={x(ACCIDENT) + 6} y={MT + 12} fontSize={11.5} fontWeight={700} style={{ fill: "var(--signal-deep)" }}>Southwest 812</text>
      <text x={x(ACCIDENT) + 6} y={MT + 27} fontSize={11}>after the accident</text>
      {[...series.entries()].filter(([l]) => !labelled.includes(l)).map(([l, v]) => (
        <path key={l} d={path(v)} fill="none" stroke={hover === l ? "var(--ink)" : "var(--graphite)"} strokeOpacity={hover === l ? 1 : 0.22} strokeWidth={hover === l ? 2 : 1} onMouseEnter={() => setHover(l)} />
      ))}
      {labelled.map((l) => {
        const v = series.get(l);
        if (!v) return null;
        const hot = highlight.includes(l);
        return (
          <g key={l} onMouseEnter={() => setHover(l)}>
            <path d={path(v)} fill="none" stroke={hot ? "var(--signal)" : "var(--ink)"} strokeWidth={hot ? 2.6 : 1.6} strokeOpacity={hot ? 1 : 0.8} />
            <text x={W - MR + 8} y={ly.get(l)} fontSize={12} fontWeight={hot ? 700 : 400} style={{ fill: hot ? "var(--signal-deep)" : "var(--ink)" }}>{shortLine(l)}</text>
          </g>
        );
      })}
      {hover && !labelled.includes(hover) && series.get(hover) && <text x={W - MR + 8} y={y(series.get(hover)![N - 1]) + 4} fontSize={12} style={{ fill: "var(--ink)" }}>{shortLine(hover)}</text>}
      <text x={ML} y={H - 2} fontSize={11}>Aircraft with skin-crack reports on each stringer line, 12 months to each month. Grey: every other line.</text>
    </svg>
  );
}

/** Rank of each highlighted line by rise (ac + 1) / (ac_prev + 1) among lines with 5+ aircraft. */
export function riseRank(rows: LineCount[], line: string) {
  const ranked = rows.filter((r) => r.ac >= 5).sort((a, b) => (b.ac + 1) / (b.ac_prev + 1) - (a.ac + 1) / (a.ac_prev + 1) || b.ac - a.ac);
  const i = ranked.findIndex((r) => r.line === line);
  return { rank: i + 1, of: ranked.length, row: ranked[i] };
}
