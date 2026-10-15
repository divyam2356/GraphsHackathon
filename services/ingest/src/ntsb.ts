import "@blackbox/graph/src/env";
// NTSB ingest: CSV dump of avall.mdb (scripts/dump_ntsb.py) -> Accident, Aircraft,
// Finding, System, Location nodes. Scope is mechanical only (framing rule): events
// with a cause/factor finding in aircraft systems, structures, propeller/rotor or
// power plant. For those NTSB `section_no` IS the ATA/JASC chapter (53 = fuselage),
// the same code FAA reports use, so both sources meet on (:System {chapter}).
// Usage: npm run ingest:ntsb -- [--data=DIR] [--from=2008-01-01]
import { join } from "node:path";
import { aircraftId, familyOf, isoDate, locationChain, serialOf, tailOf, variantOf, type LocNode } from "./normalize";
import { csvRows, dataDir, flag, requireDb, writeBatches } from "./load";
import { writeLocations } from "./locations";
import { ensureIndexes } from "@blackbox/graph/src/ensureIndexes";

const MECH_SUBCATS = new Set(["02", "03", "04", "05"]); // systems, structures, prop/rotor, power plant
const STRUCT_CHAPTERS = new Set(["52", "53", "54", "55", "56", "57"]);
const from = flag("from", "2008-01-01"); // FAA reports start in 2008
const dir = join(dataDir(), "ntsb");

// 1. Mechanical findings, keyed by event + aircraft
type F = { id: string; ev: string; text: string; code: string; cf: string; chapter: string; system: string };
const findings = new Map<string, F[]>();
for await (const r of csvRows(join(dir, "Findings.csv"))) {
  if (r.category_no !== "01" || !MECH_SUBCATS.has(r.subcategory_no)) continue;
  if (r.Cause_Factor !== "C" && r.Cause_Factor !== "F") continue;
  if (!/^\d{2}$/.test(r.section_no) || r.section_no === "00") continue;
  const key = `${r.ev_id}|${r.Aircraft_Key}`;
  findings.set(key, [...(findings.get(key) ?? []), {
    id: `${r.ev_id}/${r.Aircraft_Key}/${r.finding_no}`, ev: r.ev_id,
    text: r.finding_description.replace(/ - [CF]$/, ""), code: r.finding_code, cf: r.Cause_Factor,
    chapter: r.section_no, system: r.finding_description.split("-")[2] ?? "",
  }]);
}
const evIds = new Set([...findings.values()].flat().map((f) => f.ev));

// 2. Events in scope
const events = new Map<string, Record<string, unknown>>();
for await (const r of csvRows(join(dir, "events.csv"))) {
  const date = isoDate(r.ev_date);
  if (!evIds.has(r.ev_id) || !date || date < from) continue;
  events.set(r.ev_id, {
    ev_id: r.ev_id, ntsb_no: r.ntsb_no, date, type: r.ev_type, city: r.ev_city, state: r.ev_state,
    country: r.ev_country, injury: r.ev_highest_injury, fatalities: Number(r.inj_tot_f) || 0,
  });
}

// 3. Probable-cause text per event (full-text search + structural location hints like "S-4L")
const cause = new Map<string, string>();
for await (const r of csvRows(join(dir, "narratives.csv"))) {
  if (events.has(r.ev_id) && r.narr_cause) cause.set(r.ev_id, ((cause.get(r.ev_id) ?? "") + " " + r.narr_cause.trim()).trim().slice(0, 1500));
}

// 4. Aircraft rows -> Aircraft, INVOLVED, Findings with Locations
const aircraft = new Map<string, Record<string, unknown>>();
const involved: Record<string, unknown>[] = [];
const findingRows: Record<string, unknown>[] = [];
const locs = new Map<string, LocNode>();
const systems = new Map<string, string>();
for await (const r of csvRows(join(dir, "aircraft.csv"))) {
  const fs = findings.get(`${r.ev_id}|${r.Aircraft_Key}`);
  const tail = tailOf(r.regis_no);
  const family = familyOf(r.acft_model);
  if (!fs || !events.has(r.ev_id) || !tail || !family) continue;
  const serial = serialOf(r.acft_serial_no);
  const id = aircraftId(tail, serial);
  aircraft.set(id, {
    id, tail, serial, make: r.acft_make, model: r.acft_model,
    variant: variantOf(r.acft_model, r.acft_series), family, operator: r.oper_name || null,
  });
  involved.push({ ev: r.ev_id, ac: id, far_part: r.far_part, damage: r.damage });
  for (const f of fs) {
    const hint = STRUCT_CHAPTERS.has(f.chapter) ? cause.get(f.ev) : undefined;
    const chain = locationChain({ family, chapter: f.chapter, text: hint });
    for (const l of chain) locs.set(l.bin, l);
    systems.set(f.chapter, f.system);
    findingRows.push({ id: f.id, ev: f.ev, text: f.text, code: f.code, cf: f.cf, chapter: f.chapter, kind: f.cf === "C" ? "cause" : "factor", bin: chain[0].bin });
  }
}

const db = await requireDb();
await ensureIndexes(db);
await writeBatches(db, `UNWIND $rows AS row MERGE (s:System {chapter: row.chapter}) SET s.name = row.name`,
  [...systems].map(([chapter, name]) => ({ chapter, name })), "systems");
await writeLocations(db, [...locs.values()]);
await writeBatches(db, `UNWIND $rows AS row
  MERGE (m:Model {family: row.family})
  MERGE (a:Aircraft {id: row.id}) SET a += row
  MERGE (a)-[:IS_A]->(m)`, [...aircraft.values()], "aircraft");
await writeBatches(db, `UNWIND $rows AS row
  MERGE (x:Accident {ev_id: row.ev_id}) SET x += row`,
  [...events.values()].map((e) => ({ ...e, cause_text: cause.get(e.ev_id as string) ?? "" })), "accidents");
await writeBatches(db, `UNWIND $rows AS row
  MATCH (x:Accident {ev_id: row.ev}), (a:Aircraft {id: row.ac})
  MERGE (x)-[i:INVOLVED]->(a) SET i.far_part = row.far_part, i.damage = row.damage`, involved, "involved");
await writeBatches(db, `UNWIND $rows AS row
  MATCH (x:Accident {ev_id: row.ev}), (s:System {chapter: row.chapter}), (l:Location {bin: row.bin})
  MERGE (f:Finding {id: row.id})
  SET f.text = row.text, f.code = row.code, f.cause_factor = row.cf, f.chapter = row.chapter
  MERGE (x)-[fo:FOUND]->(f) SET fo.kind = row.kind
  MERGE (f)-[:IN_SYSTEM]->(s)
  MERGE (f)-[:AT]->(l)`, findingRows, "findings");
await db.close();
console.log(`ntsb done: ${events.size} mechanical events since ${from}, ${aircraft.size} aircraft, ${findingRows.length} findings, ${locs.size} locations`);
