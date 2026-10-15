// Embeddings: deterministic 384d mock (hash-based) for offline/dev/demo.
// Swap for real bge-small-en-v1.5 on the RX 9060 XT by setting EMBED_REAL=1
// (any sentence-transformers server on localhost:8000/embed). Cosine everywhere.
import { createHash } from "node:crypto";
export function mockEmbed(text: string, dim = 384): number[] {
  const v = new Array<number>(dim);
  for (let i = 0; i < dim; i++) {
    const h = createHash("sha256").update(`${i}:${text}`).digest();
    v[i] = (h.readInt16BE(0) / 32768 + h.readInt16BE(2) / 32768 / 4) / 1.25;
  }
  const n = Math.hypot(...v) || 1;
  return v.map((x) => x / n);
}
export function cosine(a: number[], b: number[]): number {
  return a.reduce((s, x, i) => s + x * b[i], 0);
}
