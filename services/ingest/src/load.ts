// Shared helpers for the real-data loaders: CSV streaming, data dir, batched UNWIND writes.
import { createReadStream, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse } from "csv-parse";
import { connect, type Db } from "@blackbox/graph/src/db";

/** CLI flag `--name=value`, else the default. */
export function flag(name: string, def: string): string {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3) ?? def;
}

/** Raw data folder (NTSB CSV dump + FAA SDR-YYYY.csv). See scripts/fetch-data.sh. */
export function dataDir(): string {
  const d = resolve(flag("data", process.env.DATA_DIR ?? join(import.meta.dirname, "../../../data/raw")));
  if (!existsSync(d)) throw new Error(`data dir not found: ${d} (run scripts/fetch-data.sh or pass --data=DIR)`);
  return d;
}

/** Stream a CSV with a header row as objects. */
export async function* csvRows(path: string): AsyncGenerator<Record<string, string>> {
  const parser = createReadStream(path).pipe(parse({ columns: true, relax_quotes: true, relax_column_count: true, skip_records_with_error: true }));
  for await (const r of parser) yield r as Record<string, string>;
}

/** Real loaders need the database; unlike the demo paths they fail loudly without it. */
export async function requireDb(): Promise<Db> {
  const db = await connect();
  if (!db) {
    console.error(`FalkorDB not reachable at ${process.env.FALKORDB_URL ?? "redis://localhost:6379"} (docker compose up -d)`);
    process.exit(1);
  }
  return db;
}

// The falkordb client inlines params as Cypher literals; undefined/NaN would break the query.
function clean(row: unknown): unknown {
  if (!row || typeof row !== "object") return row;
  return Object.fromEntries(Object.entries(row).map(([k, v]) => [k, v === undefined || Number.isNaN(v) ? null : v]));
}

/** Run `UNWIND $rows AS row ...` in batches; logs progress every ~10 batches. */
export async function writeBatches(db: Db, cypher: string, rows: unknown[], label: string, size = 1000): Promise<void> {
  for (let i = 0; i < rows.length; i += size) {
    await db.query(cypher, { rows: rows.slice(i, i + size).map(clean) });
    if ((i / size) % 10 === 9 || i + size >= rows.length) console.log(`  ${label}: ${Math.min(i + size, rows.length)}/${rows.length}`);
  }
}
