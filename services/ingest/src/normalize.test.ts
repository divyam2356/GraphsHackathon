// Run: npm test --workspace services/ingest
// Pins the joins NTSB <-> FAA reports depend on, using the SWA 812 records.
import { test } from "node:test";
import assert from "node:assert/strict";
import { aircraftId, familyOf, isoDate, locationChain, serialOf, tailOf, variantOf } from "./normalize";

test("NTSB and SDR spellings of the same aircraft meet", () => {
  // NTSB: regis_no N632SW, model "737", series "300", serial "27707"; SDR: "632SW", "7373H4", "27707"
  assert.equal(aircraftId(tailOf("N632SW"), serialOf("27707")), aircraftId(tailOf("632SW"), serialOf("027707")));
  assert.equal(familyOf("737"), familyOf("7373H4"));
  assert.equal(variantOf("7373H4"), "737-300");
  assert.equal(variantOf("737", "300"), "737-300");
  assert.equal(familyOf("CL-600-2B19"), familyOf("CL6002B19"));
  assert.equal(familyOf("A319112"), "A320");
});

test("dates from both sources", () => {
  assert.equal(isoDate("2011-04-01 00:00:00"), "2011-04-01");
  assert.equal(isoDate("03/09/2010"), "2010-03-09");
  assert.equal(isoDate(""), null);
});

test("structured station + stringer -> bin within line within zone", () => {
  const c = locationChain({ family: "737", chapter: "53", station: "727A", stringer: "4", side: "L" });
  assert.deepEqual(c.map((l) => l.bin), ["737/53/S4L/BS720", "737/53/S4L", "737/53"]);
  assert.equal(c[0].parent, "737/53/S4L");
});

test("text fallback: NTSB cause 'S-4L lap joint' lands on the same line as the reports", () => {
  const c = locationChain({ family: "737", chapter: "53", text: "fuselage crown skin panel at the S-4L lap joint" });
  assert.equal(c[0].bin, "737/53/S4L");
  const r = locationChain({ family: "737", chapter: "53", text: "FOUND STRINGER CLIP CRACKED AT BS 639, STR 4L." });
  assert.equal(r[0].bin, "737/53/S4L/BS620");
});

test("no location detail -> zone; wing station -> wing line", () => {
  assert.deepEqual(locationChain({ family: "737", chapter: "32" }).map((l) => l.bin), ["737/32"]);
  assert.equal(locationChain({ family: "737", chapter: "57", wingStation: "562.39", wingSide: "L" })[0].bin, "737/57/WL/WS560");
});
