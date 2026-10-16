# Roadmap: Manish + divyam2356

Shared plan for Graph Hacks. **Submissions close Oct 18, 11:59 PM IST** (aim to submit by 8 PM
that day). Both of us edit this file: tick boxes as things land, and when you settle a pending
decision, move it to "Decided" with the date and your name.

Last updated: Oct 15, evening (Manish).

## Submission checklist (rules 10–13)

- [ ] Repo public, after a secret scan of the full git history (keys must never have been committed)
- [x] README with setup and graph model (verified on a fresh clone, Oct 15)
- [x] Cypher and algorithms explained (README "How it works", Story step 9)
- [ ] Demo video, linked in the README (script ready: `docs/DEMO.md`)
- [ ] Live deployment, or full local setup (local setup done and verified; deploy pending decision D1)
- [x] Tracks named (pending decision D2 may change this)
- [x] AI use disclosed (README)
- [ ] Both of us can explain the graph model, queries and decisions (rule 12): run it locally, read `docs/DEFENSE.md`
- [ ] Human contributions logged (rule 13): fill the HUMAN_LOG in `docs/DEFENSE.md`

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

## Pending decisions

| # | Question | Options | Recommendation | Decides | By |
|---|---|---|---|---|---|
| D1 | Live deployment? The rules prefer one. | A: FalkorDB Cloud + a host for the Next app. B: tunnel to the home PC (must stay on through judging). C: video plus the verified local setup. | Find out whether FalkorDB Cloud's free tier fits the graph (~600 MB in FalkorDB). If yes, A with Recorded and Scripted modes; if not, C. | Manish | Oct 17 noon |
| D2 | Keep entering Track 3 (Company Brain)? | Keep (3 teams, 15 engineers, 2 task cards today), deepen it, or drop it. | Enter Tracks 1 and 2 only, unless someone deepens Track 3 by Oct 17. A thin entry can read as overclaiming. | Both | Oct 17 |
| D3 | Who records and voices the video? | Manish or divyam2356 records; Claude can build a captioned screen capture. | One of us voices it (rule 13 favours visible human work); follow `docs/DEMO.md`. | Both | Oct 16 |
| D4 | Blog post for the AirPods side prize? | Write it, or skip. | Write it in our own words; `docs/BLOG.md` is an AI draft and must not be submitted as is. Lead with the backtest result. | divyam2356 | Oct 17 |
| D5 | Who owns what from here (below)? | | Confirm or change the proposed owners. | Both | Oct 16 |
| D6 | Leads ranking: fix, or leave documented as a sketch? | Fix: replace the keyword rule with FalkorDB full-text scores and evaluate it. Or leave it as is. | Leave it as a sketch unless time remains on Oct 17. | Both | Oct 17 |

## Work plan (owners proposed, see D5)

Manish works with Claude Code; divyam2356 with their own tools.

**Oct 16**
- [ ] Both: read this file, agree owners (D5), pull `main` (many files changed on Oct 15).
- [ ] divyam2356: run it locally from the README, then walk the Story and the Board. Note anything unclear.
- [ ] divyam2356: research D1. FalkorDB Cloud free tier limits, and where to host the Next app. Note that the
      live agent spawns the MCP server as a child process; Recorded and Scripted modes don't need a model key.
- [ ] Manish: re-check the rules page and Discord for judging criteria and changes; record them here.
- [ ] Manish: decide D3; do a practice run of the video script.

**Oct 17**
- [ ] Manish: decide D1 by noon; deploy if A or B.
- [ ] Owner of D3: record the video; re-check the ✓ numbers in `docs/DEMO.md` against the live screens.
- [ ] divyam2356: blog draft in our own words (D4).
- [ ] Both: practise the judge questions in `docs/DEFENSE.md` (update answers that changed).
- [ ] Optional: D2 deepening, or D6.

**Oct 18**
- [ ] Manish: final re-check of the rules page.
- [ ] Manish: secret scan of the git history, then make the repo public.
- [ ] Both: put the video (and deploy) links in the README; final read of the README Limits section.
- [ ] Submit by 8 PM IST (hard close 11:59 PM IST).

## Parked (not before the deadline)

- Embeddings for `similar_reports` (full-text search works today).
- Bulk airworthiness directives from the Federal Register API (2 loaded today).
- Making the `algo.labelPropagation` hotspot job meaningful (today it equals grouping by bin).
- Full FAA report load for all aircraft families (1.19M rows; needs a bigger machine). This is what a fleet-level backtest across families would need.

## Open questions for the organisers

- Judging criteria and weights (unpublished as of Oct 15, 15:50 IST).
- Can one project win more than one track?
