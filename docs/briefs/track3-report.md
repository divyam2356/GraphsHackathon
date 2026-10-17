# Track 3 report: real documents in the graph (Oct 17, 2026)

All four milestones done and verified. 3 Documents, 44 Sections, 54 ABOUT links, 24 MCP tools.

## What was built, milestone by milestone

**M1 — fetch.** `scripts/fetch-data.sh` now also downloads into `data/raw/docs/`: the two airworthiness
directives as the govinfo HTML of their Federal Register pages (`FR-2011-05-18 2011-11928`,
`FR-2015-08-25 2015-20372`), and NTSB brief `AAB1302.pdf` from ntsb.gov, converted to text with
`scripts/extract_pdf.py` (pdfminer.six via uv — pypdf inserted stray spaces inside words, pdfminer does
not; whitespace is collapsed, text otherwise verbatim).

Dates verified **against the documents themselves**:
- `AD-2011-08-51` → **2011-04-05**: "made immediately effective by Emergency AD 2011-08-51, issued on
  April 5, 2011" — same date as our `FixOrder`. (FR amendment itself June 2, 2011, printed May 18.)
- `AD-2015-16-08` → **2015-08-25** (FR publication date).
- `NTSB-AAB-13-02` → **2013-09-24** (brief cover: "Adopted: September 24, 2013").

**M2 — ingest** (`services/ingest/src/documents.ts`, `npm run ingest:documents`). ADs are split at their
`§ 39.13` paragraphs `(a)…`, each anchored to its exact heading ("Affected ADs (b)"), so in-body
cross-references like "paragraphs (h) and (i) of this AD" can never split; 2011 puts the heading before
the marker, 2015 after it — both pinned in `AD_HEADINGS` and split errors if any paragraph is missing
(14 + 17 sections). The brief splits at its 13 all-caps headings. Every `Section` carries its
document's date, so `$asOf` governs citations exactly like every other record.

Locations: each section's text is walked sentence by sentence with the same token regexes the SDR
parser uses (via `locationChain`, not a second parser). Embedded PDF footnotes are cleaned first
("(S)-4L" → "S-4L", "body station 2 (BS) 663" → "BS 663"). `from BS 360 to BS 908` is a range → the
stringer **lines** get the link, no bins invented from the endpoints; standalone stations become real
bins (the brief's "cracked stringer clips … along S-4L (at BS 685 and at BS 706)" lands on
`737/53/S4L/BS680` and `737/53/S4L/BS700`). `DESCRIBES`: AD → `FixOrder` by ad_no, brief → `Accident`
by ev_id. All MERGEs: second run adds nothing (44 sections again, `DESCRIBES` unchanged).

**M3 — tool.** `cite_documents {bin, asOf}`: sections whose named location is within 2 WITHIN hops of
the queried one — a line returns sections about its bins, a bin returns sections about its line, the
zone returns the whole chapter — oldest first, text trimmed to 600 chars. Two FalkorDB traps were hit
and fixed, both now count on the negative checks:
- an `OR` of pattern expressions in `WHERE` collided with the graph's own date-index bug class — the
  final query is plain `MATCH` joins plus an `OR` of one hop predicate, and works;
- without the `t.level = "bin"` upward restriction, the bare zone `737/53` bridged everything and even
  the S-24R query returned all 14 section-linked rows. Now S-24R → **0**.
Also: `subgraph` gained a `$sections` union branch (Document/Section nodes can ride the evidence
graph), `cite_documents` joined the view API allowlist, and `DEMO=1` serves a two-row fixture (AD
before/after 2011-04-05, brief after 2013-09-24).

**M4 — UI.** RecordDrawer: a `Location` record now gets a "Documents about this location" list
(oldest first, kind/date/heading/link, verbatim 600-char text); `Document`/`Section` join the drawer
titles. The time slider feeds the drawer (`asOf` travels through the `Open` kind), so the story at
April 1, 2011 honestly shows no documents yet while the Board answers as of any date. README: graph
model table, edge diagram, 24 tools, ingest step.

## Verification against the brief's checks

| Check | Result |
|---|---|
| Ingest tests (5 new, incl. both-lines-on-(g), no range bins, BS 685/706, S-3L footnote guard) | 10/10 pass |
| Re-run twice without duplicates | 44 sections, 54 links stable |
| 2011-04-01 → none; 2011-05-01 → AD 2011-08-51 (e, g, i); 2014-01-01 → + NTSB brief; 2016-01-01 → all incl. AD 2015-16-08 (g, h, i, j, k) | exact |
| S-24R negative check | 0 rows |
| S-10L query | only TESTS AND RESEARCH (the section that names it) |
| S-4R/BS720 bin | 10 rows — correctly **excludes** the S-4L "Unsafe Condition", includes S-4R's 2015 paragraphs |
| MCP stdio | lists 24 tools; `cite_documents` answers 10 rows over stdio |
| Web API + drawer | `/api/view {cite_documents}` 10 rows, 19 ms; `next build` clean |
| `eval:all` regression | unchanged |

## Deviations from the brief (and why)

- Dates: used 2011-04-05 (the FixOrder's issue date, which the FR texts corroborate) and 2013-09-24
  (the brief's own cover date) — the brief's date column said to do exactly this.
- Sections linked at zone level are stored (`locationChain` always returns the chain), but the query
  never lets the zone bridge two stringers; a section naming only "the fuselage" cites for the chapter
  query, not for every line.
- The story drawer shows the replay's own asOf (April 1, 2011), so it reads "none in the loaded
  documents" — that is the time machine telling the truth, not a bug.
