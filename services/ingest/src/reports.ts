import "@blackbox/graph/src/env";
// FAA Service Difficulty Reports (public yearly CSVs) -> Report nodes on Aircraft
// and Location. Location comes from the structured station/stringer/wing fields,
// with a regex fallback on the text ("STR 4L", "BS 639"). Run after ingest:ntsb.
// Scope (the full 1.19M rows don't fit a laptop graph):
//   fleet set:  --families=737 --chapters=52,53,54,55,56,57   ("all" for either)
//   linked set: every report on an aircraft in an NTSB event (--linked=0 to skip)
// Usage: npm run ingest:reports -- [--data=DIR] [--families=737] [--chapters=...] [--from=2008-01-01] [--to=2099-12-31]
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { aircraftId, CHAPTER_NAMES, familyOf, isoDate, locationChain, serialOf, tailOf, variantOf, type LocNode } from "./normalize";
import { csvRows, dataDir, flag, requireDb, writeBatches } from "./load";
import { writeLocations } from "./locations";
import { ensureIndexes } from "@blackbox/graph/src/ensureIndexes";

const list = (s: string) => (s === "all" ? null : new Set(s.split(",").map((x) => x.trim())));
const families = list(flag("families", "737"));
const chapters = list(flag("chapters", "52,53,54,55,56,57"));
const from = flag("from", "2008-01-01"), to = flag("to", "2099-12-31");
const linked = flag("linked", "1") !== "0";
const dir = join(dataDir(), "sdr");

const db = await requireDb();
await ensureIndexes(db);

// Aircraft already in the graph from NTSB events, by tail (serial disambiguates reused tails)
const known = new Map<string, Array<{ id: string; serial: string }>>();
for (const r of (await db.roQuery(`MATCH (:Accident)-[:INVOLVED]->(a:Aircraft) RETURN DISTINCT a.tail AS tail, a.serial AS serial, a.id AS id`)) as Array<{ tail: string; serial: string; id: string }>) {
  known.set(r.tail, [...(known.get(r.tail) ?? []), { id: r.id, serial: r.serial }]);
}

const aircraft = new Map<string, Record<string, unknown>>();
const reports: Record<string, unknown>[] = [];
const locs = new Map<string, LocNode>();
let seen = 0, noTail = 0;
const files = readdirSync(dir).filter((f) => /^SDR-\d{4}\.csv$/.test(f)).sort();
for (const file of files) {
  for await (const r of csvRows(join(dir, file))) {
    seen++;
    const date = isoDate(r.DifficultyDate);
    if (!date || date < from || date > to) continue;
    const family = familyOf(r.AircraftModel);
    const chapter = (r.JASCCode ?? "").trim().slice(0, 2);
    if (!family || !/^\d{2}$/.test(chapter)) continue;
    const tail = tailOf(r.RegistryNNumber), serial = serialOf(r.AircraftSerialNumber);
    // linked: same tail as an NTSB aircraft, and the serial agrees when both are known
    const match = linked ? known.get(tail)?.find((k) => !serial || !k.serial || k.serial === serial) : undefined;
    const inFleet = (!families || families.has(family)) && (!chapters || chapters.has(chapter));
    if (!inFleet && !match) continue;
    if (!tail) { noTail++; continue; }
    const id = match?.id ?? aircraftId(tail, serial);
    if (!aircraft.has(id)) aircraft.set(id, { id, tail, serial, make: r.AircraftMake, model: r.AircraftModel, variant: variantOf(r.AircraftModel), family });
    const chain = locationChain({
      family, chapter, station: r.FuselageStationFrom, stringer: r.StringerFrom, side: r.StringerFromSide,
      wingStation: r.WingStationFrom, wingSide: r.WingStationFromSide, text: r.Discrepancy,
    });
    for (const l of chain) locs.set(l.bin, l);
    reports.push({
      id: r.OperatorControlNumber, date, text: (r.Discrepancy ?? "").trim().slice(0, 800), jasc: r.JASCCode,
      part: r.PartName || null, condition: r.PartCondition || null, operator: r.OperatorDesignator || null,
      ac: id, bin: chain[0].bin,
    });
  }
  console.log(`  ${file}: kept ${reports.length} of ${seen} rows so far`);
}

const chs = new Set([...locs.values()].map((l) => l.chapter));
await writeBatches(db, `UNWIND $rows AS row MERGE (s:System {chapter: row.chapter}) SET s.name = coalesce(s.name, row.name)`,
  [...chs].map((chapter) => ({ chapter, name: CHAPTER_NAMES[chapter] ?? `ATA ${chapter}` })), "systems");
await writeLocations(db, [...locs.values()]);
await writeBatches(db, `UNWIND $rows AS row
  MERGE (m:Model {family: row.family})
  MERGE (a:Aircraft {id: row.id}) ON CREATE SET a += row
  MERGE (a)-[:IS_A]->(m)`, [...aircraft.values()], "aircraft");
await writeBatches(db, `UNWIND $rows AS row
  MATCH (a:Aircraft {id: row.ac}), (l:Location {bin: row.bin})
  MERGE (r:Report {id: row.id})
  SET r.date = row.date, r.text = row.text, r.jasc = row.jasc, r.part = row.part,
      r.condition = row.condition, r.operator = row.operator
  MERGE (r)-[:ON]->(a)
  MERGE (r)-[:AT]->(l)`, reports, "reports", 2000);
await db.close();
console.log(`reports done: ${reports.length} reports (of ${seen} rows; ${noTail} in scope without a tail skipped), ${aircraft.size} aircraft, ${locs.size} locations`);
