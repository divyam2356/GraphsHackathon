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

## Likely judge questions
1. "Where does FalkorDB do real work?" — Multi-hop joins, fulltext + vector search,
   `algo.SPpaths` fix chains, `algo.labelPropagation` hotspots. Kill FalkorDB and the
   agent has no evidence, no ranks, no alerts (README §Rules compliance).
2. "Why one graph for real + synthetic?" — A Cypher query spans one graph; Track 3
   crosses company → real data, so they must co-reside. Synthetic nodes carry
   `synthetic:true` + own labels.
3. "Why can't the LLM set the score?" — `score = 0.4·structure + 0.4·signature +
   0.2·text_sim` is deterministic and tunable via backtests; the LLM judges
   relevance per report (UPS1354/SWA1380 false matches prove the join isn't enough).
4. "What happens to rejected patterns?" — No permanent reject: dormant keeps
   collecting SUPPORTS, re-offered on new accident or ≥3 new tails.
5. "How do you know it works?" — 3 time-machine backtests (`services/eval`),
   FalkorDB-backed when reachable; 18-month CAROL assumption stated openly.
6. "Framing?" — Leads worth review, never causes. NTSB determines causes.
   Mechanical/structural only; pilot error + weather out of scope by design.

## File tour (who owns what — put names here)
- `packages/graph/{schema.cypher,queries/cypher.ts,src/hotspotJob.ts}` — model + fixed queries + LP job
- `packages/mcp-server/src/{tools.ts,index.ts}` — 19 domain tools, demo fallback
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
