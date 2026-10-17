# Defense prep (rules 12 + 13): know this cold before judging

Rule 12: every member must explain the graph model, queries, architecture, decisions.
Rule 13: pure-AI output with no human contribution/verification can be rejected.
This file is your study guide. What we did ourselves is stated in the README's AI disclosure.

## 30-second pitch
"Black Box finds warning signs before plane accidents. One FalkorDB graph holds
NTSB accidents, FAA reports, fix orders, learned failure modes, and a fictional
maintenance company. The agent investigates through fixed-Cypher MCP tools, shows the query behind
every step, and needs a human to approve every new failure mode."

## Say-it-out-loud version (if the above feels like jargon, memorize this instead)

**The one idea (30 seconds):** "Planes file maintenance reports for years before
anything goes wrong. Those reports and the accident records live in separate
places and nobody reads them together. We put both into one database that stores
*connections*, so for any accident we can walk backwards — same plane, same spot,
then the whole fleet at that spot — and show a person the warning signs. The
person decides, never the machine."

**The story that proves it (your only example):** "Southwest 812, April 2011 — a
hole opened in the fuselage. A year earlier, the *same plane* had two reports of
cracked clips at stringer S-4L, the exact line that later tore. Across the fleet,
156 planes reported trouble on that same line. Our tool finds all three facts in
seconds. The official investigators still determine the cause — we only surface
leads worth a look."

**What happens when you press Investigate (5 steps, in order):**
1. It pulls the accident: which plane, what broke, where.
2. It pulls that plane's old reports at the same spot (2 found, March 2010).
3. It checks the whole fleet at that spot (156 planes — a pattern, not bad luck).
4. It checks whether a fix order already covers it (none did — unaddressed).
5. It draws the path report → plane → accident, writes down what it kept, and a
   person reviews. Every step shows its query and time on screen.

**The graph in plain words:** "Think of a whiteboard. Every fact is a sticky
note — a report, an accident, a plane, a place on the plane. Pieces of string
connect them: *this report is about this plane*, *this accident involved this
plane*, *this finding is at this place*. Asking a question means following the
string with your finger. A normal database would need five separate searches
joined by hand; here it's one walk. Places nest like folders — a 20-inch slice
of fuselage sits inside a stringer line, which sits inside the fuselage — so
asking about a line automatically includes every slice on it."

**Each folder in one line:**
- `services/ingest` — downloads public records and pins them on the board.
- `packages/graph` — the board itself, plus the fixed questions anyone may ask it.
- `packages/mcp-server` — 23 labeled buttons; the agent may press buttons but never reach behind the board.
- `packages/agent` — the investigator: presses buttons in order, judges each report, writes down what it kept.
- `apps/web` — the two screens: the Board (investigate) and the Story (presentation).
- `services/eval` — the honesty check: replays old accidents to see if the method would have flagged them.

**Never say:** "predicts", "60% chance it was X", "found the cause", or demo scores.
Say: "warning signs", "leads worth review", "inspect first."

## Likely judge questions
1. "Where does FalkorDB do real work?" — Multi-hop joins across two public sources,
   the location hierarchy (`WITHIN*0..2`), `algo.SPpaths` evidence paths, full-text search,
   date/duration time machine. Kill FalkorDB and the agent has no evidence (no fixture
   fallback unless DEMO=1). Be straight: no vector index is loaded, and the labelPropagation
   hotspot job reduces to grouping by bin.
2. "Why one graph for real + synthetic?" — A Cypher query spans one graph; Track 3
   crosses company → real data, so they must co-reside. Synthetic nodes carry
   `synthetic:true` + own labels.
3. "Why can't the LLM set the score?" — The leads ranking is deterministic:
   `score = 0.4·structure + 0.4·signature + 0.2·text_sim`, every part from the graph. The
   LLM only judges relevance per report (keep or drop, with a confidence and a reason).
4. "What happens to rejected patterns?" — No permanent reject: a deferred (dormant) mode
   keeps its evidence and is offered again when it gains 3+ records or a new NTSB event
   since the person's decision (`reoffer_candidates`).
5. "How do you know it works?" — We backtested every NTSB mechanical event
   (`services/eval/src/backtest.ts`). The naive test says 2.9x chance; closing two leaks
   (the event's own report, family habits) takes it to 0.88x: one aircraft's system-level
   history does not beat chance. SWA 812's signal is location- and fleet-level; NTSB public
   findings carry no locations, so that part is shown for one case, not validated.
6. "Framing?" — Leads worth review, never causes. NTSB determines causes.
   Mechanical/structural only; pilot error + weather out of scope by design.
7. "Does it remember across sessions?" — Yes, in the graph. Every run is an `Investigation`
   node; each report the model keeps is a `KEPT` edge with confidence and reason. The next
   run calls `past_investigations` first and says whether it agrees. The harness writes the
   run log, not the model, and a replay only sees runs dated on or before its date.
8. "Wasn't the crown S-4L failure mode written from this accident?" — Yes, so the ranking
   never offers it before it was known: `known_from` is 5 Apr 2011 (AD 2011-08-51). Replayed
   on 31 Mar 2011, no known mode fits ("none"), which is why the agent drafts a new one for a
   person to approve (Story step 8).
9. "Where does the agent act, and how do agents share state?" — The watcher stores alerts in the
   graph (`raise_alert`: one per line and date, linked to the aircraft). The investigator reads
   them back (`open_alerts`), widens the scope, and drafts a work order; a person dispatches it
   (`/api/decide`, not an MCP tool). A second viewer sees the alert as already actioned. Be
   straight: on 1 Jan 2011 the S-4L alert named 17 aircraft and N632SW was not one of them (its
   reports were clip cracks); the investigator's any-crack view adds it among 49 more.

## File tour (who owns what — put names here)
- `packages/graph/{schema.cypher,queries/cypher.ts,src/hotspotJob.ts}` — model + fixed queries + LP job
- `packages/mcp-server/src/{tools.ts,index.ts}` — 23 domain tools; errors surface, no fallback
- `packages/agent/src/{loop.ts,scoring.ts}` — flows A/B/D/E/F, formula + decision rule
- `services/{ingest,org-generator,eval}` — pipeline, Northwind Aero, backtests
- `apps/web` — Board (map, time slider, agent trace, evidence graph), Story (9 steps, approval card), API routes agent/view/decide
