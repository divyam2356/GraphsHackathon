# Roadmap: Manish + divyam2356

Shared plan for Graph Hacks. **Submissions close Oct 18, 11:59 PM IST** (aim to submit by 8 PM
that day). Both of us edit this file: tick boxes as things land, and when you settle a pending
decision, move it to "Decided" with the date and your name.

Last updated: Oct 17, 16:30 IST (Manish + Claude). Order from here: improvements (Phase 1) first, then the video. The plan for the last 29 hours is under "Plan to the deadline".

## Submission checklist (rules 10–13)

- [ ] Repo public (divyam2356 owns it). Secret scan done Oct 17: gitleaks v8.24.3 + regex over all 37 commits, all branches: no leaks; no `.env` ever committed. Re-run before flipping if commits land.
- [x] README with setup and graph model (verified on a fresh clone, Oct 15)
- [x] Cypher and algorithms explained (README "How it works", Story step 9)
- [ ] Demo video, linked in the README (script ready: `docs/DEMO.md`)
- [ ] Live deployment, or full local setup (local setup done and verified; deploy pending decision D1)
- [x] Tracks named: 1 and 3 decided Oct 17; Track 2 pending Manish
- [x] AI use disclosed (README)
- [ ] Both of us can explain the graph model, queries and decisions (rule 12): run it locally, read `docs/DEFENSE.md`
- [x] Human contribution stated in the README's AI disclosure (Oct 17; no separate log: judges read the README). Our voices in the video back it up.

## Decided

