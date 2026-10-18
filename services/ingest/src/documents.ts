import "@blackbox/graph/src/env";
// Real documents -> Document + Section nodes, linked to the Locations their text names.
// Three US-government/public-domain documents around Southwest 812: FAA emergency AD
// 2011-08-51 (issued 2011-04-05; Federal Register amendment 2011-05-18), the AD that
// supersedes it (AD 2015-16-08, FR 2015-08-25) and the NTSB brief AAB-13/02 (adopted
// 2013-09-24). Text stays verbatim; a section's date is its document's date, so the time
// machine ($asOf) applies to citations too. Everything MERGEs: re-running is idempotent.
// Usage: npm run ingest:documents   (run scripts/fetch-data.sh for data/raw/docs/ first)
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { dataDir, writeBatches } from "./load";
import { requireDb } from "./load";
import { locationChain, type LocNode } from "./normalize";

export interface DocConfig {
  id: string;
  kind: "AD" | "NTSB brief";
  title: string;
  date: string; // every section inherits it (AD issue date / brief adoption date)
  url: string;
  file: string;
  /** DESCRIBES target: an ad_no (FixOrder) or an ev_id (Accident). */
  describes: { ad?: string; ev?: string };
}

// Titles, urls and dates as on the documents themselves (checked Oct 17: FR API, the
// govinfo HTML pages, and the brief's own cover line "Adopted: September 24, 2013").
export const DOCS: DocConfig[] = [
  {
    id: "AD-2011-08-51", kind: "AD", date: "2011-04-05",
    title: "Emergency AD 2011-08-51: The Boeing Company Model 737-300, -400, and -500 Series Airplanes (Amendment 39-16701, 76 FR 28632, May 18, 2011)",
    url: "https://www.federalregister.gov/documents/2011/05/18/2011-11928/airworthiness-directives-the-boeing-company-model-737-300--400-and--500-series-airplanes",
    file: "AD-2011-08-51.htm", describes: { ad: "AD-2011-08-51" },
  },
  {
    id: "AD-2015-16-08", kind: "AD", date: "2015-08-25",
    title: "AD 2015-16-08: The Boeing Company Airplanes (Amendment 39-18233, 80 FR 51452, August 25, 2015)",
    url: "https://www.federalregister.gov/documents/2015/08/25/2015-20372/airworthiness-directives-the-boeing-company-airplanes",
    file: "AD-2015-16-08.htm", describes: { ad: "AD-2015-16-08" },
  },
  {
    id: "NTSB-AAB-13-02", kind: "NTSB brief", date: "2013-09-24",
    title: "NTSB Aviation Accident Brief AAB-13/02: Southwest Airlines Flight 812, Boeing 737-3H4, N632SW, April 1, 2011",
    url: "https://www.ntsb.gov/investigations/AccidentReports/Reports/AAB1302.pdf",
    file: "NTSB-AAB-13-02.txt", describes: { ev: "20110401X24330" },
  },
];

export interface Section { id: string; n: number; heading: string; text: string; date: string }

/** The § 39.13 paragraph letters and headings, in order, for each AD. 2011 puts the
 *  heading before "(x)" ("...of this amendment. Affected ADs (b) None."), 2015 after it
 *  ("(a) Effective Date This AD is effective..."). "" = the paragraph has no heading on
 *  its own (2011 (h)-(k)). Pinned to the texts on disk; the splitter errors if any is not found. */
const AD_HEADINGS: Record<"AD-2011-08-51" | "AD-2015-16-08", Record<string, string>> = {
  "AD-2011-08-51": {
    a: "Effective Date", b: "Affected ADs", c: "Applicability", d: "Subject", e: "Unsafe Condition",
    f: "Compliance", g: "Inspections", h: "", i: "", j: "", k: "",
    l: "Alternative Methods of Compliance (AMOCs)", m: "Related Information", n: "Material Incorporated by Reference",
  },
  "AD-2015-16-08": {
    a: "Effective Date", b: "Affected ADs", c: "Applicability", d: "Subject", e: "Unsafe Condition",
    f: "Compliance",
    g: "Repetitive Inspections for Crack Indications at Stringers S-4R and S-4L, Body Station (BS) 360 to BS 908",
    h: "One-Time Inspections for Cracks at Stringers S-4L and S-4R, BS 360 to BS 908",
    i: "One-Time Inspections for Cracks at Stringer S-4R, BS 908 to BS 1016",
    j: "Repetitive Inspections for Cracks at Stringer S-4R, BS 908 to BS 1016",
    k: "General Visual Inspection for Open Pockets at Stringer S-4R, BS 908 to BS 1016",
    l: "Corrective Action", m: "Service Information Exception", n: "Credit for Previous Actions",
    o: "Alternative Methods of Compliance (AMOCs)", p: "Related Information", q: "Material Incorporated by Reference",
  },
};

