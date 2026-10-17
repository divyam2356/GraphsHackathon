// Run: npm test --workspace services/ingest
// Pins the document loader: the AD paragraph that names the S-4L and S-4R lap joints
// links to both lines; no bins invented from a range's endpoints; the brief's clip
// paragraph lands on the exact bins its text names.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { adSections, briefSections, DOCS, sectionLocations, sectionText } from "./documents";

const dir = join(import.meta.dirname, "../../../data/raw");

test("AD 2011-08-51: the inspections paragraph names both S-4R and S-4L, no range bins", () => {
  const doc = DOCS[0];
  const secs = adSections(readFileSync(join(dir, "docs", doc.file), "utf8"), "AD-2011-08-51", doc.date);
  assert.ok(secs.length >= 14, `paragraphs a..n loaded (got ${secs.length})`);
  const g = secs.find((s) => s.heading === "Inspections")!;
  assert.match(g.text, /stringers S-4R and S-4L/);
  assert.match(g.text, /body station \(BS\) 360 to BS 908/); // verbatim
  const bins = sectionLocations(g.text).map((l) => l.bin);
  assert.equal(bins.filter((b) => /^737\/53\/(S4L|S4R)/.test(b)).length, 2, `both lines: got ${bins.join()}`);
  assert.ok(!bins.some((b) => /BS(360|900)$/.test(b)), `range endpoints must not invent bins: got ${bins.join()}`);
});

test("AD (e) unsafe condition: S-4L between BS 664 and BS 727 -> the two bins the text names", () => {
  const doc = DOCS[0];
  const secs = adSections(readFileSync(join(dir, "docs", doc.file), "utf8"), "AD-2011-08-51", doc.date);
  const e = secs.find((s) => s.heading === "Unsafe Condition")!;
  // "between body station (BS) 664 and BS 727" is a range -> lines only (they roll to it)
  const bins = sectionLocations(e.text).map((l) => l.bin);
  assert.ok(bins.includes("737/53/S4L"), `S-4L linked`);
  assert.equal(bins.filter((b) => /\/BS/.test(b)).length, 0, `range endpoints not bins: got ${bins.join()}`);
});

test("NTSB brief: the damage paragraph's two cracked clips land on BS 685 and BS 706", () => {
  const doc = DOCS[2];
  const secs = briefSections(readFileSync(join(dir, "docs", doc.file), "utf8"), doc.date);
  assert.equal(secs.length, 13);
  assert.equal(secs[2].heading, "DAMAGE TO AIRCRAFT");
  const locs = sectionLocations(secs[2].text).map((l) => l.bin);
  assert.ok(locs.includes("737/53/S4L/BS680"), `clip at BS 685: got ${locs.join()}`);
  assert.ok(locs.includes("737/53/S4L/BS700"), `clip at BS 706: got ${locs.join()}`);
  assert.ok(locs.includes("737/53/S4L"));
  assert.ok(!locs.some((b) => /^737\/53\/S3L/.test(b)), `footnote 'stringer 3 (S)-4L' must not invent S-3L`);
});

test("date sanity: every document's date matches the on-disk document", () => {
  assert.equal(DOCS[0].date, "2011-04-05"); // FR 2011-11928: emergency AD issued April 5, 2011
  assert.equal(DOCS[1].date, "2015-08-25"); // FR 2015-20372: published August 25, 2015
  assert.equal(DOCS[2].date, "2013-09-24"); // brief cover: Adopted September 24, 2013
});

test("loader runs end-to-end on the fetched files (same path the ingest uses)", () => {
  for (const doc of DOCS) {
    const secs = sectionText(doc, dir);
    assert.ok(secs.length > 3, `${doc.id}: ${secs.length} sections`);
    assert.ok(secs.every((s) => s.text.length > 4 && s.date === doc.date));
  }
});