| Date | Decision | Why |
|---|---|---|
| Oct 14 | Warning signs and leads worth review, never causes. Mechanical and structural events only. | The NTSB determines causes; maintenance reports cannot speak to pilot error or weather. |
| Oct 14 | One FalkorDB graph; the agent reaches it only through our MCP server (fixed Cypher). No approve tool for the agent; approvals are UI-only. | Rule 3 (the graph does the work) and a human in the loop for anything the system learns. |
| Oct 15 | Real public data only (NTSB avall, FAA Service Difficulty Reports). The offline fixture runs only with `DEMO=1`. | Rule 6; the original fixture had invented facts about a real accident (fixed). |
| Oct 15 | FalkorDB pinned to v4.14.6, no range indexes on date strings. | Bug: `d < 'X'` returned every row with the index. Every number was recomputed without it. |
| Oct 15 | Agent on OpenRouter free models (NVIDIA Nemotron 3 Super, two free fallbacks). The `openrouter/free` auto-router is not used. | Free key. The auto-router once picked a 2.6B model that claimed causation. |
| Oct 15 | Demos default to the **Recorded** run (a real 297 s Nemotron run, replayed in about 20 s). | Free tier: 50 requests a day and about 5 minutes per live run. |
| Oct 15 | The evaluation is the backtest over all NTSB events, reported honestly: no per-aircraft signal (0.88× chance). | A fair test, shown in Story step 5. It is stronger than single-case checks that cannot fail. |
| Oct 15 | Leads ranking (`rank_failure_modes`) and `services/eval/src/all.ts` are not presented as evidence. | Both are built from the SWA 812 answer (seeded mode, keyword rule). |
| Oct 16 | D6 closed: leads ranking fixed — structure + signature overlap + full-text similarity, all from the graph; verified SWA 812 rank 1 (0.8, clear), door-frame case weak. | The keyword rule could not fail and proved nothing; the fix keeps D6's recommended approach. |
| Oct 17 | Paperwork cut: no blog post (D4; the AI draft is deleted), no separate HUMAN_LOG (the README's AI disclosure says what we did), and the superseded plan docs (MILESTONES, GRAPH_MODEL) are deleted. | Judges read the README and watch the video; the time goes to Phase 1 and the video. divyam2356 can still write a blog in their own words. (Manish) |
| Oct 17 | Board explains itself to non-experts: hover tooltips on every aviation and graph term, a labelled case card instead of the question box, and a **3D aircraft** view whose "Unroll" lays the skin flat into the map. | Manish: viewers won't know aircraft. No free 737 model with a usable licence and internal structure was found (searched Oct 17), so the aircraft is drawn in code with three.js (MIT). (Manish + Claude) |
| Oct 17 | Watch → investigate hand-off (Tracks 1, 2, 3): the watcher stores `Alert`s in the graph on the fastest-rising skin-crack lines; the investigator picks one up, widens it, drafts a `WorkOrder`; only a person dispatches it (UI). 23 MCP tools. | Track 1 asks for actions based on what the graph shows, Track 2 for shared state and hand-offs between agents; `who_fixed` (Track 3) had no data before. (Manish + Claude) |
| Oct 17 | Memory across sessions (Track 2): the harness logs every run as an `Investigation` (`ABOUT` the accident, `KEPT` reports with confidence); new MCP tool `past_investigations`, called first. The recorded Nemotron run is imported (`npm run remember -w packages/agent`). | Track 2 asks for memory that persists across sessions; before this, judgments were overwritten and never read back. (Manish + Claude) |
| Oct 17 | Leads ranking only uses modes known before the investigation date (`known_from`). SWA 812 on 31 Mar 2011 → none (new pattern), which is what Story step 8 drafts. Still not presented as evidence. | FM-CROWN-S4L was written from SWA 812 (known from AD 2011-08-51, 5 Apr 2011), so "rank 1, clear" was hindsight: the date rule the agent follows applies to the ranker too. (Manish + Claude) |

## Pending decisions

| # | Question | Options | Recommendation | Decides | By |
|---|---|---|---|---|---|
| D1 | Live deployment? The rules prefer one; not required (rule 10: deployment *or* full local setup). | Modal, tested Oct 17: a web endpoint runs FalkorDB + the app with no card, on the free $30/month credit. Warm (about $5 through Oct 23, inside the credit) or sleep when idle (first visit waits 10–20 s). FalkorDB Cloud free (100 MB) and Hugging Face Spaces (PRO only) don't fit. | **Oct 17 (Manish): divyam2356 handles the deploy.** Suggest Modal, warm, with the Live model mode off on the public site (no OpenRouter key exposed). | divyam2356 | Oct 18, 15:00 |
| D2 | Which tracks? | Rules allow any or all; each one entered must be named at submission. | **Decided Oct 17 (Manish): Tracks 1 and 3.** Open: also name Track 2? Memory across sessions and the watcher → investigator hand-off are its key focus items, and entering costs nothing. | Manish | Oct 17 |
| D3 | The video | | **Decided Oct 17 (Manish): Manish + Claude make the video in code (`common/videokit`, captions carry the narration, no dramatic music). Both of us voice it: Claude writes a two-voice script from `docs/DEMO.md`. Improvements come first.** | Both | Oct 18 |

## Tracks: what the judges look for, and where we stand

Key focus items are quoted from the rules page (checked Oct 17). "Gap" says who closes it in the plan below.

**Track 1: Agents That Act on Connected Data** ("an agent that uses the graph to decide and act")

| Key focus | What we have | Gap |
|---|---|---|
| Multi-hop reasoning | `explain_path`: report → aircraft → accident in up to 4 hops, only through records dated before the investigation date. Location hierarchy bin → line → zone. The hand-off chains five tools. | — |
| Graph queries and algorithms as agent tools | 23 MCP tools, each a fixed Cypher query: shortest path, full-text search, date windows. | Only one algorithm (shortest path). `why` tool if time (Manish). |
| Tool selection through MCP | The live model picks the tools itself (the Recorded Nemotron run). Works from any MCP client. | Show it outside our app: MCP Inspector clip (Manish). |
| Actions based on what the graph shows | The watcher raises `Alert`s, the investigator drafts `WorkOrder`s, a person dispatches. The agent drafts failure modes; a person approves. | — |
| Explainable results | Every call shows its Cypher, rows and time; the evidence graph; tooltips; leads, never causes. | The fleet count mixes 737 generations: Classics only (Manish). |

**Track 3: Company Brain** ("people, teams, projects, documents, and decisions in one graph")

| Key focus | What we have | Gap |
|---|---|---|
| Knowledge from docs, tickets and chats in one graph | 225,627 maintenance reports (the airline's defect tickets) and NTSB findings, joined by aircraft and location. | **No documents.** The two FAA fix orders and the NTSB brief as linked sections (divyam2356). |
| Who owns what, and who knows what | 3 teams and 15 engineers (made up); `who_fixed` from assignments. | Teams own ATA chapters; dispatch prefers the engineer who knows the line (Manish). |
| Tracing decisions back to their source | Every decision stores who, why and when; `why_task`: task card → fix order → the order it replaced. | Cite the paragraph behind a fix order (divyam2356); `why` tool if time (Manish). |
| Keeping knowledge current | `stale_tasks` (cards citing a replaced order); `reoffer_candidates` (deferred modes with new evidence); the time machine. | Dated documents, so citations follow the time machine (divyam2356). |
| Answers with clear sources | Record ids link to the source record; the drawer quotes it in full. | Answers cite document sections (divyam2356 builds, Manish wires in). |

**Track 2: Agent Memory and Coordination** (only if we name it, D2): memory across sessions
(`Investigation` run log + `past_investigations`), shared state and a hand-off between two agents
(`Alert` → `WorkOrder`), persistent history. Not covered: high-concurrency writes, memory per user.

## Plan to the deadline

**Working in parallel without conflicts**
- Pull `main` before you start and before you push. Small commits, pushed often.
- Each of us owns different files (listed per task). In shared files (`packages/graph/queries/cypher.ts`,
  `packages/mcp-server/src/tools.ts`, `apps/web/lib/glossary.ts`) only add entries at the end; don't reformat.
- **Feature freeze: Oct 18, 12:00 IST.** After that: fixes, docs and the video only.
- Tick a box when it lands and write the commit id next to it.

### Phase 1: build (now → Oct 18, 12:00)

**divyam2356, with your own agent: Track 3, real documents in the graph.** Today the company layer is
all made up; Track 3 asks for "knowledge from docs" and "answers with clear sources".
**Full brief for your agent: [`docs/briefs/track3-documents.md`](docs/briefs/track3-documents.md)**
(files, existing code to reuse, milestones, constraints, done-when, challenger check). Prompt:
"Read ROADMAP.md, then docs/briefs/track3-documents.md, and execute it."
- [ ] Load the texts of AD 2011-08-51, AD 2015-16-08 (Federal Register) and NTSB brief AAB-13/02 as
      `Document` → `Section` nodes (US government works, public domain). Link each section to the
      `Location`s it names (reuse `locationChain` in `services/ingest/src/normalize.ts`) and to its
      `FixOrder` or `Accident`. Give each section the document's date.
- [ ] MCP tool `cite_documents {bin, asOf}`: sections about a location, dated before `asOf`
      (fixed Cypher, like the other tools).
- [ ] Show a location's cited sections in the record drawer.
- Files: new `services/ingest/src/documents.ts`, appended entries in `cypher.ts` and `tools.ts`,
  `apps/web/components/RecordDrawer.tsx`. Leave `packages/agent/` to Manish, who wires the tool in.
- Done when: `cite_documents` for `737/53/S4L` returns nothing at 2011-04-01 (no AD yet) and the
  AD 2011-08-51 inspection paragraph at 2011-05-01; screenshot of the drawer.

**Manish, with Claude: Track 1 and the rest of Track 3.**
- [ ] Same-generation fleet: the agent's fleet count uses 737 Classics only, like the map; update
      the numbers that change in the README, Story and `docs/DEMO.md`. (Track 1, correctness)
- [ ] Who owns what and who knows what: `Team OWNS System` (ATA chapter) picks the team; dispatch
      prefers the engineer with earlier work orders on that line (made-up history, marked
      `synthetic`), and the card says why. (Track 3)
- [ ] Wire `cite_documents` into the scripted method and the agent's instructions once it lands.
- [ ] If time: a `why` tool that walks back from a work order or an approved mode to its evidence
      and the person who decided. (Tracks 1 and 3)
- [ ] A 10-second clip of our MCP server answering in MCP Inspector, for the video. (Track 1)
- [ ] Tonight: fresh-clone setup test, including a production build (`next build`).

**Both of us (human work: what the README says we did, so make it true):**
- [ ] Use the app yourself: Board (Scripted run; Watch → hand-off → Dispatch; 3D aircraft → Unroll), Story.
- [ ] Check 2–3 facts against the sources (e.g. SWAA101399 against NTSB brief AAB-13/02; the 9 → 18 → 31 counts).
- [ ] Each pick one Cypher query and explain it out loud (`docs/DEFENSE.md`).
- [ ] Settle D2 today.

### Phase 2: freeze and verify (Oct 18, 12:00 → 15:00)
- [ ] Claude: rules page re-check; secret scan of the new commits; fresh-clone run; delete `docs/briefs/` once its report is read.
- [ ] divyam2356: deploy (D1); open the link in a private window.
- [ ] divyam2356: make the repo public.
- [ ] Reset the demo state (`docs/DEMO.md`, "Before recording").

### Phase 3: record and submit (Oct 18, 15:00 → 20:00)
- [ ] Claude: re-capture the footage after the freeze and render the video in code; both of us record our voice lines from the two-voice script, then Claude mixes them in.
- [ ] Both: one practice round of `docs/DEFENSE.md`.
- [ ] Video and deploy links in the README; final read of the Limits section.
- [ ] Submit by 20:00 IST (hard close 23:59), naming every track entered. One of us submits; Claude doesn't.

## Parked (not before the deadline)

- Embeddings for `similar_reports` (full-text search works today).
- Bulk airworthiness directives from the Federal Register API (2 loaded today).
- Making the `algo.labelPropagation` hotspot job meaningful (today it equals grouping by bin).
- Full FAA report load for all aircraft families (1.19M rows; needs a bigger machine). This is what a fleet-level backtest across families would need.
