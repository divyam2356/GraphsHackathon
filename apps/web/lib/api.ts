// Browser helpers for the API routes. view() runs one read-only graph query
// (memoised per name + args); streamAgent() reads the agent's NDJSON step stream.
import type { Step } from "@blackbox/agent/src/agent";
export type { Step };

export interface ViewResult<T> { rows: T; ms: number; cypher: string }
const memo = new Map<string, Promise<ViewResult<unknown>>>();

export function view<T>(name: string, args: Record<string, unknown> = {}, fresh = false): Promise<ViewResult<T>> {
  const key = name + JSON.stringify(args);
  if (fresh || !memo.has(key)) {
    const p = fetch("/api/view", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, args }) })
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? `${name} failed (${r.status})`); return j; });
    memo.set(key, p);
    p.catch(() => memo.delete(key));
  }
  return memo.get(key) as Promise<ViewResult<T>>;
}

export async function streamAgent(body: { mode: "agent" | "scripted"; question?: string; evId?: string; asOf: string; draft?: boolean }, onStep: (s: Step) => void, signal?: AbortSignal) {
  const r = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body), signal });
  if (!r.ok || !r.body) throw new Error(`agent route failed (${r.status})`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (line.trim()) onStep(JSON.parse(line) as Step);
    }
  }
}
