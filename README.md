# Black Box — warning signs before plane accidents

> AI agent that finds warning signs that came before plane accidents, ranks where to
> look when a new one happens, learns new failure modes with human approval, and flags
> planes flying today that show a known danger pattern.

**Framing rule: we show warning signs and leads worth review, never causes. The NTSB
determines causes.** Scope: mechanical / structural accidents only. Pilot error and
weather are the most common NTSB causes and maintenance reports can't predict them.

- Hackathon: Graph Hacks (FalkorDB × WeMakeDevs), Oct 15–18 2026. Status: in build.
- Tracks: **1. Agents That Act** (main) · **2. Memory & Coordination** · **3. Company Brain**
- Stack: FalkorDB (`blackbox` graph) · MCP server (domain tools, fixed Cypher) · tool-calling LLM loop · Next.js UI
- Data: public NTSB + FAA reports + FAA fix orders (Federal Register API) · synthetic org "Northwind Aero"

## Repo map

```
apps/web/               Next.js UI: chat · animated graph path · time-machine slider · alerts · approval cards
packages/mcp-server/    Our MCP server — the ONLY way the agent touches FalkorDB (fixed Cypher, no raw queries)
packages/agent/         Tool-calling loop + explainable scoring + decision rule + backtest harness glue
packages/graph/         Schema, indexes, canned Cypher, algorithm jobs (single source of truth for the model)
services/ingest/        NTSB → FAA reports → fix orders → embeddings → seed failure modes
services/org-generator/ Synthetic Northwind Aero (engineers/teams/task cards/work orders), synthetic:true
services/eval/          3 time-machine backtests: precursor hit rate · leads top-3 · novelty detection
docs/                   GRAPH_MODEL.md · FLOWS.md · EVALUATION.md · DEMO.md
.agent/tasks/falkordb-ideas/  Research scripts (reference only, NOT product code)
```

One graph for both layers (`blackbox`). A Cypher query runs against one graph at a
time, so Track 3 questions crossing fictional-company → real-data need everything in
the same graph. Synthetic nodes carry `synthetic: true` + own labels (`OrgTail`, etc.).

## Quickstart

```bash
# 1. FalkorDB
docker compose up -d            # falkordb:6379 + browser :3000
# 2. env
cp .env.example .env
# 3. install + build
npm install
npm run build
# 4. ingest (subset by default; full = 1.17M reports, needs disk for vectors)
npm run ingest:ntsb -- --limit 1000
npm run ingest:reports -- --systems structures,engines --limit 5000
npm run ingest:fixorders
npm run graph:indexes
npm run seed:modes
# 5. run
npm run mcp:serve               # our MCP server (agent connects here)
npm run agent:demo -- "crown skin crack S-4L 737"   # CLI smoke test
npm run dev --workspace apps/web                   # UI on :3001
```

A community FalkorDB MCP server (see FalkorDB GitHub) can run alongside in read-only mode for ad-hoc exploration.

## MCP tools (fixed Cypher inside)

Read: `search_accidents · get_accident · prior_reports · fleet_reports · hotspots ·
similar_reports · fix_orders · explain_path · rank_failure_modes ·
failure_mode_candidates · who_fixed · why_task · stale_tasks`

Write/action: `record_precursor · raise_alert · propose_failure_mode · add_support ·
record_observation · create_work_order`

UI-only (never the agent): `approve_failure_mode → confirmed · defer_failure_mode →
dormant · merge_failure_mode → merged`

See `packages/mcp-server/src/tools.ts` and `packages/graph/queries/`.

## Confidence score + decision rule (formula, LLM never sets it)

```
score = 0.4*structure + 0.4*signature + 0.2*text_sim
# structure: model family + system + location bin (0 / 0.5 / 1)
# signature: share of mode SIGNATURE locations with reports in window
# text_sim: best vector similarity case text ↔ mode example causes
```

| Result | Rule (starting values, tune via backtest) | Agent does |
|---|---|---|
| Clear match | top ≥ 0.6 and margin ≥ 0.15 | "Matches known mode X" + path |
| Ambiguous | top ≥ 0.6 but margin < 0.15 | Shows both, asks separating question. No new node |
| Weak match | 0.35 ≤ top < 0.6 | Shows top incl. dormant "unconfirmed", offers propose |
| No fit | top < 0.35 | Proposes new mode (flow F) |

`FailureMode.status`: `proposed | confirmed | dormant | merged` (no permanent reject).
Dormant keeps collecting `SUPPORTS`, re-offered on: new accident OR ≥3 new distinct
aircraft since `support_at_decision`. False-alarm alerts decay signature `weight`,
never delete.

## Evaluation (all on the time machine — every node has `date`, every tool takes `asOf`)

1. **Precursor hit rate** — asOf = day before accident: would flow B have alerted at the eventual cause location? Hits vs false alarms.
2. **Leads top-3** — hide findings, feed early facts only, check true system+location in top 3.
3. **Novelty detection** — replay in date order; first accident per mode was "new" then. Recall/precision of "no known mode fits" across thresholds. Open item: NTSB table has no final-report date → mode becomes known at event + ~18mo unless CAROL gives real date.

## Rules compliance (Graph Hacks rules 2, 3, 5, 10–12)

- Rule 2 (FalkorDB primary, central): the only database is the `blackbox` FalkorDB
  graph. The agent has no other storage — memory (PRECURSOR_OF, HotSpot, Alert,
  FailureMode, Case) is written back to the same graph.
- Rule 3 (graph does real work): every multi-hop join (accident → priors → fleet →
  fix chain), keyword search (fulltext index), similar-report search (vector index),
  fix-order paths (`algo.SPpaths`), and hotspot clusters (`algo.labelPropagation`
  over temp per-window edges, `packages/graph/src/hotspotJob.ts`) executes inside
  FalkorDB as fixed Cypher in the MCP server. Remove FalkorDB and the agent has no
  evidence paths, no rankings, no alerts — the demo fixture only carries the one
  SWA-812 story for offline UI work and cannot answer new questions.
- Rule 5 (tracks): entering all three — T1 Agents That Act, T2 Memory & Coordination,
  T3 Company Brain (single shared graph, `synthetic:true` org layer).

## Docs

- `docs/GRAPH_MODEL.md` — node/edge table + Location binning (~20in stations)
- `docs/FLOWS.md` — A investigate · B watch · C backtests · D company brain · E leads · F learn
- `docs/EVALUATION.md` — metrics, assumptions, what to quote publicly
- `packages/graph/schema.cypher` — runnable DDL

## Data honesty (don't quote raw counts publicly without cleaning)

- SWA 812 signal: same-plane same-system only 68 events/17y (3–13× vs control — real but thin); strong signal is model×location fleet: ~67 crown-skin S-4 reports 2008–Mar 2011 + 47 Apr–Dec 2011, rough text filter incl. gouges/creases.
- UPS 1354 / SWA 1380 matches were unrelated; EC135 "warning" was the accident report itself → agent must judge relevance, join alone is not the answer.

## AI disclosure

Built with AI coding assistants (incl. OpenCode / Muse Spark). Humans own the graph
model, thresholds, approval decisions, and public claims. Everyone on the team can
explain the graph model and queries (rule 12).

## Submission checklist

- [ ] Public repo · [ ] README (setup+model+Cypher/algorithms) · [ ] demo video
- [ ] Live deploy or full local setup · [ ] all 3 tracks named · [ ] AI use disclosed
