"use client";
import { useEffect, useState } from "react";
import { view } from "./api";
// React hook over view(): keeps the last rows while the next args load (no flicker
// while the time slider moves). Pass null args to skip.
export function useView<T>(name: string, args: Record<string, unknown> | null) {
  const [s, set] = useState<{ rows?: T; ms?: number; cypher?: string; error?: string; loading: boolean }>({ loading: Boolean(args) });
  const key = args ? JSON.stringify(args) : null;
  useEffect(() => {
    if (!key) return;
    let live = true;
    set((p) => ({ ...p, loading: true }));
    view<T>(name, JSON.parse(key)).then(
      (r) => live && set({ rows: r.rows, ms: r.ms, cypher: r.cypher, loading: false }),
      (e: Error) => live && set((p) => ({ ...p, error: e.message, loading: false })),
    );
    return () => { live = false; };
  }, [name, key]);
  return s;
}