const BRIEF_HEADINGS = [
  "HISTORY OF FLIGHT", "INJURIES TO PERSONS", "DAMAGE TO AIRCRAFT", "OTHER DAMAGE",
  "PERSONNEL INFORMATION", "AIRCRAFT INFORMATION", "FLIGHT RECORDERS", "SURVIVAL ASPECTS",
  "TESTS AND RESEARCH", "ORGANIZATIONAL AND MANAGEMENT INFORMATION", "ADDITIONAL INFORMATION",
  "ANALYSIS", "PROBABLE CAUSE",
];

/** Federal Register HTML -> plain text of the amendment itself (§ 39.13 onward). */
export function stripGovernmentHtml(html: string): string {
  const t = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d))) // decimal: &#160; is NBSP, not U+0160
    .replace(/\s+/g, " ")
    .trim();
  const at = t.indexOf("39.13 [Amended]");
  return at > -1 ? t.slice(at) : t;
}

/** ER-paragraph markers of one AD in document order, each anchored to its heading so
 *  in-body cross-references ("paragraphs (h) and (i) of this AD") never match. */
function adMarkers(text: string, docId: "AD-2011-08-51" | "AD-2015-16-08"): Array<{ label: string; at: number }> {
  const headings = AD_HEADINGS[docId];
  const preStyle = docId === "AD-2011-08-51"; // 2011: heading before "(x)"; 2015: after
  const marks: Array<{ label: string; at: number }> = [];
  let from = 0;
  for (const [label, heading] of Object.entries(headings)) {
    const re = new RegExp(`\\(${label}\\)(?=[ (\\dA-Z])`, "g"); // "(1)"-style digits can't match; "(a This..." can't
    let hit = -1;
    for (let m = re.exec(text); m; m = re.exec(text)) {
      const i = m.index;
      if (i < from) continue;
  const after = text.slice(i, i + heading.length + label.length + 3);
      const before = text.slice(0, i).trimEnd();
      const ok = heading
        ? preStyle
          ? // "Affected ADs (b)" — the heading ends exactly at the marker
            before.endsWith(heading)
          : after.startsWith(`(${label}) ${heading}`)
        : preStyle
          ? // no heading of its own (2011 (h)-(k)): "later. (h) For areas..."
            /[.)] $/.test(text.slice(Math.max(0, i - 2), i))
          : false;
      if (ok) { hit = i; break; }
    }
    if (hit === -1) throw new Error(`${docId}: paragraph (${label}) not found`);
    marks.push({ label, at: hit });
    from = hit + label.length + 2;
  }
  return marks;
}

export function adSections(html: string, docId: "AD-2011-08-51" | "AD-2015-16-08", date: string): Section[] {
  const text = stripGovernmentHtml(html);
  const headings = AD_HEADINGS[docId];
  const before = docId === "AD-2011-08-51";
  const marks = adMarkers(text, docId);
  const out: Section[] = [];
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].at : text.length;
    let body = text.slice(marks[i].at, end).trim();
    const heading = headings[marks[i].label];
    if (before) {
      if (heading) body = body.slice(`(${marks[i].label})`.length).trim(); // drop the label; the heading was before it
      // the *next* paragraph's heading sat before its marker and therefore on our tail; drop it
      const next = i + 1 < marks.length ? headings[marks[i + 1].label] : "";
      if (next && body.endsWith(next)) body = body.slice(0, body.length - next.length).trim();
    } else if (heading) {
      body = body.slice(`(${marks[i].label}) `.length + heading.length).trim(); // 2015 style: "(a) Effective Date This AD..."
    } else {
      body = body.slice(`(${marks[i].label})`.length).trim();
    }
    if (i + 1 === marks.length) {
      // both ADs end with the FR furniture; cut it, keep the paragraph verbatim
      for (const tail of ["[[Page", "[FR Doc.", "BILLING CODE"]) {
        const at = body.indexOf(tail);
        if (at > -1) body = body.slice(0, at).trim();
      }
      // "Issued in ... on <date>. <name>, <title>." — keep the sentence up to the signature line
      const issued = body.indexOf(" Issued in ");
      if (issued > -1) body = body.slice(0, issued).trim();
    }
    out.push({ id: `${docId}#${marks[i].label}`, n: i + 1, heading: heading || `Paragraph (${marks[i].label})`, text: body, date });
  }
  return out;
}

