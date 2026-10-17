"use client";
// Time machine: one stop per month. Everything on the board (map, agent) only sees
// records dated before the chosen day. Play steps a month at a time.
import { useEffect, useRef, useState } from "react";
import { fmtDate } from "../lib/fuselage";
import { TERMS } from "../lib/glossary";
import { Term } from "./Tip";

export const SLIDER_FROM = "2009-01-01";
export const SLIDER_TO = "2013-01-01";
const months = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
const addMonths = (iso: string, k: number) => {
  const m = Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1 + k;
  return `${Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, "0")}-01`;
};
export interface Mark { date: string; label: string; hot?: boolean }

export function TimeSlider({ asOf, onChange, marks = [], stopAt, prefetch }: {
  asOf: string; onChange: (iso: string) => void; marks?: Mark[];
  stopAt?: string;                       // play pauses here (e.g. the accident)
  prefetch?: (iso: string) => void;      // warm the next frames while playing
}) {
  const total = months(SLIDER_FROM, SLIDER_TO);
  const [playing, setPlaying] = useState(false);
  const cur = useRef(asOf);
  cur.current = asOf;
  useEffect(() => {
    if (!playing) return;
    const end = stopAt && cur.current < stopAt ? stopAt : SLIDER_TO;
    const t = setInterval(() => {
      const next = addMonths(cur.current, 1);
      for (let k = 1; k <= 3; k++) prefetch?.(addMonths(next, k));
      if (next >= end) { onChange(end); setPlaying(false); } else onChange(next);
    }, 420);
    return () => clearInterval(t);
  }, [playing, stopAt, onChange, prefetch]);
  const pos = (iso: string) => `calc(8px + (100% - 16px) * ${Math.min(1, Math.max(0, months(SLIDER_FROM, iso) / total))})`;
  const play = () => {
    if (!playing && asOf >= (stopAt && asOf < stopAt ? stopAt : SLIDER_TO)) onChange(SLIDER_FROM);
    setPlaying((p) => !p);
  };
  return (
    <div className="slider">
      <button className="play" onClick={play} aria-label={playing ? "Pause" : "Play through time"}>
        {playing ? <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="1" width="3.5" height="10" /><rect x="7.5" y="1" width="3.5" height="10" /></svg>
          : <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 1 L11 6 L2 11 Z" /></svg>}
      </button>
      <div className="track">
        {marks.map((m) => <span key={m.date} className={`mark${m.hot ? " hot" : ""}`} style={{ left: pos(m.date) }}>{m.label}</span>)}
        <input type="range" min={0} max={total} step={1} value={months(SLIDER_FROM, asOf)} aria-label="Investigation date"
          aria-valuetext={fmtDate(asOf)} onChange={(e) => { setPlaying(false); onChange(addMonths(SLIDER_FROM, Number(e.target.value))); }} />
        <div className="years">{[2009, 2010, 2011, 2012, 2013].map((y) => <span key={y} style={{ left: pos(`${y}-01-01`) }}>{y}</span>)}</div>
      </div>
      <div className="date-big">{fmtDate(asOf)}<small><Term tip={TERMS.timeMachine}>Records before this day only</Term></small></div>
    </div>
  );
}
