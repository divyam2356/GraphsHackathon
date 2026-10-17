# Roadmap: Manish + divyam2356

Shared plan for Graph Hacks. **Submissions close Oct 18, 11:59 PM IST** (aim to submit by 8 PM
that day). Both of us edit this file: tick boxes as things land, and when you settle a pending
decision, move it to "Decided" with the date and your name.

Last updated: Oct 17, morning (Manish).

## Submission checklist (rules 10–13)

- [ ] Repo public (divyam2356 owns it). Secret scan done Oct 17: gitleaks v8.24.3 + regex over all 37 commits, all branches: no leaks; no `.env` ever committed. Re-run before flipping if commits land.
- [x] README with setup and graph model (verified on a fresh clone, Oct 15)
- [x] Cypher and algorithms explained (README "How it works", Story step 9)
- [ ] Demo video, linked in the README (script ready: `docs/DEMO.md`)
- [ ] Live deployment, or full local setup (local setup done and verified; deploy pending decision D1)
- [x] Tracks named: 1 and 3 decided Oct 17; Track 2 pending Manish
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
| Oct 17 | Watch → investigate hand-off (Tracks 1, 2, 3): the watcher stores `Alert`s in the graph on the fastest-rising skin-crack lines; the investigator picks one up, widens it, drafts a `WorkOrder`; only a person dispatches it (UI). 23 MCP tools. | Track 1 asks for actions based on what the graph shows, Track 2 for shared state and hand-offs between agents; `who_fixed` (Track 3) had no data before. (Manish + Claude) |
| Oct 17 | Memory across sessions (Track 2): the harness logs every run as an `Investigation` (`ABOUT` the accident, `KEPT` reports with confidence); new MCP tool `past_investigations`, called first. The recorded Nemotron run is imported (`npm run remember -w packages/agent`). | Track 2 asks for memory that persists across sessions; before this, judgments were overwritten and never read back. (Manish + Claude) |
| Oct 17 | Leads ranking only uses modes known before the investigation date (`known_from`). SWA 812 on 31 Mar 2011 → none (new pattern), which is what Story step 8 drafts. Still not presented as evidence. | FM-CROWN-S4L was written from SWA 812 (known from AD 2011-08-51, 5 Apr 2011), so "rank 1, clear" was hindsight: the date rule the agent follows applies to the ranker too. (Manish + Claude) |

## Pending decisions

| # | Question | Options | Recommendation | Decides | By |
|---|---|---|---|---|---|
| D1 | Live deployment? The rules prefer one. | Checked Oct 17: FalkorDB Cloud free = 100 MB RAM (our graph ~200 MB, ~520 MB process), stopped after 1 idle day, deleted after 7: does not fit. Hugging Face Docker Spaces now need PRO ($9/month; our HF account has none). B: Tailscale Funnel from the home PC: free, stable https URL, but the PC must stay on Oct 19–22 (power cut on Oct 17 morning). C: video plus the verified local setup. | B with C as the fallback, if Manish is OK exposing the PC (production build, auto-restart units); otherwise C. | Manish | Oct 17 noon |
| D2 | Which tracks? | Rules allow any or all; each one entered must be named at submission. | **Decided Oct 17 (Manish): Tracks 1 and 3.** Claude suggested also naming Track 2 (memory across sessions + watcher→investigator hand-off are its key focus items; entering costs nothing). README track line waits on that answer. | Manish | Oct 17 |
| D3 | Who records and voices the video? | Manish or divyam2356 records; Claude can build a captioned screen capture. | One of us voices it (rule 13 favours visible human work); follow `docs/DEMO.md`. | Both | Oct 16 |
| D4 | Blog post for the AirPods side prize? | Write it, or skip. | Write it in our own words; `docs/BLOG.md` is an AI draft and must not be submitted as is. Lead with the backtest result. | divyam2356 | Oct 17 |
| D5 | Who owns what from here (below)? | | Confirm or change the proposed owners. | Both | Oct 16 |

## Work plan (owners proposed, see D5)

Manish works with Claude Code; divyam2356 with their own tools.

**Oct 16**
- [ ] Both: read this file, agree owners (D5), pull `main` (many files changed on Oct 15).
- [ ] divyam2356: run it locally from the README, then walk the Story and the Board. Note anything unclear.
- [ ] divyam2356: research D1. FalkorDB Cloud free tier limits, and where to host the Next app. Note that the
      live agent spawns the MCP server as a child process; Recorded and Scripted modes don't need a model key.
- [x] Rules page re-checked Oct 17 09:30 IST (Claude): same 18 rules, judging criteria still unpublished. Discord not checked (needs Manish's login).
- [ ] Manish: decide D3; do a practice run of the video script.

**Oct 17**
- [ ] Manish: decide D1 by noon; deploy if A or B.
- [ ] Owner of D3: record the video; re-check the ✓ numbers in `docs/DEMO.md` against the live screens.
- [ ] divyam2356: blog draft in our own words (D4).
- [ ] Both: practise the judge questions in `docs/DEFENSE.md` (update answers that changed).
- [ ] Optional: D2 deepening.

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
