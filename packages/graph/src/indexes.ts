import "@blackbox/graph/src/env";
// Creates indexes from schema.cypher (idempotent — safe to re-run).
import { connect } from "./db";
const db = await connect();
if (!db) {
  console.log("no FalkorDB — demo mode, nothing to index");
  process.exit(0);
}
const gdb: NonNullable<typeof db> = db;
for (const q of [
  "CREATE INDEX FOR (a:Accident) ON (a.ev_id)",
  "CREATE INDEX FOR (t:Aircraft) ON (t.tail)",
  "CREATE INDEX FOR (f:FixOrder) ON (f.ad_no)",
  "CREATE INDEX FOR (l:Location) ON (l.bin)",
  "CREATE INDEX FOR (m:FailureMode) ON (m.id)",
  "CALL db.idx.fulltext.createNodeIndex('Report', 'text')",
  "CALL db.idx.fulltext.createNodeIndex('Finding', 'text')",
  "CREATE VECTOR INDEX FOR (r:Report) ON (r.embedding) OPTIONS {dimension:384, similarityFunction:'cosine'}",
]) {
  try { await gdb.query(q); console.log("ok:", q.slice(0, 60)); }
  catch { console.log("exists/skip:", q.slice(0, 60)); }
}
await gdb.close();
