// Index set for the blackbox graph. Idempotent: existing indexes are skipped.
// Loaders call this first so MERGE/MATCH on keys use exact-match indexes.
import type { Db } from "./db";

export const INDEXES = [
  // No range index on the ISO date strings: on FalkorDB 4.14.6 an index scan answers
  // `d < 'X'` with every row (`>=` is right). Repro: 1,000 (:R {d}) nodes 2008-2024 +
  // CREATE INDEX FOR (r:R) ON (r.d): `WHERE r.d < '2011-04-01'` -> 1000, correct 198.
  "CREATE INDEX FOR (a:Accident) ON (a.ev_id)",
  "CREATE INDEX FOR (t:Aircraft) ON (t.id)",
  "CREATE INDEX FOR (t:Aircraft) ON (t.tail)",
  "CREATE INDEX FOR (m:Model) ON (m.family)",
  "CREATE INDEX FOR (s:System) ON (s.chapter)",
  "CREATE INDEX FOR (f:Finding) ON (f.id)",
  "CREATE INDEX FOR (r:Report) ON (r.id)",
  "CREATE INDEX FOR (f:FixOrder) ON (f.ad_no)",
  "CREATE INDEX FOR (l:Location) ON (l.bin)",
  "CREATE INDEX FOR (m:FailureMode) ON (m.id)",
  "CALL db.idx.fulltext.createNodeIndex('Report', 'text')",
  "CALL db.idx.fulltext.createNodeIndex('Finding', 'text')",
  "CALL db.idx.fulltext.createNodeIndex('Accident', 'cause_text')",
  "CREATE VECTOR INDEX FOR (r:Report) ON (r.embedding) OPTIONS {dimension:384, similarityFunction:'cosine'}",
];

export async function ensureIndexes(db: Db, log = false): Promise<void> {
  for (const q of INDEXES) {
    try { await db.query(q); if (log) console.log("ok:", q.slice(0, 70)); }
    catch { if (log) console.log("exists/skip:", q.slice(0, 70)); }
  }
}
