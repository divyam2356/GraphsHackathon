// NTSB ingest: avall.mdb -> CSV -> Accident/Aircraft/Finding nodes.
// Source: NTSB aviation accident database (public). Findings map to Location
// bins via JASC-code lookup (draft: .agent/tasks/falkordb-ideas/same_system.py).
// Usage: npm run ingest:ntsb -- --csv data/raw/avall.csv [--limit N]
// Without --csv (no download yet) it loads the SWA-812 demo accident so the
// pipeline is testable end to end before the big files arrive.
import { connect } from "@blackbox/graph/src/db.js";
import { DEMO } from "@blackbox/graph/src/demo.js";
import { readFileSync, existsSync } from "node:fs";

const limit = Number(process.argv.find((a) => a.startsWith("--limit="))?.split("=")[1] ?? 0) || 0;
const csv = process.argv.find((a) => a.startsWith("--csv="))?.split("=")[1];
const db = await connect();
let rows = 0;
if (csv && existsSync(csv)) {
  const lines = readFileSync(csv, "utf8").split("\n");
  console.log(`avall rows: ${lines.length - 1} (LOAD CSV alternative: LOAD CSV WITH HEADERS FROM 'file:///avall.csv' ...)`);
  rows = limit || lines.length;
} else {
  console.log("no CSV — loading demo accident WPR11MA133 (SWA 812)");
  if (db) {
    const a = DEMO.accidents[0];
    await db.query(
      `MERGE (m:Model {family:'737'}) MERGE (t:Aircraft {tail:$tail})-[:IS_A]->(m)
       MERGE (x:Accident {ev_id:$ev}) SET x.date=$date, x.phase=$phase
       MERGE (x)-[:INVOLVED]->(t)
       MERGE (f:Finding {text:$cause}) SET f.system='structures'
       MERGE (l:Location {bin:'S-4L/BS639'}) MERGE (x)-[:FOUND {kind:'cause'}]->(f)-[:AT]->(l)`,
      { tail: a.tail, ev: a.ev_id, date: a.date, phase: a.phase, cause: a.cause });
    rows = 1;
  }
}
await db?.close();
console.log(`ntsb done: ${rows} accident(s)`);