/** NTSB brief text -> sections by their all-caps headings, page furniture dropped. */
export function briefSections(text: string, date: string): Section[] {
  const furniture = /^(?:\s+|N|E|O|I|T|A|S|P|L|R|U|B)*$/;
  const lines = text.split("\n").map((l) => l.replace(/\s+$/, ""));
  const keep = lines.filter((l) =>
    l && !furniture.test(l) && !/^[A-Z]{1,3}$/.test(l.replace(/\s/g, "")) &&
    !l.includes("AITRA SPOR") && !l.includes("PLUR IBUS") && !l.includes("BOARDSAFE T"));
  const flat = keep.join("\n").replace(/\n(?=\S)/g, " ").replace(/\s+/g, " ");
  const out: Section[] = [];
  const headRe = new RegExp(`\\b(${BRIEF_HEADINGS.join("|")})\\b`, "g");
  const hits: Array<{ at: number; heading: string }> = [];
  for (let m = headRe.exec(flat); m; m = headRe.exec(flat)) hits.push({ at: m.index, heading: m[1] });
  if (hits.length !== BRIEF_HEADINGS.length) throw new Error(`brief: found ${hits.length}/${BRIEF_HEADINGS.length} headings`);
  for (let i = 0; i < hits.length; i++) {
    const start = hits[i].at + hits[i].heading.length;
    const stop = i + 1 < hits.length ? hits[i + 1].at : flat.length;
    out.push({ id: `NTSB-AAB-13-02#${i + 1}`, n: i + 1, heading: hits[i].heading, text: flat.slice(start, stop).trim(), date });
  }
  return out;
}

// Location names aimed at the parser: '(BS) 664' -> 'BS 664', footnote '3 (S)-4L' -> 'S-4L'.
export function cleanLocationText(t: string): string {
  return (t ?? "")
    .replace(/\(\s*BS\s*\)\s*(\d{3,4})/g, "BS $1")
    .replace(/\b(\d{1,2})?\s*\(\s*BS\s*\)/gi, "BS")
    .replace(/\(\s*S\s*\)-\s*(\d{1,2})\s?-?([LR])\b/g, "S-$1$2");
}

// Same tokens the SDR parser reads (normalize.ts), applied to prose paragraph by paragraph.
const STR_RE = /\b(?:STR|STRINGER|S)[\s.-]*(\d{1,2})\s?-?([LR])\b/g;
const STA_RE = /\b(?:BS|B\.S\.|STA|FS|BODY\s+STATION)\s*\.?\s*(\d{3,4})[A-Z]{0,2}/g;
const RANGE_RE = /\b(?:from|between)\s+(?:body\s+station\s*)?\(?BS?\s*\.?\s*(\d{3,4})?[A-Z]{0,2}\)?\s*(?:to|and|-|through)\s*(?:body\s+station\s*)?\(?BS?\s*\.?\s*(\d{3,4})[A-Z]{0,2}?(?:\))?/i;

/** Every Location a section's text names (line + bin roll), by sentence: stations pair
 *  with the stringers of their own sentence, "from BS 360 to BS 908" is a range over the
 *  line(s) — no bins invented from its endpoints. */
