// FalkorDB client wrapper (official `falkordb` npm package / falkordb-ts).
// Docs: docs.falkordb.com/getting-started — FalkorDB.connect({host, port}),
// client.selectGraph(name), graph.query() / graph.roQuery(), result.data.
// connect() returns null when FalkorDB is unreachable; callers fail loudly (run.ts).
import "./env"; // the repo-root .env (FALKORDB_URL, FALKORDB_GRAPH) for every caller, the web routes included
import { GRAPH_NAME } from "./index";

export interface Db {
  query(cypher: string, params?: Record<string, unknown>): Promise<unknown[]>;
  roQuery(cypher: string, params?: Record<string, unknown>): Promise<unknown[]>;
  close(): Promise<void>;
}

function parseUrl(url: string): { host: string; port: number; password?: string } {
  try {
    const u = new URL(url);
    return {
      host: u.hostname || "localhost",
      port: Number(u.port) || 6379,
      password: u.password ? decodeURIComponent(u.password) : undefined,
    };
  } catch {
    return { host: "localhost", port: 6379 };
  }
}

// FalkorDB rejects a query whose $param is absent ("Missing parameters"). Optional
// tool args arrive absent, so every $name the query uses defaults to null and the
// Cypher handles it (`$bin IS NULL OR ...`).
export function withNulls(cypher: string, params?: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const m of cypher.matchAll(/\$([A-Za-z_]\w*)/g)) out[m[1]] = null;
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined) out[k] = v;
  return out;
}

export async function connect(url = process.env.FALKORDB_URL ?? "redis://localhost:6379"): Promise<Db | null> {
  try {
    const mod = (await import("falkordb").catch(() => null)) as unknown as {
      FalkorDB?: { connect(o: unknown): Promise<{ selectGraph(n: string): unknown; close?(): Promise<void> }> };
    } | null;
    if (!mod?.FalkorDB) return null;
    const { host, port, password } = parseUrl(url);
    const client = await mod.FalkorDB.connect({ host, port, password });
    const g = client.selectGraph(GRAPH_NAME) as {
      query(c: string, o?: unknown): Promise<{ data: unknown[] }>;
      roQuery(c: string, o?: unknown): Promise<{ data: unknown[] }>;
    };
    return {
      query: async (c, p) => (await g.query(c, { params: withNulls(c, p) })).data ?? [],
      roQuery: async (c, p) => (await g.roQuery(c, { params: withNulls(c, p) })).data ?? [],
      close: async () => { await client.close?.(); },
    };
  } catch {
    return null;
  }
}
