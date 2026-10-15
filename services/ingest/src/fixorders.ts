import "@blackbox/graph/src/env";
// FAA fix orders: Federal Register JSON API (public) -> FixOrder nodes.
// SUPERSEDES + TARGETS via regex ("supersedes AD YYYY-NN-NN", "fuselage station")
// plus LLM extraction on summaries for the long tail. FR API caps count at 10k.
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
