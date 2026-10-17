# Track 3 task list (real documents in the graph)

- [x] M1 Fetch: three documents into `data/raw/docs/` (AD 2011-08-51, AD 2015-16-08, NTSB AAB-13/02), dates checked against documents (FR amendment May 18 2011 confirms emergency AD issued April 5 2011; FR 2015-20372 published Aug 25 2015; brief cover reads "Adopted: September 24, 2013") — fetch-data.sh extended + scripts/extract_pdf.py (pdfminer)
- [x] M2 Ingest: `services/ingest/src/documents.ts` + `ingest:documents` scripts; 3 Documents, 44 Sections, 54 ABOUT links, DESCRIBES to 2 FixOrders + 1 Accident; focused test (5 tests incl. both-lines-on-(g), no range bins, BS 685/706 clips, S-3L footnote guard); idempotent re-run
- [x] M3 Tool: `cite_documents {bin, asOf}` in cypher.ts + tools.ts (24 tools); added to VIEWS, DEMO fixture, subgraph ($sections). Semantics pinned by negative check: S-24R → 0 rows (the zone must not bridge); bin sees its line, line sees its bins, zone sees all 14
- [x] M4 Drawer: "Documents about this location" in RecordDrawer (asOf passed through from page time slider); TITLES for Section/Document; README graph model table + 24 tools + ingest step
- [x] Verify: re-run twice w/o dupes (44 sections); date checks (2011-04-01 none / 2011-05-01 AD / 2014-01-01 + brief / 2016-01-01 all; S-24R none); next build + mcp-server tsc clean; ingest tests 10/10; eval:all unchanged
- [x] Challenger passes per milestone + `track3-report.md` written
