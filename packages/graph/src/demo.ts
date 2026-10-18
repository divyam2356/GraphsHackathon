// Demo seed: the SWA-812 story + fleet + fix chain + org, sized to run without downloads.
// Full ingest (services/ingest) replaces/extends this with real NTSB+FAA CSVs.
export const DEMO = {
  // Real public records (NTSB DCA11MA039, FAA SDR, Federal Register). Checked Oct 15 2026.
  accidents: [
    { ev_id: "20110401X24330", ntsb_no: "DCA11MA039", tail: "N632SW", family: "737", date: "2011-04-01", phase: "climb",
      narrative: "rapid decompression, fuselage crown skin rupture",
      cause: "the improper installation of the fuselage crown skin panel at the S-4L lap joint during the manufacturing process, which resulted in multiple site damage fatigue cracking and eventual failure of the lower skin panel",
      findings: [{ finding: "Aircraft-Aircraft structures-Fuselage-Fuselage main structure-Incorrect service/maintenance", kind: "cause", chapter: "53", at: "737/53/S4L" }] },
  ],
  priorReports: [
    { id: "SWAA101399", tail: "N632SW", bin: "737/53/S4L/BS620", date: "2010-03-09", text: "DURING SCHEDULED 14Y CHECK, FOUND STRINGER CLIP CRACKED AT BS 639, STR 4L.  REMOVED AND REPLACED CLIP PER SRM." },
    { id: "SWAA101400", tail: "N632SW", bin: "737/53/S4L/BS720", date: "2010-03-09", text: "DURING SCHEDULED 14Y CHECK, FOUND STRINGER CLIP CRACKED AT BS 727A, STR 4L.  REMOVED AND REPLACED CLIP PER SRM." },
  ],
  fleetNote: "51 737-300/-400/-500 aircraft reported skin cracks on the S-4L/S-4R lap lines Jan 2008–Mar 2011 (186 reports, FAA SDR station/stringer fields); 47 more Apr–Dec 2011. Per year 9 / 18 / 31 aircraft (2008/09/10) while other fuselage lines stayed flat (~180–210)",
  fixOrders: [
    // AD 2015-16-08 (FR 2015-20372, effective 2015-09-29) supersedes emergency AD 2011-08-51
    // (issued 2011-04-05: eddy current inspections of the S-4L and S-4R lap joints, BS 360–908).
    // bin: the line the accident tore open; also: the other lines the AD text orders inspected.
    { ad: "AD-2015-16-08", date: "2015-08-25", family: "737", bin: "737/53/S4L", also: ["737/53/S4R"], replaces: ["AD-2011-08-51"] },
    { ad: "AD-2011-08-51", date: "2011-04-05", family: "737", bin: "737/53/S4L", also: ["737/53/S4R"], replaces: [] },
  ],
  failureModes: [
    // known_from: the first public record of the mode. Leads ranking only offers a mode to
    // investigations dated after it, so replaying SWA 812 never sees the mode it produced.
    // Crown S-4L: emergency AD 2011-08-51 (5 Apr 2011, after the accident).
    { id: "FM-CROWN-S4L", name: "737 crown-skin lap-joint cracking (S-4L)", system: "53",
      mechanism: "fatigue cracking at lap joint, stringer 4 left", status: "confirmed", origin: "seed",
      family: "737", known_from: "2011-04-05", sig: [{ bin: "737/53/S4L", w: 1 }, { bin: "737/53/S4R", w: 0.8 }] },
    // Fan blade: Southwest 3472 fan-blade separation, NTSB DCA16FA217 (27 Aug 2016, in the graph).
    { id: "FM-ENG-FAN", name: "CFM56 fan-blade fatigue", system: "72",
      mechanism: "low-cycle fatigue, blade dovetail", status: "confirmed", origin: "seed",
      family: "737", known_from: "2016-08-27", sig: [{ bin: "737/72", w: 1 }] },
    // Demo-only candidate for the dormant flow; not a real finding.
    { id: "FM-DOOR-AFT", name: "aft cargo door frame cracking (demo candidate)", system: "52",
      mechanism: "unconfirmed demo candidate", status: "dormant", origin: "observation",
      family: "737", sig: [{ bin: "737/52", w: 0.5 }], decision_reason: "demo: too little evidence so far" },
  ],
  org: {
    teams: ["Structures", "Propulsion", "Avionics"],
    engineers: ["A. Rao", "M. Chen", "J. Okafor", "S. Iyer", "L. Park"],
    taskCards: [{ id: "TC-53-041", title: "S-4L lap-joint inspection", cites: "AD-2015-16-08" }],
  },
};
