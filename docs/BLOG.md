# Blog draft (side prize: AirPods 5)

Title: The plane told us twice — we just weren't joining the tables.

SWA 812 (Apr 2011): crown skin rupture at S-4L. Same tail had stringer-clip cracks
at STR 4L a year earlier. Fleet-wide, ~67 crown-skin S-4 reports preceded it
(rough filter — gouges included, clean before quoting). Per-plane the signal is
thin (68 events/17y); model x location is where it screams.

What we built: one FalkorDB graph (NTSB + FAA reports + fix orders + learned
failure modes + fictional Northwind Aero), an MCP server with fixed Cypher so the
agent can't hallucinate queries, formula scoring the LLM can't override, human
approval on every new failure mode, and time-machine backtests instead of vibes.

Hard lesson: the join alone is not the answer (UPS 1354/SWA 1380 false matches;
EC135 "warning" was the accident itself). The agent judges relevance; dormant
modes keep collecting evidence instead of being deleted.

Framing: leads worth review, never causes. The NTSB determines causes.
