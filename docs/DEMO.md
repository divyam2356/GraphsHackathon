# Demo video script (about 4 minutes, set by the voice takes)

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
- [ ] Board agent panel on **Recorded** (the default). It replays a real agent run.
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
| L00 | M |  | Title card | Hi, we're Manish and Divyam, and this is Black Box. |
| L01 | M |  | Board, 3D aircraft: the panel that tore, then Unroll it into the map | In April 2011, a Southwest 737 lost a five-foot strip of its roof at 34,000 feet. Investigators found fatigue cracks along one seam in the skin. But the warning signs were already sitting in maintenance records: a public dataset too big to read by hand, that nobody reads alongside the accident reports. Everyone on board survived, that time. |
| L02 | M |  | Board: the question on the case card, Investigate (Recorded), the evidence graph | Black Box puts 4,235 NTSB investigations and 225,000 maintenance reports into one FalkorDB graph: about eight million words, far too much for any agent to read. So our agent doesn't read; it asks the graph through MCP tools, each an exact Cypher query that comes back in milliseconds. It works two ways: after an incident, it finds the warning signs that came before; and before one, it flags what to inspect. |
| L03 | M |  | Animation: the investigator types the question | Here's how it works. After an incident, an investigator simply asks Black Box: what came before this, and what should we look at? |
| L04 | D |  | Animation: agent, MCP server, FalkorDB graph; the query path lights up; leads come back | The agent turns the question into calls to our MCP server. Each tool runs one fixed Cypher query on FalkorDB: the accident, then this aircraft's earlier reports at the same spot, then the rest of the fleet, and never anything dated after the accident. Each answer takes milliseconds, and the agent hands back leads for a person to review, not causes. |
| L05 | M |  | Story 2 (the two reports), then Story 3 (the fleet replay) | Here's what it found for Southwest 812. A year earlier, mechanics on this same aircraft had replaced two cracked clips on S-4L, the stringer under that seam, one of them just 24 inches from where the skin later tore. Across the fleet, the number of 737 Classics reporting skin cracks on stringer 4 went from 9 to 18 to 31 ✓ between 2008 and 2010. |
| L06 | M |  | Story 4: trend chart, then the ranks | Stringer 4 wasn't where most cracks were reported, but it was where they were rising fastest: second of 37 ✓ stringer lines, three months before the accident. |
| L07 | D |  | Story 5: the three backtest numbers | So does it predict accidents? No, and we tested that honestly. Across every NTSB event with earlier reports, a naive match looks three times better than chance; close two leaks and it falls to 0.9 ✓. Black Box finds leads worth a person's time, not causes. |
| L08 | D |  | Animation: the graph model builds up, counts tick | Under the hood is one FalkorDB graph: accidents, aircraft, maintenance reports, official documents, teams and engineers, all linked. They meet at the aircraft and at the exact location, from aircraft model down to a stringer and a 20-inch section. A quarter of a million nodes, half a million edges ✓. |
| L09 | D |  | Story 9 (Cypher, timings, the bug note), then MCP Inspector calling cracks_together | The agent never writes Cypher: it calls 26 MCP tools ✓, each a fixed query using multi-hop joins, shortest paths, connected components, full-text search, and a time machine that hides everything after the investigation date. Most answers take tens of milliseconds. Along the way we found a bug in FalkorDB's string range index, and reported it. And because these are MCP tools, any client can use them, like MCP Inspector here. |
| L10 | M |  | Board on 1 January 2011: Watch the fleet; hand S-4L to the investigator; cracks_together; the conclusion | Before anything goes wrong, Black Box can keep watch. A watcher agent ranks lines by how fast cracks are rising and saves alerts in the graph; on 1 January 2011, S-4L was one of them ✓, three months before the accident. An investigator agent picks it up and runs connected components over lines that crack on the same aircraft: S-4L's closest partner is S-4R ✓, the pair the FAA later ordered inspected together. |
| L11 | M |  | Board: the work order card; type a name, Dispatch; open Why this order? | That's Track 1. For Track 3, the same graph is a company brain: it knows who owns what and who knows what. The inspection order goes to the team that owns the fuselage, a person dispatches it to the engineer with the most experience on that line, and the why tool traces every decision back to its sources. |
| L12 | D |  | Board: click an S-4L cell, drag the slider past 5 April 2011, click it again | Its documents are dated too. The FAA's emergency order is split into paragraphs linked to the places they name: before 5 April 2011 this spot cites nothing; after it, the order's inspection paragraph ✓. |
| L13 | D |  | Story 8: Draft; type a name and reason; Approve | And people stay in charge. The agent can draft a new failure mode with its evidence attached, but it has no tool to approve one; a person decides, and who, when and why are saved in the graph. |
| L14 | M |  | Board on 1 January 2009: press Play and let the fleet map run to the accident | Black Box is for airline reliability engineers, safety teams and regulators: a short list of places worth inspecting, with the evidence attached. The same approach could work for any fleet with repair logs and incident reports. Black Box: warning signs in maintenance records, before the accident. |

Script v4 (Oct 18, 16:00, Manish): the problem, the pitch, how it works (animated: question, agent, MCP, graph, leads),
what it found, the honest test, the graph, FalkorDB, Track 1 (it acts), Track 3 (company brain), people decide, who it is for.
L09's bug sentence says "and reported it": file the issue before recording, or drop those words. Record every row.

## After recording

- Story step 8: press Reopen so the drafted mode goes back to "waiting for a person".
- Upload the video and put its link in the README and the submission form (Manish).
