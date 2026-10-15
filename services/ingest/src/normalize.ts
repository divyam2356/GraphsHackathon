// Pure normalizers shared by the NTSB and FAA-report loaders. Both sources spell
// the same aircraft, model and system differently; these make them meet on one key.
// Location keys form a hierarchy so nearby reports share nodes:
//   zone  "737/53"              model family + ATA/JASC chapter (53 = fuselage)
//   line  "737/53/S4L"          stringer 4 left (or "737/57/WL" = left wing)
//   bin   "737/53/S4L/BS620"    20-inch station bin on that line (BS 620–639)

/** ISO date "YYYY-MM-DD" from "2010-03-09 00:00:00" or "03/09/2010"; null if unparseable. */
export function isoDate(s: string | undefined): string | null {
  const v = (s ?? "").trim();
  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}`;
  return null;
}

const alnum = (s: string | undefined) => (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");

/** US tail number with N prefix ("632SW" and "N632SW" -> "N632SW"). */
export function tailOf(s: string | undefined): string {
  const v = alnum(s);
  if (!v) return "";
  return v.startsWith("N") ? v : `N${v}`;
}

/** Serial number without punctuation or leading zeros. */
export function serialOf(s: string | undefined): string {
  return alnum(s).replace(/^0+/, "");
}

/** Aircraft identity: tail numbers get reassigned over the years, so tail + serial. */
export function aircraftId(tail: string, serial: string): string {
  return `${tail}|${serial || "?"}`;
}

/**
 * Model family shared by NTSB ("737", "737-7H4") and SDR ("7373H4") spellings.
 * Boeing: 3 digits. Airbus A318–A321: "A320". Others: first 4 alphanumerics
 * ("CL-600-2B19" and "CL6002B19" -> "CL60"), which is consistent across both sources.
 */
export function familyOf(model: string | undefined): string {
  const v = alnum(model);
  if (/^7[0-9]7/.test(v)) return v.slice(0, 3);
  if (/^A3[12][0-9]/.test(v)) return "A320";
  if (/^A3[0-9]{2}/.test(v)) return v.slice(0, 4);
  return v.slice(0, 4);
}

/** 737 sub-variant ("7373H4" -> "737-300"); other families return the family. */
export function variantOf(model: string | undefined, series?: string): string {
  const v = alnum(model);
  const fam = familyOf(model);
  if (fam !== "737") return fam;
  const d = v.length > 3 ? v[3] : alnum(series)[0];
  return d && /[1-9]/.test(d) ? `737-${d}00` : "737";
}

/** ATA iSpec 2200 chapter names, for System nodes created from FAA reports. */
export const CHAPTER_NAMES: Record<string, string> = {
  "21": "Air conditioning", "22": "Auto flight", "23": "Communications", "24": "Electrical power",
  "25": "Equipment/furnishings", "26": "Fire protection", "27": "Flight controls", "28": "Fuel",
  "29": "Hydraulic power", "30": "Ice and rain protection", "31": "Indicating/recording", "32": "Landing gear",
  "33": "Lights", "34": "Navigation", "35": "Oxygen", "36": "Pneumatic", "38": "Water/waste", "49": "APU",
  "51": "Structures (general)", "52": "Doors", "53": "Fuselage", "54": "Nacelles/pylons", "55": "Stabilizers",
  "56": "Windows", "57": "Wings", "61": "Propellers", "62": "Main rotor", "63": "Main rotor drive",
  "64": "Tail rotor", "65": "Tail rotor drive", "67": "Rotor flight control", "71": "Power plant",
  "72": "Engine (turbine)", "73": "Engine fuel and control", "74": "Ignition", "75": "Engine air",
  "76": "Engine controls", "77": "Engine indicating", "78": "Exhaust", "79": "Engine oil", "80": "Starting",
  "81": "Turbochargers", "85": "Reciprocating engine",
};

const STATION_BIN = 20; // inches; nearby cracks share a node

function bin20(n: number): number {
  return Math.floor(n / STATION_BIN) * STATION_BIN;
}

export interface LocInput {
  family: string;
  chapter: string;          // 2-digit ATA/JASC chapter
  station?: string;         // fuselage station, e.g. "727A", "639"
  stringer?: string;        // "4"
  side?: string;            // "L" | "R"
  wingStation?: string;     // "562.39"
  wingSide?: string;
  text?: string;            // free text fallback ("STR 4L", "BS 639", "S-4L")
}

export interface LocNode { bin: string; level: "zone" | "line" | "bin"; family: string; chapter: string; parent?: string; stringer?: string; side?: string; station_bin?: number }

/** Location chain from finest to zone. The first element is where the report attaches. */
export function locationChain(i: LocInput): LocNode[] {
  const zone = `${i.family}/${i.chapter}`;
  const base = { family: i.family, chapter: i.chapter };
  const zoneNode: LocNode = { bin: zone, level: "zone", ...base };

  let station = num(i.station);
  let str = (i.stringer ?? "").replace(/\D/g, "");
  let side = (i.side ?? "").trim().toUpperCase().slice(0, 1);
  const text = (i.text ?? "").toUpperCase();
  if (!str && text) {
    const m = text.match(/\b(?:STR|STRINGER|S)[\s.-]*(\d{1,2})\s?-?([LR])\b/);
    if (m) { str = m[1]; side = m[2]; }
  }
  if (station === null && text) {
    const m = text.match(/\b(?:BS|B\.S\.|STA|FS|BODY STATION)\s*\.?\s*(\d{3,4})/);
    if (m) station = Number(m[1]);
  }
  if (side !== "L" && side !== "R") side = "";

  // Wing structure: line per side, bins along the wing station.
  const ws = num(i.wingStation);
  const wside = (i.wingSide ?? "").trim().toUpperCase().slice(0, 1);
  if (i.chapter === "57" && ws !== null && (wside === "L" || wside === "R")) {
    const line = `${zone}/W${wside}`;
    const b = bin20(ws);
    return [
      { bin: `${line}/WS${b}`, level: "bin", ...base, parent: line, side: wside, station_bin: b },
      { bin: line, level: "line", ...base, parent: zone, side: wside },
      zoneNode,
    ];
  }

  if (str && side) {
    const line = `${zone}/S${Number(str)}${side}`;
    const lineNode: LocNode = { bin: line, level: "line", ...base, parent: zone, stringer: String(Number(str)), side };
    if (station === null) return [lineNode, zoneNode];
    const b = bin20(station);
    return [{ bin: `${line}/BS${b}`, level: "bin", ...base, parent: line, stringer: lineNode.stringer, side, station_bin: b }, lineNode, zoneNode];
  }
  if (station !== null) {
    const b = bin20(station);
    return [{ bin: `${zone}/BS${b}`, level: "bin", ...base, parent: zone, station_bin: b }, zoneNode];
  }
  return [zoneNode];
}

function num(s: string | undefined): number | null {
  const m = (s ?? "").match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}
