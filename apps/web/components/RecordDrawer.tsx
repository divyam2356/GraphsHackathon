"use client";
// Side drawer with the source records: one graph node's properties (the original
// report or NTSB text quoted in full), or every report behind one map cell.
import { useEffect } from "react";
import { useView } from "../lib/useView";
import { BIN, fmtDate, parseKey, stringerName } from "../lib/fuselage";
import type { GraphNode } from "./EvidenceGraph";

export type Open = { kind: "node"; node: GraphNode; asOf?: string } | { kind: "bin"; key: string; args: Record<string, unknown> } | { kind: "missing"; id: string };
interface BinReport { id: string; date: string; tail: string; variant: string; part: string; condition: string; text: string }
interface CiteRow { doc: string; kind: string; title: string; url: string; id: string; heading: string; date: string; text: string }

const TITLES: Record<string, string> = { Accident: "NTSB event", Report: "Maintenance report", Aircraft: "Aircraft", Location: "Location", Finding: "NTSB finding", FixOrder: "Fix order", FailureMode: "Failure mode", Document: "Document", Section: "Document section" };
const LONG = new Set(["text", "cause_text", "summary", "narrative"]);
const LONG_LABEL: Record<string, string> = { cause_text: "Probable cause, as the NTSB wrote it", text: "As written in the record" };

export function RecordDrawer({ open, onClose }: { open: Open | null; onClose: () => void }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <aside className={`drawer${open ? " open" : ""}`} aria-hidden={!open} aria-label="Source record">
      <button className="drawer-close" onClick={onClose} aria-label="Close">Close</button>
      {open?.kind === "node" && <NodeView node={open.node} asOf={open.asOf} />}
      {open?.kind === "bin" && <BinView binKey={open.key} args={open.args} />}
      {open?.kind === "missing" && <p className="drawer-empty">{open.id} is not in the evidence graph yet. Run the investigation to bring it in.</p>}
    </aside>
  );
}

function NodeView({ node, asOf }: { node: GraphNode; asOf?: string }) {
  const p = node.properties;
  const label = node.labels[0];
  const long = Object.entries(p).filter(([k, v]) => LONG.has(k) && typeof v === "string" && v);
  const short = Object.entries(p).filter(([k, v]) => !LONG.has(k) && v !== null && v !== "" && k !== "embedding");
  return (
    <div>
      <p className="drawer-kind">{TITLES[label] ?? label}</p>
      <h2 className="drawer-title">{String(p.id ?? p.ev_id ?? p.tail ?? p.bin ?? p.ad_no ?? node.id)}</h2>
      {long.map(([k, v]) => <div key={k}><p className="source-label">{LONG_LABEL[k] ?? k}</p><blockquote className="source">{String(v)}</blockquote></div>)}
      <dl className="props">{short.map(([k, v]) => <div key={k}><dt>{k.replace(/_/g, " ")}</dt><dd>{String(v)}</dd></div>)}</dl>
      {label === "Location" && Boolean(p.bin) && <Documents bin={String(p.bin)} asOf={asOf} />}
    </div>
  );
}

// Sections of the real documents that name this location (cite_documents), oldest first.
// The fetched files could be huge (NTSB dumps the whole brief); keep each section short.
function Documents({ bin, asOf }: { bin: string; asOf?: string }) {
  const v = useView<CiteRow[]>("cite_documents", { bin, asOf: asOf ?? "9999-12-31" });
  const rows = v.rows ?? [];
  if (v.loading) return <p className="drawer-meta">Documents ...</p>;
  if (v.error) return null;
  return (
    <div>
      <p className="source-label">Documents about this location</p>
      <p className="drawer-meta">{rows.length ? `${rows.length} section${rows.length === 1 ? "" : "s"}, eldest dated ${fmtDate(rows[0].date, true)}${asOf ? "" : ", all dates"}` : "none in the loaded documents"}</p>
      {rows.map((r) => (
        <div key={r.id} className="doc-section">
          <p className="report-head"><b>{fmtDate(r.date, true)}</b><span>{r.kind}</span></p>
          <p className="doc-head">{r.heading} — <a href={r.url} target="_blank" rel="noreferrer">{r.doc}</a></p>
          <blockquote className="source">{r.text}{r.text.length >= 600 ? " …" : ""}</blockquote>
        </div>
      ))}
    </div>
  );
}

function BinView({ binKey, args }: { binKey: string; args: Record<string, unknown> }) {
  const k = parseKey(binKey);
  const v = useView<BinReport[]>("bin_reports", { ...args, bin: binKey });
  const rows = v.rows ?? [];
  return (
    <div>
      <p className="drawer-kind">Reports at one location, 12 months to {fmtDate(String(args.asOf), true)}</p>
      <h2 className="drawer-title">{k ? `${stringerName(k.side, k.n)}, BS ${k.station}–${(k.station ?? 0) + BIN - 1}` : binKey}</h2>
      <p className="drawer-meta">{v.loading ? "Loading" : `${rows.length} reports on ${new Set(rows.map((r) => r.tail)).size} aircraft, bin_reports ${v.ms} ms`}</p>
      <Documents bin={binKey} asOf={String(args.asOf)} />
      <ol className="reports">
        {rows.map((r) => (
          <li key={r.id}>
            <div className="report-head"><b>{r.id}</b><span>{fmtDate(r.date, true)}</span><span>{r.tail}, {r.variant}</span></div>
            <blockquote className="source">{r.text}</blockquote>
          </li>
        ))}
      </ol>
    </div>
  );
}
