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
apps/web/               Next.js UI (early): date picker + flows A/B/E as JSON. Planned: chat, evidence path, approval cards
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
# 4. data + ingest (public NTSB + FAA files, ~700 MB download, ~1 min to load)
scripts/fetch-data.sh           # -> data/raw/ntsb/*.csv, data/raw/sdr/SDR-YYYY.csv
npm run graph:indexes
npm run ingest:ntsb             # 4,235 mechanical NTSB events since 2008 (~10 s)
npm run ingest:reports          # 737 structures (ATA 52-57) + every report on an NTSB aircraft: ~226k reports (~35 s, ~600 MB in FalkorDB)
#   wider scope: npm run ingest:reports -- --families=all --chapters=all   (1.19M rows; needs a bigger box)
npm run ingest:fixorders
npm run seed:modes
npm test --workspace services/ingest   # normalizer tests (NTSB <-> FAA joins)
# 5. run
npm run mcp:serve               # our MCP server (agent connects here)
npm run agent:demo -- "crown skin crack S-4L 737"   # CLI smoke test
npm run dev --workspace apps/web                   # UI on :3001
```

A community FalkorDB MCP server (see FalkorDB GitHub) can run alongside in read-only mode for ad-hoc exploration.

## Teammates start here (5 min, no graph experience needed)

1. Clone, install, build: `git clone <repo> && npm install && npm run build`
   (Windows: use `npm.cmd` if `.ps1` scripts are blocked.)
2. Start the database: `docker compose up -d` — or skip Docker and use FalkorDB Cloud,
   then set `FALKORDB_URL` in your `.env`. Load the data (Quickstart step 4). Everything
   reads the graph; without data, `DEMO=1` serves a small offline SWA 812 fixture.
3. `cp .env.example .env` — an LLM key is **optional** (see below); leave it blank and all flows still run.
4. Verify your setup with two commands:
   `npm run agent:demo -- "crown skin S-4L"` (agent investigate + leads in terminal)
   `npm run eval --workspace services/eval` (3 backtests, expect 3 passes)
5. Open the UI: `npm run dev --workspace apps/web` → http://localhost:3001.
   FalkorDB Browser (see your data visually): http://localhost:3000.

Who works where (2 people): Person A owns `services/ingest` + `packages/graph`
(data, indexes, backtests). Person B owns `packages/mcp-server` + `packages/agent`
+ `apps/web` (tools, flows, UI). Contract between you: the tool names in
`packages/mcp-server/src/tools.ts` — A fills the Cypher, B calls the tools.
Before judging, everyone reads `docs/DEFENSE.md` and fills the HUMAN_LOG.

## Do I need an LLM key? No — but it changes one thing

| Without a key (works, verified) | With a key (stronger Track 1 story) |
|---|---|
| Graph queries, algorithms, formula scoring, backtests, UI, video — all run | Same, plus the agent _judges_ each report's relevance |
| Every joined report is kept (`rule-fallback`, reason logged) | Junk matches dropped with a stated reason (e.g. unrelated same-system hits) |

Set **one** of: `ANTHROPIC_API_KEY` (with `ANTHROPIC_MODEL`), or a free-tier
`LLM_API_KEY` + `LLM_BASE_URL` (Groq/OpenRouter) with `LLM_MODEL`. Any API failure
falls back to rules automatically — the project never crashes for lack of a key.
`.env` is gitignored: keys never touch GitHub.

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
  fix chain), keyword search and similar reports (fulltext index; vector index once
  real embeddings are loaded),
  fix-order paths (`algo.SPpaths`), and hotspot clusters (`algo.labelPropagation`
  over temp per-window edges, `packages/graph/src/hotspotJob.ts`) executes inside
  FalkorDB as fixed Cypher in the MCP server. Remove FalkorDB and the agent has no
  evidence paths, no rankings, no alerts: a failed query is returned as an error,
  never swapped for fixture data (`packages/graph/src/run.ts`). The SWA 812 fixture
  is served only when `DEMO=1` is set explicitly.
- Rule 5 (tracks): entering all three — T1 Agents That Act, T2 Memory & Coordination,
  T3 Company Brain (single shared graph, `synthetic:true` org layer).

## Docs

- `docs/GRAPH_MODEL.md` — node/edge table + Location binning (~20in stations)
- `docs/FLOWS.md` — A investigate · B watch · C backtests · D company brain · E leads · F learn
- `docs/EVALUATION.md` — metrics, assumptions, what to quote publicly
- `packages/graph/schema.cypher` — runnable DDL

## Data honesty (don't quote raw counts publicly without cleaning)

- SWA 812 signal: same-plane same-system only 68 events/17y (3–13× vs control — real but thin). Fleet × location, from the FAA structured station/stringer fields (graph query, Oct 15): **51 737-300/-400/-500 aircraft reported skin cracks on the S-4L/S-4R lap lines Jan 2008–Mar 2011 (186 reports, mostly one operator); 47 more Apr–Dec 2011.** Per year 9 / 18 / 31 aircraft (2008/09/10) while all other fuselage lines stayed flat (~180–210).
- It was not the biggest line: by raw counts lower-lobe stringers (S-24, S-18, S-21) had more cracked aircraft. A rising-line query (skin cracks only) put S-4L **2nd of all 737 fuselage lines on 2011-01-01** (17 vs 7 aircraft), with other rising lines that had no accident. So: a ranked watch list, not a prediction.
- FalkorDB 4.14.6: a range index on a string property answers `d < 'X'` with every row, so dates have no range index (see `packages/graph/src/ensureIndexes.ts`).
- UPS 1354 / SWA 1380 matches were unrelated; EC135 "warning" was the accident report itself → agent must judge relevance, join alone is not the answer.

## AI disclosure

Built with AI coding assistants (incl. OpenCode / Muse Spark). Humans own the graph
model, thresholds, approval decisions, and public claims. Everyone on the team can
explain the graph model and queries (rule 12).

## Submission checklist

- [ ] Public repo · [ ] README (setup+model+Cypher/algorithms) · [ ] demo video
- [ ] Live deploy or full local setup · [ ] all 3 tracks named · [ ] AI use disclosed
