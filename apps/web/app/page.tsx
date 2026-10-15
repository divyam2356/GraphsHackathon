"use client";
import { useState } from "react";
// Chat + time-machine slider + ranked leads + approval card, one page.
// Data comes from /api/* (demo store when FalkorDB is down, real graph when up).
export default function Page() {
  const [asOf, setAsOf] = useState("2011-03-31");
  const [q, setQ] = useState("crown skin crack S-4L 737");
  const [out, setOut] = useState("");
  async function ask(path: string, body: unknown) {
    const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setOut(JSON.stringify(await r.json(), null, 2));
  }
  return (<main style={{ padding: 24, maxWidth: 900 }}>
    <h1>Black Box</h1>
    <p><i>Warning signs and leads worth review — never causes. NTSB determines causes.</i></p>
    <label>Time machine (asOf): <input type="date" value={asOf} max="2011-03-31" onChange={(e) => setAsOf(e.target.value)} /></label>
    <div style={{ marginTop: 12 }}>
      <input value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 420 }} />
      <button onClick={() => ask("/api/leads", { narrative: q, asOf })}>Rank leads (flow E)</button>
      <button onClick={() => ask("/api/investigate", { ev_id: "WPR11MA133", asOf })}>Investigate SWA 812 (flow A)</button>
      <button onClick={() => ask("/api/hotspots", { family: "737", asOf })}>Hot spots (flow B)</button>
    </div>
    <pre style={{ background: "#111", color: "#eee", padding: 12, marginTop: 12 }}>{out || "results appear here — every hop has a source"}</pre>
  </main>);
}
