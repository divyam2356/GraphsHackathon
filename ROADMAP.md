# Roadmap: Manish + divyam2356

Shared plan for Graph Hacks. **Submissions close Oct 18, 11:59 PM IST** (aim to submit by 8 PM
that day). Both of us edit this file: tick boxes as things land, and when you settle a pending
decision, move it to "Decided" with the date and your name.

Last updated: Oct 18, 09:25 IST (Manish + Claude). Phase 1 is done on both sides: Track 3 documents
(divyam2356, reviewed and fixed in c163eb8) and Manish + Claude's items (8830d07, 513915b, 3f10765,
a7f2976). The Modal deploy prep had four blockers, fixed in ce9da7d. From here: freeze, deploy, video.

## Submission checklist (rules 10–13)

- [ ] Repo public (divyam2356 owns it). Secret scan done Oct 17: gitleaks v8.24.3 + regex over all 37 commits, all branches: no leaks; no `.env` ever committed. Re-run before flipping if commits land.
- [x] README with setup and graph model (verified on a fresh clone, Oct 15)
- [x] Cypher and algorithms explained (README "How it works", Story step 9)
- [ ] Demo video, linked in the README (script ready: `docs/DEMO.md`)
- [x] Live deployment (Oct 18 13:5x IST): Modal, `deploy/` (divyam2356). URL: https://storagedivyam--blackbox-serve.us-east.modal.run ; the graph RDB ships in the volume, Track 3 documents verified through the wire (`cite_documents` 10 rows), local setup stays as the fallback (fq fixes: volume at /rdb, image ENTRYPOINT/CMD blanked)
- [x] Tracks: 1 and 3 (decided Oct 17, Manish). Not Track 2.
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
| Oct 17 | D2 closed: we enter **Tracks 1 and 3 only**. | No time to argue Track 2 well; the memory and hand-off features stay, described as part of Tracks 1 and 3. (Manish) |
| Oct 17 | Paperwork cut: no blog post (D4; the AI draft is deleted), no separate HUMAN_LOG (the README's AI disclosure says what we did), and the superseded plan docs (MILESTONES, GRAPH_MODEL) are deleted. | Judges read the README and watch the video; the time goes to Phase 1 and the video. divyam2356 can still write a blog in their own words. (Manish) |
| Oct 17 | Board explains itself to non-experts: hover tooltips on every aviation and graph term, a labelled case card instead of the question box, and a **3D aircraft** view whose "Unroll" lays the skin flat into the map. | Manish: viewers won't know aircraft. No free 737 model with a usable licence and internal structure was found (searched Oct 17), so the aircraft is drawn in code with three.js (MIT). (Manish + Claude) |
| Oct 17 | Watch → investigate hand-off (Tracks 1, 2, 3): the watcher stores `Alert`s in the graph on the fastest-rising skin-crack lines; the investigator picks one up, widens it, drafts a `WorkOrder`; only a person dispatches it (UI). 23 MCP tools. | Track 1 asks for actions based on what the graph shows, Track 2 for shared state and hand-offs between agents; `who_fixed` (Track 3) had no data before. (Manish + Claude) |
| Oct 17 | Memory across sessions (Track 2): the harness logs every run as an `Investigation` (`ABOUT` the accident, `KEPT` reports with confidence); new MCP tool `past_investigations`, called first. The recorded Nemotron run is imported (`npm run remember -w packages/agent`). | Track 2 asks for memory that persists across sessions; before this, judgments were overwritten and never read back. (Manish + Claude) |
| Oct 17 | Leads ranking only uses modes known before the investigation date (`known_from`). SWA 812 on 31 Mar 2011 → none (new pattern), which is what Story step 8 drafts. Still not presented as evidence. | FM-CROWN-S4L was written from SWA 812 (known from AD 2011-08-51, 5 Apr 2011), so "rank 1, clear" was hindsight: the date rule the agent follows applies to the ranker too. (Manish + Claude) |

## Pending decisions

| # | Question | Options | Recommendation | Decides | By |
|---|---|---|---|---|---|
| D1 | Live deployment? The rules prefer one; not required (rule 10: deployment *or* full local setup). | Modal, tested Oct 17: a web endpoint runs FalkorDB + the app with no card, on the free $30/month credit. Warm at 1 CPU + 2 GiB (about $1.5 a day) or sleep when idle (first visit waits 10–20 s). FalkorDB Cloud free (100 MB) and Hugging Face Spaces (PRO only) don't fit. | **Oct 17 (Manish): divyam2356 handles the deploy.** Prep in `deploy/` (51e0633). Pull ce9da7d first (four blockers fixed), take the dump after the demo reset, `volume put ... /dump.rdb`. Live model mode is off on the public site (no key). | divyam2356 | Oct 18, 15:00 |
| D3 | The video | | **Decided Oct 17 (Manish): Manish + Claude make the video in code (`common/videokit`, captions carry the narration, no dramatic music). Both of us voice it: Claude writes a two-voice script from `docs/DEMO.md`. Improvements come first.** | Both | Oct 18 |

## Tracks: what the judges look for, and where we stand

Key focus items are quoted from the rules page (checked Oct 17). "Gap" says who closes it in the plan below.

**Track 1: Agents That Act on Connected Data** ("an agent that uses the graph to decide and act")

| Key focus | What we have | Gap |
|---|---|---|
| Multi-hop reasoning | `explain_path`: report → aircraft → accident in up to 4 hops, only through records dated before the investigation date. Location hierarchy bin → line → zone. The hand-off chains five tools. | — |
| Graph queries and algorithms as agent tools | 26 MCP tools, each a fixed Cypher query: shortest paths (`algo.SPpaths`), connected components (`algo.WCC` in `cracks_together`), full-text search, date windows. | — |
| Tool selection through MCP | The live model picks the tools itself (the Recorded Nemotron run). Works from any MCP client: verified in MCP Inspector 2.9.0 (`cracks_together` answers there). | Clip captured with the video. |
| Actions based on what the graph shows | The watcher raises `Alert`s, the investigator drafts `WorkOrder`s, a person dispatches. The agent drafts failure modes; a person approves. | — |
| Explainable results | Every call shows its Cypher, rows and time; the evidence graph; tooltips; leads, never causes; fleet counts use the aircraft's own generation like the map; `why` traces any decision. | — |

**Track 3: Company Brain** ("people, teams, projects, documents, and decisions in one graph")

| Key focus | What we have | Gap |
|---|---|---|
| Knowledge from docs, tickets and chats in one graph | 225,627 maintenance reports (the airline's defect tickets), NTSB findings, and 3 official documents (44 dated sections) linked to the locations they name. | — |
| Who owns what, and who knows what | Teams `OWNS` ATA chapters and get the work orders; 15 engineers with a made-up job history (`WORKED_ON`); dispatch goes to who knows the line; `who_fixed`. | — |
| Tracing decisions back to their source | Every decision stores who, why and when; work orders `CITES` the AD paragraphs; `why` walks any work order or failure mode back; `why_task`. | — |
| Keeping knowledge current | `stale_tasks`; `reoffer_candidates`; the time machine, documents included (no AD paragraphs before 5 April 2011). | — |
| Answers with clear sources | Record and section ids link to the source; the drawer quotes it; answers and work orders cite sections (`cite_documents`). | — |

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
(The brief and its report lived in `docs/briefs/`, deleted Oct 18 once read; they are in the git
history at 1c72143.)
- [x] 23a6c69 Load the texts of AD 2011-08-51, AD 2015-16-08 (Federal Register) and NTSB brief AAB-13/02 as
      `Document` → `Section` nodes (US government works, public domain). Link each section to the
      `Location`s it names (reuse `locationChain` in `services/ingest/src/normalize.ts`) and to its
      `FixOrder` or `Accident`. Give each section the document's date.
- [x] 6fc6e84 MCP tool `cite_documents {bin, asOf}`: sections about a location, dated before `asOf`
      (fixed Cypher, like the other tools). Done-when verified: `737/53/S4L` at 2011-04-01 → 0 rows,
      at 2011-05-01 → the AD 2011-08-51 paragraphs (e, g, i); S-24R → 0; tests 10/10; MCP stdio answers.
- [x] e734493 Show a location's cited sections in the record drawer.
- Files: new `services/ingest/src/documents.ts`, appended entries in `cypher.ts` and `tools.ts`,
  `apps/web/components/RecordDrawer.tsx`. Leave `packages/agent/` to Manish, who wires the tool in.
- Done when: `cite_documents` for `737/53/S4L` returns nothing at 2011-04-01 (no AD yet) and the
  AD 2011-08-51 inspection paragraph at 2011-05-01; screenshot of the drawer. **Verified (report:
  `docs/briefs/track3-report.md` at 1c72143); drawer screenshot taken Oct 18. Review fixes in c163eb8: map cells
  show the documents too, a station-only bin no longer returns every section.**

**Manish, with Claude: Track 1 and the rest of Track 3.**
- [x] 8830d07 Same-generation fleet: fleet counts and the watcher use the aircraft's generation (145
      737 Classics, was 156 of every 737). Also fixed: `fix_orders` ignored its location.
- [x] 3f10765 Who owns what and who knows what: `Team OWNS System` picks the team; dispatch goes to
      the engineer with the most earlier jobs on the line (made-up `WORKED_ON` history), and the card says why.
- [x] 8830d07 `cite_documents` in the scripted method, the alert hand-off (work orders `CITES` sections) and the prompt.
- [x] a7f2976 `why` tool: work order or failure mode → its sources and the person who decided.
- [x] 513915b (added Oct 18) Graph algorithm as a tool: `cracks_together` (`algo.WCC`); S-4L's top partner
      on 1 Jan 2011 was S-4R; the work order adds the direct partners.
- [x] MCP Inspector 2.9.0 runs our server and `cracks_together` answers there; the clip is captured with the video.
- [x] 808f9f4 Fresh-clone setup test, including `next build`: passes; it found `npm run remember -w packages/agent`
      failing on a fresh clone (fixed in 808f9f4).

**Both of us (human work: what the README says we did, so make it true):**
- [ ] Use the app yourself: Board (Scripted run; Watch → hand-off → Dispatch; 3D aircraft → Unroll), Story.
- [ ] Check 2–3 facts against the sources (e.g. SWAA101399 against NTSB brief AAB-13/02; the 9 → 18 → 31 counts).
- [ ] Each pick one Cypher query and explain it out loud (`docs/DEFENSE.md`).
- [x] Settle D2 today (Oct 17: Tracks 1 and 3).

### Phase 2: freeze and verify (Oct 18, 12:00 → 15:00)
- [x] Claude (done early, Oct 18 09:30): rules re-checked (same 18 rules, 7,749 registered); gitleaks v8.24.3 over all
      65 commits: no leaks; fresh-clone run passes (808f9f4, incl. `next build`); `docs/briefs/` deleted. Re-scan if commits land before going public.
- [x] divyam2356: deploy (D1), Oct 18: https://storagedivyam--blackbox-serve.us-east.modal.run answers (board 200, `cite_documents` 10 rows over the wire, kernel graph loaded from the volume). Private-window check + drawer screenshot still to do by a person before recording.
- [ ] divyam2356: make the repo public.
- [ ] Reset the demo state (`docs/DEMO.md`, "Before recording").

### Phase 3: record and submit (Oct 18, 15:00 → 20:00)
- [ ] Claude: re-capture the footage after the freeze and render the video in code; both of us record our voice lines from the two-voice script, then Claude mixes them in.
      Oct 18, 12:40 (Claude): footage captured after the freeze; three cuts rendered with captions and quiet music
      (studio, paper, editorial; outside the repo). Waiting for the voice takes: one file per line, L00-L12 plus L06b
      (the 3D aircraft, now a row in `docs/DEMO.md`); with them the cut re-times itself to the voices.
- [ ] Both: one practice round of `docs/DEFENSE.md`.
- [ ] Video and deploy links in the README; final read of the Limits section.
- [ ] Submit by 20:00 IST (hard close 23:59), naming every track entered. One of us submits; Claude doesn't.

## Parked (not before the deadline)

- Embeddings for `similar_reports` (full-text search works today).
- Bulk airworthiness directives from the Federal Register API (2 loaded today).
- Making the `algo.labelPropagation` hotspot job meaningful (today it equals grouping by bin).
- Full FAA report load for all aircraft families (1.19M rows; needs a bigger machine). This is what a fleet-level backtest across families would need.
