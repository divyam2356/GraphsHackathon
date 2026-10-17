# Brief: real documents in the graph (Track 3)

For divyam2356's coding agent. Read `ROADMAP.md` first ("Tracks" and "Plan to the deadline"),
then this file. Feature freeze: **Oct 18, 12:00 IST**. Delete this folder at the freeze.

## Why

Track 3 (Company Brain) asks for "knowledge from docs, tickets, and chats in one graph",
"tracing decisions back to their source" and "answers with clear sources". Our company layer
(teams, engineers, task cards) is made up, and the graph holds no documents. This task loads
three real public documents about Southwest 812 into the graph, links every paragraph to the
places on the aircraft it talks about, and lets the agent and the UI cite them.

## The documents (US government works, public domain)

| Id | Document | Date to use | Where |
|---|---|---|---|
| `AD-2011-08-51` | FAA emergency airworthiness directive after the accident: inspections of the S-4L and S-4R lap joints | 2011-04-05 (issue date, as on our `FixOrder`) | Federal Register (search the AD number), or the FAA's DRS |
| `AD-2015-16-08` | The AD that supersedes it | 2015-08-25 (as on our `FixOrder`) | Federal Register |
| `NTSB-AAB-13-02` | NTSB accident brief for Southwest 812 (DCA11MA039) | the brief's adoption date (read it off the PDF) | ntsb.gov, accident reports, AAB-13/02 |

Federal Register API: `https://www.federalregister.gov/api/v1/documents.json?conditions[term]=...`
returns the document, its date and a link to the full text. Check every date against the
document itself; don't take a search snippet's word for it.

## What exists (read these before writing code)

- `services/ingest/src/fixorders.ts`: makes the two `FixOrder` nodes (`ad_no`, `date`,
  `APPLIES_TO` Model, `TARGETS` Location `737/53/S4L`, `SUPERSEDES`). Its header says bulk load
  from the Federal Register API is not built; that stays parked.
- `services/ingest/src/normalize.ts`: `locationChain({ family: "737", chapter: "53", text })`
  turns free text such as "S-4L lap joint" or "BS 639, STR 4L" into Location nodes (zone →
  stringer line → 20-inch bin). `normalize.test.ts` shows it on real SWA 812 text. Reuse it;
  don't write a second parser.
- `services/ingest/src/load.ts`: `flag`, `dataDir` (`data/raw`, gitignored), `requireDb`,
  `writeBatches`. Copy the shape of an existing ingest script.
- `packages/graph/queries/cypher.ts`: every query lives in `CYPHER` with `$params`. Append new
  edge types to `SCHEMA_EDGES`. `subgraph` (the evidence graph) unions one `MATCH` per label.
- `packages/mcp-server/src/tools.ts`: `tool(name, description, zodShape)`. The description is
  what the model reads, so say what the tool answers and the exact key formats.
- `packages/graph/src/run.ts`: `demo()` holds the offline fixture answers (`DEMO=1`).
- `apps/web/app/api/view/route.ts`: `VIEWS` whitelists queries the UI may call.
- `apps/web/components/RecordDrawer.tsx`: the drawer for a map cell (`kind: "bin"`) or a node.

## What to build

**Graph model**
```
(:Document {id, kind: 'AD' | 'NTSB brief', title, date, url})-[:HAS_SECTION]->
  (:Section {id: '<doc id>#<n>', heading, text, date, n})
(:Section)-[:ABOUT]->(:Location)       from locationChain on the section text (lines and bins)
(:Document)-[:DESCRIBES]->(:FixOrder)  by ad_no;   (:Document)-[:DESCRIBES]->(:Accident) by ev_id
```
A section's `date` is its document's date, so the time machine applies to citations too.
Keep the text verbatim: sources must be quotable. Use `MERGE`, so the ingest can be re-run.

**Milestones**
1. **Fetch.** Add the three downloads to `scripts/fetch-data.sh` (into `data/raw/docs/`, skip
   if present, like the others). Save the text as fetched. Done when the files are on disk and
   each date is checked against the document.
2. **Ingest.** `services/ingest/src/documents.ts` plus the script `ingest:documents` (in
   `services/ingest/package.json` and the root `package.json`). Split each document into sections
   (AD paragraphs (a), (b), … ; brief headings), link them, print counts. Add one focused test to
   `normalize.test.ts` or a new test file: the AD paragraph that names the S-4L and S-4R lap joints
   links to both lines. **Challenger check after this milestone.**
