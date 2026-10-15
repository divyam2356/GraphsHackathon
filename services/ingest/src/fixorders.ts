import "@blackbox/graph/src/env";
// FAA fix orders -> FixOrder nodes. Today: the two S-4L airworthiness directives from the
// fixture (AD 2011-08-51, superseded by AD 2015-16-08; checked against the Federal Register
// text). Not built yet: bulk load from the Federal Register JSON API (caps at 10k results).
// parseSupersedes is the regex that bulk load would use for SUPERSEDES edges.
// Usage: npm run ingest:fixorders
import { connect } from "@blackbox/graph/src/db";
import { DEMO } from "@blackbox/graph/src/demo";

export function parseSupersedes(summary: string): string[] {
  return [...summary.matchAll(/[Ss]upersedes\s+(AD\s?\d{4}-\d{2}-\d{2})/g)].map((m) => m[1].replace(/\s/g, "-").toUpperCase().replace(/^AD-?/, "AD-"));
}

const db = await connect();
if (db) {
  for (const f of DEMO.fixOrders) {
    await db.query(
      `MERGE (x:FixOrder {ad_no:$ad}) SET x.date=$date
       MERGE (m:Model {family:$fam}) MERGE (x)-[:APPLIES_TO]->(m)
       MERGE (l:Location {bin:$bin}) MERGE (x)-[:TARGETS]->(l)
       FOREACH (o IN $replaces | MERGE (p:FixOrder {ad_no:o}) MERGE (x)-[:SUPERSEDES]->(p))`,
      { ad: f.ad, date: f.date, fam: f.family, bin: f.bin, replaces: f.replaces });
  }
}
await db?.close();
console.log(`fixorders done: ${DEMO.fixOrders.length} demo order(s); regex unit:`, parseSupersedes("This AD supersedes AD 2011-08-51"));