export function sectionLocations(text: string, family = "737", chapter = "53"): LocNode[] {
  const nodes = new Map<string, LocNode>();
  const add = (ns: LocNode[]) => { for (const n of ns) if (!nodes.has(n.bin)) nodes.set(n.bin, n); };
  for (const sentence of cleanLocationText(text).split(/(?<=\.)\s+/)) {
    const strs = [...sentence.toUpperCase().matchAll(STR_RE)];
    const stas = [...sentence.toUpperCase().matchAll(STA_RE)].map((m) => m[1]);
    const isRange = RANGE_RE.test(sentence);
    for (const s of strs) add(locationChain({ family, chapter, stringer: s[1], side: s[2] }));
    if (!isRange) {
      for (const st of stas) {
        if (strs.length) for (const s of strs) add(locationChain({ family, chapter, stringer: s[1], side: s[2], station: st }));
        else add(locationChain({ family, chapter, station: st }));
      }
    }
  }
  return [...nodes.values()];
}

/** __main__: load the three documents, one Document each, sections with locations. */
export function sectionText(doc: DocConfig, dir: string): Section[] {
  const path = join(dir, "docs", doc.file);
  if (!existsSync(path)) throw new Error(`missing ${path} (run scripts/fetch-data.sh)`);
  const raw = readFileSync(path, "utf8");
  const sections = doc.kind === "AD" ? adSections(raw, doc.id as "AD-2011-08-51" | "AD-2015-16-08", doc.date) : briefSections(raw, doc.date);
  return sections.map((s) => ({ ...s, text: s.text.replace(/\s+/g, " ").trim() }));
}

async function main(): Promise<void> {
  const dir = dataDir();
  const db = await requireDb();
  for (const doc of DOCS) {
    const sections = sectionText(doc, dir);
    await db.query(
      `MERGE (d:Document {id:$id}) SET d.kind=$kind, d.title=$title, d.date=$date, d.url=$url`,
      { id: doc.id, kind: doc.kind, title: doc.title, date: doc.date, url: doc.url });
    if (doc.describes.ad) {
      await db.query(`MATCH (d:Document {id:$id}), (f:FixOrder {ad_no:$ad}) MERGE (d)-[:DESCRIBES]->(f)`,
        { id: doc.id, ad: doc.describes.ad });
    } else {
      await db.query(`MATCH (d:Document {id:$id}), (a:Accident {ev_id:$ev}) MERGE (d)-[:DESCRIBES]->(a)`,
        { id: doc.id, ev: doc.describes.ev });
    }
    await writeBatches(db, `UNWIND $rows AS row
      MERGE (s:Section {id: row.id})
      SET s.heading = row.heading, s.text = row.text, s.date = row.date, s.n = row.n
      WITH s, row MATCH (d:Document {id: row.doc}) MERGE (d)-[:HAS_SECTION]->(s)`,
      sections.map((s) => ({ ...s, doc: doc.id })), `${doc.id} sections`);
    const links: Array<{ sec: string; bin: string; level: string; family: string; chapter: string; stringer: string | null; side: string | null; station_bin: number | null }> = [];
    for (const s of sections) {
      for (const loc of sectionLocations(s.text)) {
        links.push({ sec: s.id, bin: loc.bin, level: loc.level, family: loc.family, chapter: loc.chapter, stringer: loc.stringer ?? null, side: loc.side ?? null, station_bin: loc.station_bin ?? null });
      }
    }
    // MERGE the named Location nodes too, so ingest:documents also works on a fresh graph
    // (ingest:ntsb/ingest:reports build the same nodes; setting the same props is idempotent)
    await writeBatches(db, `UNWIND $rows AS row
      MATCH (s:Section {id: row.sec}) MERGE (l:Location {bin: row.bin})
      SET l.level = row.level, l.family = row.family, l.chapter = row.chapter,
          l.stringer = row.stringer, l.side = row.side, l.station_bin = row.station_bin
      MERGE (s)-[:ABOUT]->(l)`, links, `${doc.id} about-locations`);
    const withLoc = new Set(links.map((l) => l.sec));
    console.log(`${doc.id}: ${sections.length} sections, ${links.length} location links (${sections.filter((s) => withLoc.has(s.id)).length} sections name a location)`);
  }
  await db.close();
}

// run when executed directly, not on import by the test
if (process.argv[1]?.endsWith("documents.ts")) await main();
