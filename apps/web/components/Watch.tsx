"use client";
// The watcher -> investigator hand-off on the Board. The watcher's alerts (its raise_alert
// results) can each be handed to the investigator; the investigator's draft work order then
// waits for a person to dispatch it, or the alert is dismissed. Decisions go through
// /api/decide, which the agent cannot reach.
import { useState } from "react";
import type { Step } from "../lib/api";
import { fmtDate } from "../lib/fuselage";
import { TERMS } from "../lib/glossary";
import { Term } from "./Tip";

interface AlertRow { id: string; bin: string; asOf: string; status: string; aircraft: number }
interface OrderRow { id: string; status: string; team: string; task: string; aircraft: number }
const short = (bin: string) => bin.split("/")[2]?.replace(/^S(\d+)([LR])$/, "S-$1$2") ?? bin;
/** Result rows of every call to one tool in a run. */
const rowsOf = <T,>(steps: Step[], name: string): T[] =>
  steps.flatMap((s) => (s.type === "tool_result" && s.name === name && Array.isArray(s.preview) ? (s.preview as T[]) : []));

/** The button that starts the watcher, with one line on what it does. */
export function WatchButton({ asOf, busy, onWatch }: { asOf: string; busy: boolean; onWatch: () => void }) {
  return (
    <div className="watch-row">
      <button className="go" onClick={onWatch} disabled={busy}>{busy ? "Working" : "Watch the fleet"}</button>
      <p className="caption">The watcher flags the three <Term tip={TERMS.line}>stringer lines</Term> where skin-crack reports rose fastest in the 12 months before {fmtDate(asOf)}, and saves an <Term tip={TERMS.alert}>alert</Term> for each in the graph for the investigator to pick up.</p>
    </div>
  );
}

/** After a watch: hand an alert over. After a hand-off: the draft work order and the person's decision. */
export function WatchActions({ steps, busy, onHandOff }: { steps: Step[]; busy: boolean; onHandOff: (alertId: string) => void }) {
  const alerts = rowsOf<AlertRow>(steps, "raise_alert");
  const order = rowsOf<OrderRow>(steps, "create_work_order")[0];
  const alertId = steps.flatMap((s) => (s.type === "tool_call" && s.name === "create_work_order" ? [String(s.args.alertId)] : []))[0];
  const [by, setBy] = useState("");
  const [done, setDone] = useState<{ id: string; text: string; cypher?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function decide(decision: "dispatch" | "dismiss", id: string) {
    setErr(null);
    const r = await fetch("/api/decide", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id, decision, by: by.trim() || "presenter" }) });
    const j = await r.json();
    if (!r.ok) return setErr(j.error);
    const who = by.trim() || "presenter";
    setDone({ id: order?.id ?? id, cypher: j.cypher, text: decision === "dispatch" ? `Dispatched by ${who}. Assigned to ${j.engineer} (${j.team}), who had the fewest open orders. The alert is closed as actioned.` : `Dismissed by ${who}. The draft work order is cancelled.` });
  }

  if (order) {
    const settled = done?.id === order.id;
    return (
      <article className="mode-card order-card" aria-live="polite">
        <p className="mode-kind"><Term tip={TERMS.workOrder}>Draft work order</Term> from the investigator</p>
        <h2>{order.team}: inspection</h2>
        <p className="mode-mech">{order.task}</p>
        <p className="caption">Saved in the graph, linked to the alert, the line and the {order.aircraft} aircraft it names. The teams and engineers are made up; the reports are real.</p>
        {!settled ? (
          <div className="decide">
            <label>Your name<input value={by} onChange={(e) => setBy(e.target.value)} placeholder="Reviewer" /></label>
            <div className="decide-row">
              <button className="go" onClick={() => decide("dispatch", order.id)}>Dispatch</button>
              {alertId && <button className="ghost" onClick={() => decide("dismiss", alertId)}>Dismiss the alert</button>}
            </div>
          </div>
        ) : (
          <div className="decided"><p>{done!.text}</p></div>
        )}
        {err && <p className="step-error">{err}</p>}
        {settled && done?.cypher && <details><summary>The query behind the button (not available to the agent)</summary><pre>{done.cypher.replace(/^ {4}/gm, "")}</pre></details>}
      </article>
    );
  }
  if (!alerts.length) return null;
  return (
    <div className="handoff">
      <p className="caption">Hand an alert to the investigator:</p>
      {alerts.map((a) => a.status === "open"
        ? <button key={a.id} className="ghost" disabled={busy} onClick={() => onHandOff(a.id)} data-tip={`${a.aircraft} aircraft reported skin cracks on stringer ${short(a.bin)}. The investigator checks who they are and drafts a work order.`}>{short(a.bin)}, {a.aircraft} aircraft</button>
        : <span key={a.id} className="caption">{short(a.bin)}: already {a.status}</span>)}
    </div>
  );
}
