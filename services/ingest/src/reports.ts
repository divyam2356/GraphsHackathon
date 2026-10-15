// FAA reports ingest: yearly SDR CSVs (faa.gov, public) -> Report nodes.
// Location: structured station+stringer fields first, regex fallback on text
// ("BS 727A, STR 4L"). Embeddings: local bge-small (384d) on structures+engines
// only by default — full 1.17M ≈ 1.8GB vectors (see embeddings.ts).
// Usage: npm run ingest:reports -- --csv data/raw/sdr2024.csv [--systems structures,engines]
import { connect } from "@blackbox/graph/src/db.js";
import { DEMO } from "@blackbox/graph/src/demo.js";
import { mockEmbed } from "./embeddings.js";

const db = await connect();
if (db) {
  for (const r of DEMO.priorReports) {
    const vec = mockEmbed(r.text);
    await db.query(
      `MERGE (m:Model {family:'737'}) MERGE (t:Aircraft {tail:$tail})-[:IS_A]->(m)
       MERGE (p:Report {id:$id}) SET p.text=$text, p.date=$date, p.embedding=vecf32($vec)
       MERGE (l:Location {bin:$bin}) MERGE (p)-[:ON]->(t) MERGE (p)-[:AT]->(l)`,
      { ...r, vec });
  }
}
await db?.close();
console.log(`reports done: ${DEMO.priorReports.length} demo report(s) + fleet note recorded`);
