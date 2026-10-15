// FalkorDB client wrapper (official `falkordb` npm package / falkordb-ts).
// Docs: docs.falkordb.com/getting-started — FalkorDB.connect({host, port}),
// client.selectGraph(name), graph.query() / graph.roQuery(), result.data.
// Returns null when unreachable -> MCP server falls back to the demo store,
// so agent + UI + video work on a fresh laptop. Real DB wins when up.
import { GRAPH_NAME } from "./index.js";

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
      query: async (c, p) => (await g.query(c, { params: p ?? {} })).data,
      roQuery: async (c, p) => (await g.roQuery(c, { params: p ?? {} })).data,
      close: async () => { await client.close?.(); },
    };
  } catch {
    return null;
  }
}
