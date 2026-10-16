# Defense prep (rules 12 + 13): know this cold before judging

Rule 12: every member must explain the graph model, queries, architecture, decisions.
Rule 13: pure-AI output with no human contribution/verification can be rejected.
This file is your study guide — human work (threshold tuning, data cleaning,
approval decisions, blog rewrite) goes in HUMAN_LOG below.

## 30-second pitch
"Black Box finds warning signs before plane accidents. One FalkorDB graph holds
NTSB accidents, FAA reports, fix orders, learned failure modes, and a fictional
maintenance company. The agent investigates through fixed-Cypher MCP tools, scores
with a formula — never vibes — and needs a human to approve every new failure mode."

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
- `packages/mcp-server` — 18 labeled buttons; the agent may press buttons but never reach behind the board.
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
3. "Why can't the LLM set the score?" — `score = 0.4·structure + 0.4·signature +
   0.2·text_sim` is deterministic and tunable via backtests; the LLM judges
   relevance per report (UPS1354/SWA1380 false matches prove the join isn't enough).
4. "What happens to rejected patterns?" — No permanent reject: dormant keeps
   collecting SUPPORTS, re-offered on new accident or ≥3 new tails.
5. "How do you know it works?" — We backtested every NTSB mechanical event
   (`services/eval/src/backtest.ts`). The naive test says 2.9x chance; closing two leaks
   (the event's own report, family habits) takes it to 0.88x: one aircraft's system-level
   history does not beat chance. SWA 812's signal is location- and fleet-level; NTSB public
   findings carry no locations, so that part is shown for one case, not validated.
6. "Framing?" — Leads worth review, never causes. NTSB determines causes.
   Mechanical/structural only; pilot error + weather out of scope by design.

## File tour (who owns what — put names here)
- `packages/graph/{schema.cypher,queries/cypher.ts,src/hotspotJob.ts}` — model + fixed queries + LP job
- `packages/mcp-server/src/{tools.ts,index.ts}` — 18 domain tools, demo fallback
- `packages/agent/src/{loop.ts,scoring.ts}` — flows A/B/D/E/F, formula + decision rule
- `services/{ingest,org-generator,eval}` — pipeline, Northwind Aero, backtests
- `apps/web` — chat, time slider, approval cards, 3 API routes

## HUMAN_LOG (rule 13 evidence — fill in as you go)
- [ ] Thresholds (0.6/0.15/0.35) reviewed against backtests by: ___
- [ ] Fleet counts cleaned (gouge/crease filter) by: ___
- [ ] Approval / dormant decisions made by a human on: ___
- [ ] Blog rewritten in own voice by: ___ (do NOT submit the AI draft verbatim)
- [ ] Demo video recorded by: ___
- [ ] Full ingest run + row counts verified by: ___
