# Demo video script (about 3 minutes 55 seconds)

The video follows the Story (`/story`), with one stop on the Board for the live, interactive
part. Narration is about 500 words, at a calm pace. Every number on screen is a live query, so
the narration must match what the screen shows on the day; check the figures marked ✓ before recording
(✓ re-checked against the live screens on Oct 17; the 2:15 and 2:40 figures on Oct 18). The ✓ marks
are for checking, not for reading aloud.

## Before recording

- [ ] FalkorDB and the app running (`docker compose up -d`, `npm run dev`); close other heavy
      apps so FalkorDB stays out of swap.
- [ ] Browser at 1440×900 or 1920×1080, zoom 100%, no bookmarks bar, no extensions in view.
- [ ] Warm the caches: open each Story step once and play the Board slider once.
- [ ] Story step 8: if the drafted failure mode shows "Confirmed" or "Deferred", press Reopen
      so the recording starts from "waiting for a person".
- [ ] Board agent panel on **Recorded** (the default). It replays a real Nemotron run.
- [ ] No alerts or work orders left from a rehearsal: in FalkorDB Browser run
      `MATCH (n) WHERE n:Alert OR n:WorkOrder DETACH DELETE n` (the engineers' made-up job
      history is `WORKED_ON` edges, so it stays).
- [ ] The run log has the recorded run (`npm run remember -w packages/agent`, once), so the
      Scripted run's first step recalls it.

## Voices (two of us)

Suggested split, swap freely: **M** = Manish (the story, the agent acting), **D** = divyam2356 (the
evaluation, the model, the documents, the build). The video is cut to your takes, so pace doesn't
have to match the times below.

How to record:
- One file per line, named by its id and voice, e.g. `L03-M.m4a` (a phone voice memo is fine).
- Quiet room, phone about 20 cm from your mouth, no music or fan behind you.
- Calm pace, a one-second pause before and after. Re-record a line rather than editing it.
- Send the files to Manish; they go in `blackbox-video/voice/` (outside the repo).

## Script

| Line | Voice | Time | Screen | Narration |
|---|---|---|---|---|
| L00 | M | 0:00 | Title card | Hi, we're Manish and Divyam, and this is Black Box. |
| L01 | M | 0:00 | Story 1: rupture close-up | Flight recorders are painted orange, not black, so they can be found after an accident. We wanted to find the warning signs before it. On 1 April 2011, Southwest 812 lost a five-foot strip of its roof at 34,000 feet. Everyone survived. The NTSB found fatigue cracks along one lap joint, stringer S-4L. |
| L02 | M | 0:20 | Story 2: the two reports, then open the Cypher | A year earlier, mechanics working on this same aircraft found two cracked clips on that exact stringer, 24 inches from where the skin later tore. Two public datasets, never read together: NTSB investigations and FAA maintenance reports. In FalkorDB this is one query. |
| L03 | M | 0:40 | Story 3: let the heat replay run to 1 April 2011 | Across the fleet, the number of 737 Classics reporting skin cracks on stringer 4 went from 9 to 18 to 31 ✓ between 2008 and 2010. Each frame is a live Cypher query over 225,000 reports. |
| L04 | M | 1:00 | Story 4: trend chart | It was not the loudest line; other stringers had more cracks. What stood out was the rise: second of 37 lines ✓, three months before the accident. A lead worth review, not a prediction. |
| L05 | D | 1:15 | Story 5: backtest chart, row by row | Then we tried to fool ourselves. Across every NTSB event with earlier reports, the naive test says those reports named the failed system three times more often than chance. Two leaks made that: the accident's own report, and aircraft families that always report the same systems. Close them and it falls to 0.9 ✓, no better than chance. So a system-level match is not a warning sign. What mattered was the exact location and the fleet. |
| L06 | D | 1:45 | Story 6: schema counts up | That is why the model is built around location: from aircraft model to stringer line to a 20-inch bin, so a question about S-4L rolls up every bin along it. A quarter of a million nodes, half a million edges ✓. |
| L07 | D | 2:00 | Board: press Investigate (Recorded); drag the slider; click a hot S-4L cell, show the drawer | An agent investigates through our MCP server. It picks the tools; each runs fixed Cypher, and it cannot see past the investigation date. This is a real run of NVIDIA Nemotron on OpenRouter's free tier. Every call shows its query and time, and the records it touches build this evidence graph. When its first answer used causal language, our harness made it rewrite: we report warning signs, never causes. |
| L08 | D | 2:15 | Board: drag the slider past 5 April 2011, click the same S-4L cell | The graph holds the documents too: the FAA's emergency order and the NTSB brief, split into dated paragraphs and linked to the locations they name. Before 5 April the drawer has none; after it, the order's inspection paragraph for S-4L and S-4R ✓. |
| L09 | M | 2:25 | Board: switch to Scripted, press Investigate; point at step 1 and the "earlier run" sentence in the conclusion | It also remembers. Every run is logged in the graph with the reports it kept, and the next run starts there: this one recalls what the Nemotron run kept, and checks that it finds the same reports. |
| L10 | M | 2:40 | Board: set the slider to 1 January 2011, press Watch the fleet; hand S-4L to the investigator; type a name, Dispatch; open "Why this order?" | Then it acts. A watcher agent ranks lines by how fast skin cracks rose and stores three alerts in the graph; S-4L is one of them ✓, three months before the accident. The investigator picks the alert up, widens it to every crack on that line, and runs a graph algorithm, connected components, over lines that crack on the same aircraft: S-4L's closest partner is S-4R ✓, the pair the FAA ordered inspected together after the accident. The draft goes to the team that owns the fuselage. A person dispatches it, to the engineer who knows that line, and the why tool walks the decision back to its sources. |
| L11 | D | 3:05 | Story 8: Draft, then type a name and reason, Approve; open "The query behind the button" | On that day no known failure mode fit, because the ranking only uses modes known before the date. So the agent drafts one, with its evidence linked in the graph. It cannot approve it: there is no such tool. A person decides, and who, when and why are written to the graph. |
| L12 | D | 3:25 | Story 9: Cypher, timings, the bug note | Everything here is FalkorDB: multi-hop joins, variable-length paths, shortest paths, connected components, full-text search, and date windows that hide everything after the investigation date. Most answers come back in tens of milliseconds. We even found a bug in string range indexes on the way. Black Box: warning signs in maintenance records, before the accident. |

Optional, +10 s before 2:00 (worth it if the video still runs under 4 minutes): on the Board,
press **3D aircraft**, then **Unroll it into the map**. Narration: "This is the same map,
wrapped around the aircraft: cut along the bottom and laid flat."

## After recording

- Story step 8: press Reopen so the drafted mode goes back to "waiting for a person".
- Upload the video and put its link in the README and the submission form (Manish).
