"use client";
// The backtest (services/eval/src/backtest.ts, saved to /backtest.json): for each stage,
// the observed hit rate against the distribution of hit rates under 1,000 shuffles, then
// the hits that survive the fair test, with the source text and our reading of each.
import { useEffect, useState } from "react";
import { fmtDate } from "../lib/fuselage";

interface Stats { events: number; hits: number; hit_rate: number; lift: number; detectable_lift: number;
  chance: { hits_mean: number; rate: number; p_value: number; histogram: Array<[number, number]> } }
interface Stage { key: string; label: string; events: number; system: Stats; subsystem: Stats }
interface Example { ev: string; ntsb: string; date: string; tail: string; family: string; cause: string; cited: string[]; lead_days: number;
  reports: Array<{ id: string; date: string; jasc: string; text: string }> }
export interface BacktestResult { window_days: number; gap_days: number; shuffles: number; run: string; stages: Stage[]; examples: Example[] }

const SHORT: Record<string, string> = { naive: "Naive", gap: "Without the event's own report", fair: "Fair: same aircraft family" };
// Our reading of each surviving hit, checked against the NTSB cause and the report text.
const READING: Record<string, string> = {
  CEN10IA554: "Same part: the nose gear fork had been reported cracked four months earlier.",
  DCA13FA148: "Same subsystem, different fault: a gear that would not extend, fixed by replacing the control handle.",
  DCA16FA217: "Coincidence: routine frame cracks matched a secondary finding; the event was a fan blade failure.",
  DCA09FA065: "Coincidence: skin cracks at the front (nose wheel well, BS 303), while the 2009 failure was in the crown near the tail fin.",
};

export function useBacktest() {
  const [r, set] = useState<BacktestResult | null>(null);
  useEffect(() => { fetch("/backtest.json").then((x) => x.json()).then(set, () => {}); }, []);
  return r;
}

const W = 820, ROW = 122, ML = 16, MR = 150, TOP = 8;

/** One row per stage: grey bars = how often each hit rate came up by chance; ink line = what happened. */
export function BacktestChart({ r, level }: { r: BacktestResult; level: "system" | "subsystem" }) {
  const max = Math.ceil(Math.max(...r.stages.map((s) => Math.max(s[level].hit_rate, ...s[level].chance.histogram.map(([h]) => h / s[level].events)))) * 10 + 0.5) / 10;
  const x = (v: number) => ML + (v / max) * (W - ML - MR);
  const H = TOP + r.stages.length * ROW + 30;
  const ticks = Array.from({ length: Math.round(max * 10) + 1 }, (_, k) => k / 10);
  return (
    <div className="scroll-x"><svg viewBox={`0 0 ${W} ${H}`} className="backtest" role="img" aria-label={`Hit rate against chance at the ${level} level, for three tests`}>
      {ticks.map((t) => <g key={t}><line x1={x(t)} x2={x(t)} y1={TOP} y2={H - 26} stroke="var(--alclad)" strokeWidth={t === 0 ? 1.2 : 0.6} /><text x={x(t)} y={H - 10} textAnchor="middle" fontSize={11}>{Math.round(t * 100)}%</text></g>)}
      {r.stages.map((s, k) => {
        const st = s[level], y0 = TOP + k * ROW, base = y0 + ROW - 22;
        const peak = Math.max(...st.chance.histogram.map(([, c]) => c));
        const bw = Math.max(1.5, (W - ML - MR) / max / st.events - 1);
        const fair = s.key === "fair";
        return (
          <g key={s.key}>
            <text x={ML} y={y0 + 16} fontSize={13} fontWeight={700} className="bt-label">{k + 1}. {SHORT[s.key] ?? s.key}</text>
            <text x={ML} y={y0 + 31} fontSize={11.5}>{st.events} events, {s.key === "naive" ? "any earlier report" : `reports at least ${r.gap_days} days before`}</text>
            {st.chance.histogram.map(([h, c]) => <rect key={h} x={x(h / st.events) - bw / 2} y={base - (c / peak) * 44} width={bw} height={(c / peak) * 44} fill="var(--graphite)" opacity={0.42} />)}
            <line x1={ML} x2={W - MR} y1={base} y2={base} stroke="var(--alclad)" />
            <line x1={x(st.hit_rate)} x2={x(st.hit_rate)} y1={base - 54} y2={base + 4} stroke="var(--ink)" strokeWidth={2.4} />
            <circle cx={x(st.hit_rate)} cy={base - 54} r={4} fill="var(--ink)" />
            <text x={W - MR + 14} y={base - 30} fontSize={22} fontWeight={700} className={fair ? "bt-lift fair" : "bt-lift"}>{st.lift.toFixed(2)}×</text>
            <text x={W - MR + 14} y={base - 12} fontSize={11.5}>{(st.hit_rate * 100).toFixed(1)}% vs {(st.chance.rate * 100).toFixed(1)}%</text>
            <text x={W - MR + 14} y={base + 3} fontSize={11.5}>p {st.chance.p_value < 0.01 ? "< 0.01" : `= ${st.chance.p_value.toFixed(2)}`}</text>
          </g>
        );
      })}
    </svg></div>
  );
}

/** First sentence, skipping abbreviations such as "No." (needs a 3+ letter word before the stop). */
const sentence = (t: string) => { const m = t.match(/^.*?[A-Za-z]{3,}\.(?=\s|$)/)?.[0] ?? t; return m.length > 200 ? `${m.slice(0, 200)}…` : m; };

/** The hits that survive the fair test, with what the records say. */
export function BacktestHits({ r }: { r: BacktestResult }) {
  return (
    <ol className="bt-hits">
      {r.examples.map((e) => {
        const last = e.reports.at(-1)!;
        return (
          <li key={e.ev}>
            <div className="report-head"><b>{e.ntsb}</b><span>{e.tail}, {e.family}</span><span>{fmtDate(e.date, true)}</span></div>
            <p className="bt-cause"><span>NTSB cause</span>{sentence(e.cause)}</p>
            <p className="bt-cause"><span>Report {e.lead_days} days before</span>{sentence(last.text)}</p>
            {READING[e.ntsb] && <p className="bt-read">{READING[e.ntsb]}</p>}
          </li>
        );
      })}
    </ol>
  );
}
