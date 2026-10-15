import "@blackbox/graph/src/env";
// Backtest over every NTSB mechanical event in the graph, not one showcase case.
// Question: before an accident, did the aircraft's own maintenance reports point at the
// system the NTSB later cited? Time machine: only reports filed in the window before the event.
//
// Two match levels:
//   system    = a report in a cited ATA chapter (NTSB finding code digits 5-6, e.g. 32 landing gear)
//   subsystem = a report in a cited ATA section (digits 5-7, e.g. 322 nose gear vs JASC 3220-3299),
//               only for findings the NTSB coded below "(general)"
// Chance level = permutation test: each event gets another event's cited systems (1,000 seeded
// shuffles); each aircraft keeps its own reports, so report volume alone cannot make a hit.
//
// Three stages, each closing one leak, so the drop is visible:
//   naive   any report before the event; chance from any event
//   gap     reports filed at least --gap days before (a report the day before is usually the event itself)
//   fair    + chance only from events of the SAME aircraft family, families with 2+ events (helicopter
//           accidents cite rotors and helicopters report rotors: a family habit, not a warning sign)
// detectable_lift = 95th percentile of the null / its mean: the smallest lift the test would catch.
// Run: npm run backtest -w services/eval [-- --days=365 --gap=7 --out=apps/web/public/backtest.json]
import { writeFileSync } from "node:fs";
import { connect } from "@blackbox/graph/src/db";

const flag = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3) ?? d;
const DAYS = Number(flag("days", "365"));
const GAP = Number(flag("gap", "7"));
const SHUFFLES = Number(flag("shuffles", "1000"));
const OUT = flag("out", "");

interface Rep { id: string; ch: string; jasc: string; date: string; text: string }
interface Row { ev: string; ntsb: string; date: string; family: string; tail: string; cause: string; codes: string[]; reports: Rep[] }
interface Cited { ch: string[]; sec: string[] }
type Ev = Row & { cited: Cited };
type Level = keyof Cited;

const db = await connect();
if (!db) throw new Error("FalkorDB not reachable");

// NTSB finding code: 01 02 32 20 07 = aircraft / systems / ATA 32 / section 20 / failure.
const cite = (codes: string[]): Cited => ({
  ch: [...new Set(codes.map((c) => c.slice(4, 6)))],
  sec: [...new Set(codes.filter((c) => c.slice(6, 8) !== "00").map((c) => c.slice(4, 7)))],
});
const matching = (c: Cited, level: Level, reps: Rep[]) =>
  reps.filter((r) => (level === "ch" ? c.ch.includes(r.ch) : c.sec.includes(String(r.jasc ?? "").slice(0, 3))));
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
const quart = (v: number[], q: number) => (v.length ? v[Math.min(v.length - 1, Math.floor(q * v.length))] : null);

/** Events with their cited systems and the aircraft's reports in [date - DAYS, date - gap). */
async function load(gap: number): Promise<Ev[]> {
  const rows = (await db!.query(`
    MATCH (a:Accident)-[:INVOLVED]->(t:Aircraft)-[:IS_A]->(m:Model)
    MATCH (a)-[:FOUND]->(f:Finding)
    WITH a, t, m, collect(DISTINCT f.code) AS codes
    MATCH (t)<-[:ON]-(r:Report)-[:AT]->(l:Location)
    WHERE r.date < toString(date(a.date) - duration({days: $gap}))
      AND r.date >= toString(date(a.date) - duration({days: $days}))
    RETURN a.ev_id AS ev, a.ntsb_no AS ntsb, a.date AS date, m.family AS family, t.tail AS tail,
      a.cause_text AS cause, codes,
      collect(DISTINCT {id: r.id, ch: l.chapter, jasc: r.jasc, date: r.date, text: r.text}) AS reports`,
    { days: DAYS, gap })) as Row[];
  return rows.map((e) => ({ ...e, cited: cite(e.codes) })).filter((e) => e.cited.ch.length);
}