3. **Tool.** `cite_documents {bin, asOf}` in `cypher.ts` and `tools.ts`: sections about that
   location or inside it (a line also returns sections about its bins; a bin also returns
   sections about its line), dated before `asOf`, oldest first. Return doc id, kind, title,
   section id and heading, date, url, and the text trimmed to about 600 characters. Add
   `cite_documents` to `VIEWS`, a small `DEMO=1` fixture case in `run.ts`, and
   `UNION MATCH (n:Section) WHERE n.id IN coalesce($sections, []) RETURN n` to `subgraph`.
4. **Drawer.** In `RecordDrawer.tsx`, a "Documents about this location" list for a map cell and
   for a Location node (title, date, heading, text, link to the source). Add `Section` and
   `Document` to its `TITLES`. Add the new nodes, edges and tool to the README's graph model
   table and tool count. **Challenger check after this milestone.**

**Leave to Manish:** everything in `packages/agent/` (wiring the tool into the scripted method,
the agent's instructions and the evidence-graph keys). When the tool lands, tell Manish its name
and return fields.

## Constraints

- Fixed Cypher only, with parameters. The model never writes a query.
- FalkorDB is pinned to v4.14.6. **No range indexes on date strings**: with one, `d < 'X'`
  returned every row. Exact-match indexes on ids are fine. Queries must finish well under 1 s
  (the server's read timeout).
- Shared files (`cypher.ts`, `tools.ts`, `run.ts`, `api/view/route.ts`, `README.md`): add
  entries at the end; don't reformat or reorder. Pull `main` before you start and before each
  push; small commits.
- Ruled out: embeddings, summarising documents with a model, bulk AD loads, non-government sources.

## Done when

- `npm run ingest:documents` loads 3 documents and their sections, twice without duplicates.
- `cite_documents` for `737/53/S4L`: at `2011-04-01` returns nothing (no AD yet); at
  `2011-05-01` returns AD 2011-08-51 sections only; after the brief's date also returns brief
  sections. For `737/53/S24R` it returns nothing.
- The drawer screenshot for an S-4L cell at 2011-05-01 shows the AD paragraph.
- Typecheck passes (`npx tsc --noEmit -p apps/web`, and the packages you touched);
  `npm test --workspace services/ingest` passes; `npm run eval:all` gives the same results as before.

## Challenger check

Spawn the challenger as a subagent in your own harness, with fresh context: give it this brief,
the diff and the outputs, not your reasoning. Protocol:

> **Challenger protocol (after every milestone).** A challenger is a subagent that the executing
> agent spawns in its own harness, with fresh context and no memory of the build. Give it the
> brief, the diff and the outputs, not the builder's reasoning. Its job is to find what's wrong
> and what could be better, not to certify. A pass with no findings must still say what it
> attacked. Do four passes, and back every finding with evidence (a file:line, a command, a number):
> 1. **Reproduce.** Rerun two or three headline numbers or behaviours from scratch, with the
>    documented commands. A mismatch is blocking.
> 2. **Correctness.** Read the diff for bugs, data leakage, wrong denominators, off-by-ones and
>    unhandled inputs. Check that the tests test the claim, not merely that they pass. Run the
>    deliverable the way production runs it.
> 3. **Design.** Game it: build the cheapest degenerate solution and check the tests can't be
>    fooled by it. Check against reality: ground truth from outside the setup. Name the two or
>    three assumptions the result rests on, and test the riskiest one.
> 4. **Ideas.** At least two alternatives, each with expected impact and a quick check.
>
> **Report:** `challenge-<milestone>.md` with findings ranked blocking / should-fix / idea, each
> with evidence; "what I attacked and couldn't break"; a verdict. Before the next milestone the
> builder answers every finding: fixed (with proof), rebutted (with evidence) or deferred (with
> a reason).

Attacks specific to this task:
- **Degenerate tool:** a `cite_documents` that returns every section, whatever the location or
  date, passes the "AD at 2011-05-01" check. The negative checks (S-24R; before the AD; the brief
  before its date) must fail it.
- **Reality:** compare two or three section texts word for word with the Federal Register and
  the NTSB PDF; check both AD dates; check AD 2011-08-51's paragraph links to the lines its text
  names, and to no others.
- **Production path:** call the tool through the MCP server (stdio), not only `runTool`, and
  open the drawer in the running app.

## Keep a task list, then report

Keep `docs/briefs/track3-tasks.md` updated as you go (done, in progress, next), so a new session
can resume without rediscovering the code. At the end write `docs/briefs/track3-report.md`: what
was built (commits), the verification results above with their output, the challenger findings
and how each was answered, and anything left undone.
