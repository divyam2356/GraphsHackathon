// Geometry of the unrolled 737 fuselage skin drawn by FuselageMap, in inches.
// x = body station (BS: inches aft of a datum ahead of the nose), in the 20-inch
// bins the ingest uses. y = stringer rows, viewed from above with the nose left:
// right side on top, the crown (S-1) in the middle, left side below.
// The stringer pitch is approximate (737 circumference / 56 stringers).

export type Side = "L" | "R";
export const BS_MIN = 200;
export const BS_MAX = 1140;
export const BIN = 20;
export const STRINGERS = 28; // per side, S-1 at the crown
export const ROWS = 2 * STRINGERS;
export const PITCH = 8.3;

/** Row index 0..55, top to bottom: S-28R .. S-1R, S-1L .. S-28L. */
export const rowIndex = (side: Side, n: number) => (side === "R" ? STRINGERS - n : STRINGERS - 1 + n);
export const rowOf = (i: number): { side: Side; n: number } => (i < STRINGERS ? { side: "R", n: STRINGERS - i } : { side: "L", n: i - STRINGERS + 1 });
export const stringerName = (side: Side, n: number) => `S-${n}${side}`;
export const lineKey = (side: Side, n: number) => `737/53/S${n}${side}`;
export const binKey = (side: Side, n: number, station: number) => `${lineKey(side, n)}/BS${station}`;

/** Parse "737/53/S4L/BS620" (or a line key) into its parts. */
export function parseKey(key: string): { side: Side; n: number; station?: number } | null {
  const m = key.match(/\/S(\d+)([LR])(?:\/BS(\d+))?$/);
  return m ? { n: Number(m[1]), side: m[2] as Side, station: m[3] ? Number(m[3]) : undefined } : null;
}

/** Southwest 812, from NTSB brief AAB-13/02. */
export const SWA812 = {
  date: "2011-04-01",
  evId: "20110401X24330",
  tail: "N632SW",
  variant: "737-300",
  crown: { from: 540, to: 727 },   // crown skin panel, S-4L to S-4R
  rupture: { from: 663, to: 727 }, // fractured skin, between S-4L and S-5L
  clips: [685, 706],               // cracked stringer clips on S-4L found after the accident
};

// Heat ramp for distinct aircraft per cell: bare skin, then orange to deep orange.
const STOPS: Array<[number, [number, number, number]]> = [
  [0, [0xd6, 0xdd, 0xe3]],
  [0.2, [0xf7, 0xb5, 0x8f]],
  [0.62, [0xff, 0x4f, 0x00]],
  [1, [0xb8, 0x33, 0x00]],
];
export const HEAT_MAX = 12;

/** Colour for n aircraft (near-linear, so one report reads pale; clamped at HEAT_MAX). */
export function heat(n: number): string {
  if (n <= 0) return "var(--skin)";
  const t = Math.min(1, (n / HEAT_MAX) ** 0.8);
  let i = 1;
  while (i < STOPS.length - 1 && STOPS[i][0] < t) i++;
  const [t0, c0] = STOPS[i - 1];
  const [t1, c1] = STOPS[i];
  const f = (t - t0) / (t1 - t0);
  const c = c0.map((v, k) => Math.round(v + (c1[k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/** First body station written in a report ("AT BS 639, STR 4L" -> 639). */
export const stationIn = (text: string | undefined) => {
  const m = text?.match(/BS\s*(\d{3,4})/);
  return m ? Number(m[1]) : undefined;
};

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
/** "2011-04-01" -> "1 April 2011" (short: "1 Apr 2011"). */
export function fmtDate(iso: string, short = false) {
  const [y, m, d] = iso.split("-").map(Number);
  const name = MONTHS[m - 1];
  return `${d} ${short ? name.slice(0, 3) : name} ${y}`;
}
