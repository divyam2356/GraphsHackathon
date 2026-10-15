import "@blackbox/graph/src/env";
// Flow-B hotspot job (runnable): temp per-window :CO_Q edges -> algo.labelPropagation
// -> (:HotSpot)-[:AT]->(:Location). Algorithms filter by label+rel-type only,
// not by date — hence temp edges per window, created, run, deleted.
// Usage: node node_modules/tsx/dist/cli.mjs packages/graph/src/hotspotJob.ts --family 737 --from 2010-01-01 --to 2011-04-01
import { connect } from "./db";

const arg = (k: string, d: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1] ?? d;
const family = arg("family", "737"), from = arg("from", "2010-01-01"), to = arg("to", "2011-04-01");
const window = `${from}_${to}`;

const db = await connect();
if (!db) { console.log("no FalkorDB — cannot run hotspot job offline"); process.exit(0); }

// 1. temp co-occurrence edges: reports in window, same bin, distinct tails
await db.query(
  `MATCH (r1:Report)-[:ON]->(a1:Aircraft)-[:IS_A]->(:Model {family:$fam}), (r1)-[:AT]->(l:Location),
         (r2:Report)-[:ON]->(a2:Aircraft)-[:IS_A]->(:Model {family:$fam}), (r2)-[:AT]->(l)
   WHERE $from <= r1.date < $to AND $from <= r2.date < $to AND r1.id < r2.id AND a1.tail <> a2.tail
   MERGE (r1)-[:CO_Q]->(r2)`,
  { fam: family, from, to });

// 2. community detection over the temp edges (verified: CALL algo.labelPropagation({...}) YIELD node, communityId)
const comms = await db.query(
  `CALL algo.labelPropagation({nodeLabels:['Report'], relationshipTypes:['CO_Q'], maxIterations:10})
   YIELD node, communityId RETURN node.id AS id, communityId`,
) as Array<{ id: string; communityId: number }>;

// 3. aggregate per community -> HotSpot nodes with distinct-aircraft counts
const byCom = new Map<number, string[]>();
for (const c of comms) {
  if (!byCom.has(c.communityId)) byCom.set(c.communityId, []);
  byCom.get(c.communityId)!.push(c.id);
}
let written = 0;
for (const [cid, ids] of byCom) {
  if (ids.length < 2) continue;
  const rows = (await db.query(
    `UNWIND $ids AS rid MATCH (r:Report {id:rid})-[:ON]->(a:Aircraft), (r)-[:AT]->(l:Location)
     RETURN l.bin AS bin, count(DISTINCT a.tail) AS ac, count(*) AS rc ORDER BY ac DESC LIMIT 1`,
    { ids })) as Array<{ bin: string; ac: number; rc: number }>;
  const top = rows[0];
  if (!top || top.ac < 2) continue;
  await db.query(
    `MATCH (l:Location {bin:$bin})
     CREATE (h:HotSpot {window:$window, community:$cid, aircraft_count:$ac, report_count:$rc, date:date($to)})-[:AT]->(l)`,
    { bin: top.bin, window, cid, ac: top.ac, rc: top.rc, to });
  written++;
}

// 4. cleanup temp edges
await db.query(`MATCH ()-[c:CO_Q]->() DELETE c`);
await db.close();
console.log(`hotspots done: ${comms.length} reports clustered, ${written} HotSpot node(s) for ${family} ${window}`);