/** Observed hits vs a seeded permutation null, for one match level; `byFamily` shuffles within families. */
function test(events: Ev[], level: Level, byFamily: boolean) {
  let seed = 42;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  let scope = events.filter((e) => e.cited[level].length > 0);
  // within-family: a family with one event has no counterfactual (it would only dilute the lift)
  const size = new Map<string, number>();
  for (const e of scope) size.set(e.family, (size.get(e.family) ?? 0) + 1);
  if (byFamily) scope = scope.filter((e) => size.get(e.family)! > 1);
  const groups = new Map<string, number[]>();
  scope.forEach((e, i) => { const g = byFamily ? e.family : "all"; groups.set(g, [...(groups.get(g) ?? []), i]); });
  const count = (assign: Cited[]) => scope.filter((e, i) => matching(assign[i], level, e.reports).length > 0).length;
  const observed = count(scope.map((e) => e.cited));
  const nulls: number[] = [];
  for (let s = 0; s < SHUFFLES; s++) {
    const out = scope.map((e) => e.cited);
    for (const idx of groups.values()) { // Fisher-Yates within each group; singleton groups stay put
      const vals = idx.map((i) => scope[i].cited);
      for (let i = vals.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [vals[i], vals[j]] = [vals[j], vals[i]]; }
      idx.forEach((i, k) => (out[i] = vals[k]));
    }
    nulls.push(count(out));
  }
  const mean = nulls.reduce((a, b) => a + b, 0) / nulls.length;
  const sd = Math.sqrt(nulls.reduce((a, b) => a + (b - mean) ** 2, 0) / nulls.length);
  const hits = scope.filter((e) => matching(e.cited, level, e.reports).length);
  // lead time = days from the latest matching report to the event
  const leads = hits.map((e) => days(matching(e.cited, level, e.reports).map((r) => r.date).sort().at(-1)!, e.date)).sort((a, b) => a - b);
  const hist = new Map<number, number>();
  for (const v of nulls) hist.set(v, (hist.get(v) ?? 0) + 1);
  return {
    stats: {
      events: scope.length, hits: observed, hit_rate: +(observed / scope.length).toFixed(3),
      chance: { hits_mean: +mean.toFixed(1), hits_sd: +sd.toFixed(1), rate: +(mean / scope.length).toFixed(3),
        p_value: +((nulls.filter((v) => v >= observed).length + 1) / (nulls.length + 1)).toFixed(4),
        histogram: [...hist.entries()].sort((a, b) => a[0] - b[0]) },
      lift: +(observed / mean).toFixed(2),
      detectable_lift: +([...nulls].sort((a, b) => a - b)[Math.floor(0.95 * nulls.length)] / mean).toFixed(2),
      lead_days: { p25: quart(leads, 0.25), median: quart(leads, 0.5), p75: quart(leads, 0.75) },
    },
    hits,
  };
}

const t0 = Date.now();
const [all, gapped] = [await load(0), await load(GAP)];
const queryMs = Date.now() - t0;
const STAGES = [
  { key: "naive", label: "Any earlier report, chance from any event", events: all, byFamily: false },
  { key: "gap", label: `Reports at least ${GAP} days before, chance from any event`, events: gapped, byFamily: false },
  { key: "fair", label: `Reports at least ${GAP} days before, chance from the same aircraft family`, events: gapped, byFamily: true },
] as const;
const stages = STAGES.map((s) => ({
  key: s.key, label: s.label, events: s.events.length, families: new Set(s.events.map((e) => e.family)).size,
  system: test(s.events, "ch", s.byFamily).stats, subsystem: test(s.events, "sec", s.byFamily).stats,
}));

// Fair-stage subsystem hits, longest lead first, with the source text: what a "hit" looks like.
const examples = test(gapped, "sec", true).hits.map((e) => {
  const m = matching(e.cited, "sec", e.reports).sort((a, b) => a.date.localeCompare(b.date));
  return { ev: e.ev, ntsb: e.ntsb, date: e.date, tail: e.tail, family: e.family, cause: e.cause, cited: e.cited.sec,
    lead_days: days(m.at(-1)!.date, e.date), reports: m.map((r) => ({ id: r.id, date: r.date, jasc: r.jasc, text: (r.text ?? "").slice(0, 220) })) };
}).sort((a, b) => b.lead_days - a.lead_days);

const result = {
  question: "Before each NTSB mechanical event, did the aircraft's own FAA reports name a system the NTSB later cited?",
  window_days: DAYS, gap_days: GAP, shuffles: SHUFFLES, seed: 42, run: new Date().toISOString(), query_ms: queryMs,
  stages, examples,
};
for (const s of stages) for (const l of ["system", "subsystem"] as const) {
  const x = s[l];
  console.log(`${s.key.padEnd(5)} ${l.padEnd(9)} ${x.hits}/${x.events} = ${(100 * x.hit_rate).toFixed(1)}%  chance ${(100 * x.chance.rate).toFixed(1)}%  lift ${x.lift} (detectable ${x.detectable_lift})  p ${x.chance.p_value}  lead median ${x.lead_days.median} d`);
}
console.log(`${examples.length} fair subsystem hits; queries ${queryMs} ms`);
if (OUT) writeFileSync(OUT, JSON.stringify(result, null, 2));
process.exit(0);
