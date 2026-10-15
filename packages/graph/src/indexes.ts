import "@blackbox/graph/src/env";
// Creates the index set (ensureIndexes.ts). Idempotent — safe to re-run.
// Usage: npm run graph:indexes
import { connect } from "./db";
import { ensureIndexes } from "./ensureIndexes";
const db = await connect();
if (!db) {
  console.log("no FalkorDB — demo mode, nothing to index");
  process.exit(0);
}
await ensureIndexes(db, true);
await db.close();
